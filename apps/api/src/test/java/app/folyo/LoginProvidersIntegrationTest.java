package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Prod'daki gibi yalniz bir saglayici dolu, digeri bos: uygulama acilmali ve bos olan listelenmemeli. */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
        "folyo.login.github.client-id=gh-id", "folyo.login.github.client-secret=gh-secret",
        "folyo.login.google.client-id=", "folyo.login.google.client-secret="})
@AutoConfigureMockMvc
class LoginProvidersIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    JdbcClient jdbc;

    @Test
    void onlyConfiguredProvidersAreOfferedAndNextSurvivesTheRedirect() throws Exception {
        mvc.perform(get("/api/auth/providers"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0]").value("github"));

        MockHttpServletResponse response = mvc.perform(get("/oauth2/authorization/github")
                        .param("next", "/mobile-login?challenge=abc&redirect=folyo%3A%2F%2Fauth"))
                .andExpect(status().isFound())
                .andReturn().getResponse();
        assertThat(response.getHeader("Location"))
                .startsWith("https://github.com/login/oauth/authorize")
                .contains("client_id=gh-id")
                .contains("redirect_uri=http://localhost:3100/login/oauth2/code/github");

        // Oturum veritabaninda (Spring Session JDBC); donus yolu girisi tamamlayana kadar orada bekler.
        String sessionId = new String(java.util.Base64.getDecoder().decode(response.getCookie("SESSION").getValue()));
        assertThat(jdbc.sql("""
                        select count(*) from spring_session_attributes a join spring_session s
                          on s.primary_id = a.session_primary_id
                        where s.session_id = ? and a.attribute_name = 'folyo.login.next'""")
                .param(sessionId).query(Long.class).single()).isEqualTo(1);

        // Bos birakilan saglayiciya yonlendirme yapilmaz.
        assertThat(mvc.perform(get("/oauth2/authorization/google")).andReturn().getResponse().getStatus())
                .isNotEqualTo(302);
    }
}

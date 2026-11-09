package app.folyo;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Kurallar kabul edilmeden paylasim ve mesaj yok; istemci "code" alanina bakip kurallari gosterir. */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "folyo.moderation.require-rules=true")
@AutoConfigureMockMvc
class CommunityRulesIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    @Test
    void writingRequiresAcceptingTheCommunityRulesOnce() throws Exception {
        var person = new Users(userService, jdbc).verified();
        mvc.perform(post("/api/me/profile").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + Users.uniqueName() + "\",\"displayName\":\"Kurallar\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        mvc.perform(get("/api/me").with(person.auth())).andExpect(jsonPath("$.user.rulesAccepted").value(false));

        mvc.perform(post("/api/me/posts").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"merhaba\"}")
                        .with(person.auth()).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("RULES_REQUIRED"));

        mvc.perform(post("/api/me/rules/accept").with(person.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me").with(person.auth())).andExpect(jsonPath("$.user.rulesAccepted").value(true));
        mvc.perform(post("/api/me/posts").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"merhaba\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
    }
}

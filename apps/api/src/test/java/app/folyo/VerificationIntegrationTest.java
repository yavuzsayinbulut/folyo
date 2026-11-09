package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import app.folyo.verification.CodeGenerator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VerificationIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    @MockitoBean
    CodeGenerator codes;

    Users users;

    @BeforeEach
    void setUp() {
        users = new Users(userService, jdbc);
        given(codes.next()).willReturn("123456");
    }

    @Test
    void emailAndPhoneVerificationMakeTheAccountVerified() throws Exception {
        var person = users.unverified();
        mvc.perform(get("/api/me/verification").with(person.auth()))
                .andExpect(jsonPath("$.verified").value(false))
                .andExpect(jsonPath("$.requireEmail").value(true))
                .andExpect(jsonPath("$.requirePhone").value(true))
                .andExpect(jsonPath("$.emailAvailable").value(true))
                .andExpect(jsonPath("$.phoneAvailable").value(true));

        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"ada@Example.TEST\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isAccepted());
        // Bir dakika dolmadan yeni kod istenemez.
        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"ada@example.test\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isTooManyRequests());
        mvc.perform(json(post("/api/me/verification/email/confirm"), "{\"code\":\"000000\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Kod hatalı"));
        mvc.perform(json(post("/api/me/verification/email/confirm"), "{\"code\":\"123 456\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("ada@example.test"))
                .andExpect(jsonPath("$.emailVerified").value(true))
                .andExpect(jsonPath("$.verified").value(false));
        // Kod tek kullanimlik.
        mvc.perform(json(post("/api/me/verification/email/confirm"), "{\"code\":\"123456\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"0555 123 45 67\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isAccepted());
        assertThat(jdbc.sql("select target from verification_codes where user_id = ? and channel = 'PHONE'")
                .param(person.id()).query(String.class).single()).isEqualTo("+905551234567");
        // Kodun kendisi saklanmaz.
        assertThat(jdbc.sql("select count(*) from verification_codes where code_hash like '%123456%'")
                .query(Long.class).single()).isZero();
        mvc.perform(json(post("/api/me/verification/phone/confirm"), "{\"code\":\"123456\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneVerified").value(true))
                .andExpect(jsonPath("$.phone").value("+90 5•• ••• •• 67"))
                .andExpect(jsonPath("$.verified").value(true));
        mvc.perform(get("/api/me").with(person.auth())).andExpect(jsonPath("$.user.verified").value(true));

        // Ayni numara baska hesapta dogrulanamaz.
        var other = users.unverified();
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"+905551234567\"}").with(other.auth()).with(csrf()))
                .andExpect(status().isConflict());
    }

    @Test
    void wrongCodesBurnTheCodeAndInvalidInputIsRejected() throws Exception {
        var person = users.unverified();
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"12\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"yok\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"+905559876543\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isAccepted());
        for (int i = 0; i < 5; i++) {
            mvc.perform(json(post("/api/me/verification/phone/confirm"), "{\"code\":\"999999\"}").with(person.auth()).with(csrf()))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(json(post("/api/me/verification/phone/confirm"), "{\"code\":\"123456\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Çok fazla yanlış deneme, yeni kod iste"));
        mvc.perform(get("/api/me/verification").with(person.auth())).andExpect(jsonPath("$.phoneVerified").value(false));
        mvc.perform(json(post("/api/me/verification/phone/confirm"), "{\"code\":\"123456\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void verifyingTheConfiguredAdminEmailGrantsAdmin() throws Exception {
        var person = users.unverified();
        mvc.perform(get("/api/admin/settings").with(person.auth())).andExpect(status().isForbidden());
        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"admin@folyo.test\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isAccepted());
        mvc.perform(json(post("/api/me/verification/email/confirm"), "{\"code\":\"123456\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(get("/api/me").with(person.auth())).andExpect(jsonPath("$.user.admin").value(true));
        mvc.perform(get("/api/admin/settings").with(person.auth())).andExpect(status().isOk());
    }

    @Test
    void abuseIsLimitedForForeignNumbersLookupsAndEmailVariants() throws Exception {
        // Yalniz izinli ulke numaralarina SMS gider (varsayilan +90).
        var person = users.unverified();
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"+4915123456789\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        // Baska hesapta dogrulanmis numarayi sormak siklik sinirina sayilir: art arda sorgulanamaz.
        var owner = users.verified();
        String takenPhone = jdbc.sql("select phone from users where id = ?").param(owner.id()).query(String.class).single();
        var prober = users.unverified();
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"" + takenPhone + "\"}").with(prober.auth()).with(csrf()))
                .andExpect(status().isConflict());
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"+905550001122\"}").with(prober.auth()).with(csrf()))
                .andExpect(status().isTooManyRequests());

        // Ayni e-posta buyuk/kucuk harf ya da +etiketle cogaltilip gunluk sinir asilamaz.
        String[] variants = {"kurban@example.test", "Kurban@example.test", "KURBAN@example.test", "kurban+1@example.test",
                "kurban+2@Example.test"};
        for (String variant : variants) {
            mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"" + variant + "\"}")
                    .with(users.unverified().auth()).with(csrf())).andExpect(status().isAccepted());
        }
        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"kUrBaN+3@example.test\"}")
                .with(users.unverified().auth()).with(csrf())).andExpect(status().isTooManyRequests());
    }

    @Test
    void codeVerifiedEmailIsNotReplacedByTheNextOAuthLogin() throws Exception {
        String subject = java.util.UUID.randomUUID().toString();
        var user = userService.signIn("google", subject, "eski@example.test", true, "Ada", null);
        mvc.perform(json(post("/api/me/verification/email"), "{\"email\":\"yeni@example.test\"}")
                .with(users.auth(user)).with(csrf())).andExpect(status().isAccepted());
        mvc.perform(json(post("/api/me/verification/email/confirm"), "{\"code\":\"123456\"}")
                .with(users.auth(user)).with(csrf())).andExpect(status().isOk());
        userService.signIn("google", subject, "eski@example.test", true, "Ada", null);
        assertThat(jdbc.sql("select email from users where id = ?").param(user.getId()).query(String.class).single())
                .isEqualTo("yeni@example.test");
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

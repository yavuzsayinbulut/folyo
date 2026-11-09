package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AdminIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    Users users;
    Users.Person admin;

    @BeforeEach
    void setUp() {
        users = new Users(userService, jdbc);
        admin = users.unverified();
        jdbc.sql("update users set email = 'admin@folyo.test', email_verified_at = now() where id = ?")
                .param(admin.id()).update();
        userService.refreshRole(admin.id());
    }

    /** Diger testler varsayilan ayarlarla calisir; ayarlar servis uzerinden yazilir ki onbellek de tazelensin. */
    @AfterEach
    void resetSettings() throws Exception {
        mvc.perform(json(put("/api/admin/settings/sms"), "{\"provider\":\"LOG\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/email"), "{\"provider\":\"LOG\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/policy"), "{\"requireEmail\":true,\"requirePhone\":true}")
                .with(admin.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/storage"), "{\"provider\":\"LOCAL\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
    }

    @Test
    void onlyAdminsSeeAndChangeSettings() throws Exception {
        var user = users.verified();
        mvc.perform(get("/api/admin/settings").with(user.auth())).andExpect(status().isForbidden());
        mvc.perform(json(put("/api/admin/settings/policy"), "{\"requireEmail\":false,\"requirePhone\":false}")
                .with(user.auth()).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/settings")).andExpect(status().isUnauthorized());

        mvc.perform(get("/api/admin/settings").with(admin.auth()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sms.provider").value("LOG"))
                .andExpect(jsonPath("$.email.provider").value("LOG"))
                .andExpect(jsonPath("$.policy.requirePhone").value(true))
                .andExpect(jsonPath("$.allowLog").value(true));
    }

    @Test
    void adminRightsFollowTheConfiguredListOnEveryRequest() throws Exception {
        // Rolu veritabaninda ADMIN kalsa da listede olmayan e-posta yonetici sayilmaz.
        var former = users.verified();
        jdbc.sql("update users set role = 'ADMIN' where id = ?").param(former.id()).update();
        mvc.perform(get("/api/admin/settings").with(former.auth())).andExpect(status().isForbidden());
        mvc.perform(get("/api/me").with(former.auth())).andExpect(jsonPath("$.user.admin").value(false));
    }

    @Test
    void changingTheAccountRequiresTheSecretAgainAndSmsBudgetIsEnforced() throws Exception {
        mvc.perform(json(put("/api/admin/settings/email"),
                        "{\"provider\":\"SMTP\",\"smtp\":{\"host\":\"smtp.a.test\",\"username\":\"u\",\"from\":\"a@example.test\",\"password\":\"p1\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/email"),
                        "{\"provider\":\"SMTP\",\"smtp\":{\"host\":\"smtp.saldirgan.test\",\"username\":\"u\",\"from\":\"a@example.test\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(json(put("/api/admin/settings/policy"),
                        "{\"requireEmail\":true,\"requirePhone\":true,\"phoneCountries\":[\"+90\"],\"smsDailyLimit\":1}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.policy.smsDailyLimit").value(1));
        jdbc.sql("delete from verification_codes where channel = 'PHONE'").update();
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"05557770001\"}")
                .with(users.unverified().auth()).with(csrf())).andExpect(status().isAccepted());
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"05557770002\"}")
                .with(users.unverified().auth()).with(csrf())).andExpect(status().isServiceUnavailable());
    }

    @Test
    void secretsAreValidatedEncryptedAndNeverReturned() throws Exception {
        mvc.perform(json(put("/api/admin/settings/sms"), "{\"provider\":\"TWILIO\",\"twilio\":{\"accountSid\":\"AC1\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/admin/settings/sms"),
                        "{\"provider\":\"TWILIO\",\"twilio\":{\"accountSid\":\"AC123\",\"from\":\"+15005550006\",\"authToken\":\"cok-gizli-token\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sms.provider").value("TWILIO"))
                .andExpect(jsonPath("$.sms.twilio.accountSid").value("AC123"))
                .andExpect(jsonPath("$.sms.twilio.authTokenSet").value(true))
                .andExpect(jsonPath("$.sms.twilio.authToken").doesNotExist())
                .andExpect(jsonPath("$.sms.twilio.authTokenEnc").doesNotExist());
        assertThat(jdbc.sql("select value::text from platform_settings where key = 'sms'").query(String.class).single())
                .doesNotContain("cok-gizli-token");

        // Token bos gonderilirse mevcut deger korunur (yalniz gonderen numara degisir).
        mvc.perform(json(put("/api/admin/settings/sms"),
                        "{\"provider\":\"TWILIO\",\"twilio\":{\"accountSid\":\"AC123\",\"from\":\"+15005550007\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sms.twilio.authTokenSet").value(true))
                .andExpect(jsonPath("$.sms.twilio.from").value("+15005550007"));

        mvc.perform(json(put("/api/admin/settings/email"), "{\"provider\":\"SMTP\",\"smtp\":{\"host\":\"smtp.example.test\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/admin/settings/email"),
                        "{\"provider\":\"SMTP\",\"smtp\":{\"host\":\"smtp.example.test\",\"port\":587,\"username\":\"u\",\"from\":\"no-reply@example.test\",\"password\":\"smtp-parola\"}}")
                        .with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email.smtp.passwordSet").value(true))
                .andExpect(jsonPath("$.email.smtp.startTls").value(true));
        assertThat(jdbc.sql("select value::text from platform_settings where key = 'email'").query(String.class).single())
                .doesNotContain("smtp-parola");
    }

    @Test
    void policyDecidesWhoCountsAsVerifiedAndWarnsOnConflicts() throws Exception {
        var emailOnly = users.unverified();
        jdbc.sql("update users set email = 'a@example.test', email_verified_at = now() where id = ?")
                .param(emailOnly.id()).update();
        mvc.perform(get("/api/me").with(emailOnly.auth())).andExpect(jsonPath("$.user.verified").value(false));

        mvc.perform(json(put("/api/admin/settings/policy"), "{\"requireEmail\":true,\"requirePhone\":false}")
                .with(admin.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/me").with(emailOnly.auth())).andExpect(jsonPath("$.user.verified").value(true));

        mvc.perform(json(put("/api/admin/settings/policy"), "{\"requireEmail\":true,\"requirePhone\":true}")
                .with(admin.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/sms"), "{\"provider\":\"OFF\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warnings[0]").value(org.hamcrest.Matchers.startsWith("Telefon doğrulaması zorunlu")));
        mvc.perform(get("/api/me/verification").with(emailOnly.auth())).andExpect(jsonPath("$.phoneAvailable").value(false));
        mvc.perform(json(post("/api/me/verification/phone"), "{\"phone\":\"05551112233\"}").with(emailOnly.auth()).with(csrf()))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void testMessagesGoThroughTheSelectedProvider() throws Exception {
        mvc.perform(json(post("/api/admin/settings/sms/test"), "{\"phone\":\"05551112233\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(json(post("/api/admin/settings/email/test"), "{\"email\":\"ops@example.test\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(json(put("/api/admin/settings/email"), "{\"provider\":\"OFF\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
        mvc.perform(json(post("/api/admin/settings/email/test"), "{\"email\":\"ops@example.test\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void storageIsChosenByTheAdminAndItsSecretIsNeverReturned() throws Exception {
        mvc.perform(get("/api/admin/settings").with(admin.auth())).andExpect(jsonPath("$.storage.provider").value("LOCAL"));
        mvc.perform(post("/api/admin/settings/storage/test").with(admin.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(post("/api/admin/settings/storage/test").with(users.verified().auth()).with(csrf()))
                .andExpect(status().isForbidden());

        mvc.perform(json(put("/api/admin/settings/storage"), "{\"provider\":\"S3\",\"s3\":{\"bucket\":\"folyo\"}}")
                .with(admin.auth()).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/admin/settings/storage"), """
                {"provider":"S3","s3":{"endpoint":"ftp://depo.example.test","bucket":"folyo","accessKey":"AK","secretKey":"s"}}""")
                .with(admin.auth()).with(csrf())).andExpect(status().isBadRequest());
        String saved = mvc.perform(json(put("/api/admin/settings/storage"), """
                {"provider":"LOCAL","s3":{"endpoint":"https://depo.example.test","region":"auto","bucket":"folyo",
                 "accessKey":"AK","secretKey":"cok-gizli-anahtar","pathStyle":true}}""").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.storage.provider").value("LOCAL"))
                .andExpect(jsonPath("$.storage.s3.bucket").value("folyo"))
                .andExpect(jsonPath("$.storage.s3.secretKeySet").value(true))
                .andReturn().getResponse().getContentAsString();
        assertThat(saved).doesNotContain("cok-gizli-anahtar");
        assertThat(jdbc.sql("select value::text from platform_settings where key = 'storage'").query(String.class).single())
                .doesNotContain("cok-gizli-anahtar");
        // Ayni hesap: gizli anahtar yeniden girilmeden S3'e gecilebilir. Hesap degisirse yeniden istenir.
        mvc.perform(json(put("/api/admin/settings/storage"), """
                {"provider":"S3","s3":{"endpoint":"https://depo.example.test","bucket":"folyo","accessKey":"AK"}}""")
                .with(admin.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(json(put("/api/admin/settings/storage"), """
                {"provider":"S3","s3":{"endpoint":"https://depo.example.test","bucket":"folyo","accessKey":"BASKA"}}""")
                .with(admin.auth()).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/admin/settings/storage"), "{\"provider\":\"LOCAL\"}").with(admin.auth()).with(csrf()))
                .andExpect(status().isOk());
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
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

/** Sikayet, otomatik gizleme, yonetici karari, askiya alma ve ifade filtresi. */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ModerationIntegrationTest {

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
        jdbc.sql("update users set email = 'admin@folyo.test', email_verified_at = now() where id = ?").param(admin.id()).update();
        userService.refreshRole(admin.id());
    }

    @AfterEach
    void reset() throws Exception {
        policy("[]", 3, 20);
    }

    @Test
    void reportsAreCheckedAndEnoughReportsHideThePostUntilReviewed() throws Exception {
        String name = Users.uniqueName();
        var author = withPage(users.verified(), name);
        String postId = publish(author, "Şikayet edilecek gönderi");

        mvc.perform(report(author, "POST", postId, "SPAM")).andExpect(status().isBadRequest());
        mvc.perform(report(users.verified(), "POST", "00000000-0000-0000-0000-000000000000", "SPAM")).andExpect(status().isNotFound());
        var first = users.verified();
        mvc.perform(report(first, "POST", postId, "SPAM")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.hidden").value(false));
        mvc.perform(report(first, "POST", postId, "HATE")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.alreadyReported").value(true));
        mvc.perform(report(users.verified(), "POST", postId, "HARASSMENT")).andExpect(jsonPath("$.hidden").value(false));
        mvc.perform(report(users.verified(), "POST", postId, "HARASSMENT")).andExpect(jsonPath("$.hidden").value(true));

        // Gizlendi: baskalari goremez, yazar "HIDDEN" olarak gorur, Kesfet'te yok.
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/posts/" + postId).with(author.auth())).andExpect(jsonPath("$.post.status").value("HIDDEN"));

        String queue = mvc.perform(get("/api/admin/reports").with(admin.auth())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Map<String, Object> group = group(queue, postId);
        assertThat(group.get("count")).isEqualTo(3);
        assertThat(group.get("hidden")).isEqualTo(true);
        assertThat((String) group.get("snapshot")).contains("Şikayet edilecek");
        mvc.perform(get("/api/admin/reports").with(users.verified().auth())).andExpect(status().isForbidden());

        // Uygun bulundu: geri acilir.
        resolve("POST", postId, "DISMISS", false);
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isOk());
        String resolved = mvc.perform(get("/api/admin/reports").param("status", "RESOLVED").with(admin.auth()))
                .andReturn().getResponse().getContentAsString();
        assertThat(group(resolved, postId).get("status")).isEqualTo("DISMISSED");

        // Yeni sikayet, bu kez kaldirma ve yazari askiya alma.
        mvc.perform(report(first, "POST", postId, "SPAM")).andExpect(status().isCreated());
        resolve("POST", postId, "REMOVE", true);
        mvc.perform(get("/api/public/posts/" + postId).with(author.auth())).andExpect(status().isNotFound());
        mvc.perform(json(post("/api/me/posts"), "{\"body\":\"askıda\"}").with(author.auth()).with(csrf()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("SUSPENDED"));
        mvc.perform(get("/api/me").with(author.auth())).andExpect(jsonPath("$.user.suspended").value(true));
        mvc.perform(get("/api/admin/suspensions").with(admin.auth()))
                .andExpect(jsonPath("$[?(@.userId == '" + author.id() + "')]", hasSize(1)));

        mvc.perform(delete("/api/admin/users/" + author.id() + "/suspension").with(admin.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        publish(author, "geri döndüm");
    }

    @Test
    void messagesProfilesAndGuestbookEntriesCanBeReported() throws Exception {
        String ownerName = Users.uniqueName();
        var owner = withPage(users.verified(), ownerName);
        var sender = users.verified();
        String started = mvc.perform(json(post("/api/profiles/" + ownerName + "/messages"), "{\"body\":\"rahatsız edici mesaj\"}")
                .with(sender.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String conversation = JsonPath.read(started, "$.conversationId");
        String messageId = String.valueOf((Integer) JsonPath.read(started, "$.message.id"));

        // Gonderen kendi mesajini, sohbet disindaki biri hic sikayet edemez.
        mvc.perform(report(sender, "MESSAGE", messageId, "HARASSMENT")).andExpect(status().isNotFound());
        mvc.perform(report(users.verified(), "MESSAGE", messageId, "HARASSMENT")).andExpect(status().isNotFound());
        mvc.perform(json(post("/api/me/reports"), """
                {"targetType":"MESSAGE","targetId":"%s","reason":"HARASSMENT","note":"Sürekli yazıyor","block":true}"""
                .formatted(messageId)).with(owner.auth()).with(csrf())).andExpect(status().isCreated());
        // Sikayetle birlikte engellendi.
        mvc.perform(json(post("/api/me/conversations/" + conversation + "/messages"), "{\"body\":\"yine ben\"}")
                .with(sender.auth()).with(csrf())).andExpect(status().isForbidden());
        resolve("MESSAGE", messageId, "REMOVE", false);
        mvc.perform(get("/api/me/conversations/" + conversation).with(owner.auth()))
                .andExpect(jsonPath("$.messages[0].deleted").value(true));

        // Sayfa sikayeti: kaldirilamaz, yalniz sahibi askiya alinabilir.
        mvc.perform(report(users.verified(), "PROFILE", ownerName, "IMPERSONATION")).andExpect(status().isCreated());
        mvc.perform(json(post("/api/admin/reports/resolve"), """
                {"targetType":"PROFILE","targetId":"%s","action":"REMOVE"}""".formatted(ownerName))
                .with(admin.auth()).with(csrf())).andExpect(status().isBadRequest());
        resolve("PROFILE", ownerName, "DISMISS", false);

        // Defter: esik 1 iken tek sikayet gizler, uygun bulununca geri gelir.
        policy("[]", 1, 20);
        var visitor = users.verified();
        String entry = JsonPath.read(mvc.perform(json(post("/api/profiles/" + ownerName + "/guestbook"), "{\"body\":\"defter yazısı\"}")
                .with(visitor.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(report(owner, "GUESTBOOK", entry, "SPAM")).andExpect(jsonPath("$.hidden").value(true));
        mvc.perform(get("/api/public/profiles/" + ownerName + "/guestbook")).andExpect(jsonPath("$", hasSize(0)));
        resolve("GUESTBOOK", entry, "DISMISS", false);
        mvc.perform(get("/api/public/profiles/" + ownerName + "/guestbook")).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void blockedWordsAreRejectedAndReportsHaveADailyLimit() throws Exception {
        policy("[\"kötüsöz\"]", 3, 2);
        var author = withPage(users.verified(), Users.uniqueName());
        mvc.perform(json(post("/api/me/posts"), "{\"body\":\"Bu bir K0TÜSÖZ!\"}").with(author.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        // Kelimenin parcasi olarak gecmesi engellenmez.
        publish(author, "kötüsözlük üzerine bir yazı");

        var reporter = users.verified();
        for (int i = 0; i < 2; i++) {
            String id = publish(author, "gönderi " + i);
            mvc.perform(report(reporter, "POST", id, "SPAM")).andExpect(status().isCreated());
        }
        String third = publish(author, "üçüncü");
        mvc.perform(report(reporter, "POST", third, "SPAM")).andExpect(status().isTooManyRequests());
    }

    // --- yardimcilar ---

    private static Map<String, Object> group(String json, String targetId) {
        List<Map<String, Object>> matches = JsonPath.read(json, "$[?(@.targetId == '" + targetId + "')]");
        assertThat(matches).hasSize(1);
        return matches.getFirst();
    }

    private void policy(String words, int threshold, int daily) throws Exception {
        mvc.perform(json(put("/api/admin/settings/moderation"),
                "{\"blockedWords\":" + words + ",\"autoHideThreshold\":" + threshold + ",\"dailyReportLimit\":" + daily + "}")
                .with(admin.auth()).with(csrf())).andExpect(status().isOk());
    }

    private void resolve(String type, String id, String action, boolean suspend) throws Exception {
        mvc.perform(json(post("/api/admin/reports/resolve"), """
                {"targetType":"%s","targetId":"%s","action":"%s","suspendAuthor":%s}""".formatted(type, id, action, suspend))
                .with(admin.auth()).with(csrf())).andExpect(status().isNoContent());
    }

    private MockHttpServletRequestBuilder report(Users.Person reporter, String type, String id, String reason) {
        return json(post("/api/me/reports"), "{\"targetType\":\"" + type + "\",\"targetId\":\"" + id + "\",\"reason\":\"" + reason + "\"}")
                .with(reporter.auth()).with(csrf());
    }

    private String publish(Users.Person author, String body) throws Exception {
        return JsonPath.read(mvc.perform(json(post("/api/me/posts"), "{\"body\":\"" + body + "\"}").with(author.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private Users.Person withPage(Users.Person person, String username) throws Exception {
        mvc.perform(json(post("/api/me/profile"), "{\"username\":\"" + username + "\",\"displayName\":\"Sahip\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        return person;
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

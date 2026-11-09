package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import app.folyo.media.PhotoFixtures;
import com.jayway.jsonpath.JsonPath;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ChatIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    Users users;

    @BeforeEach
    void setUp() {
        users = new Users(userService, jdbc);
    }

    @Test
    void verifiedVisitorStartsAChatAndTicksFollowDeliveryAndReading() throws Exception {
        String bName = Users.uniqueName();
        var b = withPage(users.unverified(), bName);
        var a = users.verified();

        mvc.perform(json(post("/api/profiles/" + bName + "/messages"), "{\"body\":\"Merhaba\"}")
                        .with(users.unverified().auth()).with(csrf()))
                .andExpect(status().isForbidden());

        String started = mvc.perform(json(post("/api/profiles/" + bName + "/messages"), "{\"body\":\"Merhaba, nasılsın?\"}")
                        .with(a.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message.seq").value(1))
                .andExpect(jsonPath("$.message.mine").value(true))
                .andReturn().getResponse().getContentAsString();
        String conversation = JsonPath.read(started, "$.conversationId");

        // Alici listeyi acmadan once: tek tik (yalniz sunucuda).
        mvc.perform(get("/api/me/conversations/" + conversation).with(a.auth()))
                .andExpect(jsonPath("$.conversation.otherDeliveredSeq").value(0));
        mvc.perform(get("/api/me/conversations/unread").with(b.auth())).andExpect(jsonPath("$.chats").value(1));
        mvc.perform(get("/api/me/conversations").with(b.auth()))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].unread").value(1))
                .andExpect(jsonPath("$[0].other.userId").value(a.id().toString()))
                .andExpect(jsonPath("$[0].lastMessage.body").value("Merhaba, nasılsın?"));
        // Liste acildi: cift tik.
        mvc.perform(get("/api/me/conversations/" + conversation).with(a.auth()))
                .andExpect(jsonPath("$.conversation.otherDeliveredSeq").value(1))
                .andExpect(jsonPath("$.conversation.otherReadSeq").value(0));
        mvc.perform(json(post("/api/me/conversations/" + conversation + "/read"), "{\"seq\":1}").with(b.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        // Okundu: mavi tik.
        mvc.perform(get("/api/me/conversations/" + conversation).with(a.auth()))
                .andExpect(jsonPath("$.conversation.otherReadSeq").value(1));
        mvc.perform(get("/api/me/conversations/unread").with(b.auth())).andExpect(jsonPath("$.chats").value(0));

        // Sohbeti A baslatti: B dogrulanmamis olsa da yanit verebilir.
        mvc.perform(json(post("/api/me/conversations/" + conversation + "/messages"), "{\"kind\":\"TEXT\",\"body\":\"İyiyim!\"}")
                        .with(b.auth()).with(csrf()))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.seq").value(2));
        mvc.perform(get("/api/me/conversations/" + conversation).with(a.auth()))
                .andExpect(jsonPath("$.messages", hasSize(2)))
                .andExpect(jsonPath("$.messages[1].body").value("İyiyim!"))
                .andExpect(jsonPath("$.messages[1].mine").value(false));

        // Okundu bilgisini kapatan, karsi tarafinkini de goremez (ve kendisininki gitmez).
        mvc.perform(json(put("/api/me/chat-settings"), "{\"lastSeenAudience\":\"EVERYONE\",\"readReceipts\":false}")
                .with(b.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations/" + conversation).with(a.auth()))
                .andExpect(jsonPath("$.conversation.otherReadSeq").value(nullValue()));
        mvc.perform(get("/api/me/conversations/" + conversation).with(b.auth()))
                .andExpect(jsonPath("$.conversation.otherReadSeq").value(nullValue()));

        // Baskasi sohbeti goremez.
        mvc.perform(get("/api/me/conversations/" + conversation).with(users.verified().auth())).andExpect(status().isNotFound());
    }

    @Test
    void requestsAreLimitedUntilAcceptedAndBlocksStopMessages() throws Exception {
        String bName = Users.uniqueName();
        var b = withPage(users.verified(), bName);
        mvc.perform(json(put("/api/me/privacy"), """
                {"indexable":true,"profile":"EVERYONE","location":"EVERYONE","localTime":"EVERYONE","activity":"EVERYONE",
                 "guestbook":"EVERYONE","comments":"VERIFIED","messages":"APPROVAL"}""").with(b.auth()).with(csrf()))
                .andExpect(status().isOk());
        var a = users.verified();
        String conversation = JsonPath.read(mvc.perform(json(post("/api/profiles/" + bName + "/messages"), "{\"body\":\"1\"}")
                .with(a.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.conversationId");
        mvc.perform(get("/api/me/conversations?folder=REQUESTS").with(b.auth())).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/me/conversations/unread").with(b.auth())).andExpect(jsonPath("$.requests").value(1));

        String url = "/api/me/conversations/" + conversation + "/messages";
        for (int i = 2; i <= 5; i++) {
            mvc.perform(json(post(url), "{\"body\":\"" + i + "\"}").with(a.auth()).with(csrf())).andExpect(status().isCreated());
        }
        mvc.perform(json(post(url), "{\"body\":\"6\"}").with(a.auth()).with(csrf())).andExpect(status().isTooManyRequests());

        // Yanit veren istegi kabul etmis olur.
        mvc.perform(json(post(url), "{\"body\":\"Kabul\"}").with(b.auth()).with(csrf())).andExpect(status().isCreated());
        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(json(post(url), "{\"body\":\"6\"}").with(a.auth()).with(csrf())).andExpect(status().isCreated());

        mvc.perform(post("/api/me/conversations/" + conversation + "/block").with(b.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(json(post(url), "{\"body\":\"engelli\"}").with(a.auth()).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/me/conversations?folder=ARCHIVE").with(b.auth())).andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(delete("/api/me/blocks/" + a.id()).with(b.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(json(post(url), "{\"body\":\"tekrar\"}").with(a.auth()).with(csrf())).andExpect(status().isCreated());
        // Yeni mesaj arsivdeki sohbeti geri getirir.
        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void retriesAreIdempotentAndSenderCanDeleteForEveryone() throws Exception {
        String bName = Users.uniqueName();
        var b = withPage(users.verified(), bName);
        var a = users.verified();
        String conversation = startedBy(a, bName);
        String url = "/api/me/conversations/" + conversation + "/messages";

        String first = mvc.perform(json(post(url), "{\"clientId\":\"c-1\",\"body\":\"bir kez\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String again = mvc.perform(json(post(url), "{\"clientId\":\"c-1\",\"body\":\"bir kez\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        assertThat((Object) JsonPath.read(again, "$.id")).isEqualTo(JsonPath.read(first, "$.id"));
        mvc.perform(get("/api/me/conversations/" + conversation).with(b.auth())).andExpect(jsonPath("$.messages", hasSize(2)));

        Number id = JsonPath.read(first, "$.id");
        mvc.perform(delete(url + "/" + id).with(b.auth()).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete(url + "/" + id).with(a.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me/conversations/" + conversation).with(b.auth()))
                .andExpect(jsonPath("$.messages[1].deleted").value(true))
                .andExpect(jsonPath("$.messages[1].body").value(nullValue()));
    }

    @Test
    void photosAndStickersAreSharedOnlyWithTheConversation() throws Exception {
        String bName = Users.uniqueName();
        var b = withPage(users.verified(), bName);
        var a = users.verified();
        String conversation = startedBy(a, bName);
        String url = "/api/me/conversations/" + conversation + "/messages";

        String asset = upload(a, PhotoFixtures.jpegWithExifOrientation(400, 300, 1));
        // Baskasinin yuklemesi gonderilemez.
        mvc.perform(json(post(url), "{\"kind\":\"PHOTO\",\"assetId\":\"" + asset + "\"}").with(b.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(post(url), "{\"kind\":\"PHOTO\",\"assetId\":\"" + asset + "\",\"body\":\"Bak\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.asset.url").value("/api/public/assets/" + asset + "/original"));
        mvc.perform(get("/api/public/assets/" + asset + "/original").with(b.auth())).andExpect(status().isOk());
        mvc.perform(get("/api/public/assets/" + asset + "/original").with(users.verified().auth())).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/assets/" + asset + "/original")).andExpect(status().isNotFound());
        // Ayni yukleme ikinci kez kullanilamaz.
        mvc.perform(json(post(url), "{\"kind\":\"PHOTO\",\"assetId\":\"" + asset + "\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(json(post(url), "{\"kind\":\"STICKER\",\"sticker\":\"selamlar/merhaba\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stickerUrl").value("/api/public/stickers/selamlar/merhaba.svg"));
        mvc.perform(json(post(url), "{\"kind\":\"STICKER\",\"sticker\":\"../../etc/passwd\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        BufferedImage image = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
        var png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);
        String own = JsonPath.read(mvc.perform(multipart("/api/me/stickers")
                        .file(new MockMultipartFile("file", "s.png", "image/png", png.toByteArray())).with(a.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(json(post(url), "{\"kind\":\"STICKER\",\"assetId\":\"" + own + "\"}").with(a.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stickerUrl").value("/api/public/assets/" + own + "/sticker"));
        mvc.perform(get("/api/public/stickers").with(a.auth()))
                .andExpect(jsonPath("$.packs", hasSize(2)))
                .andExpect(jsonPath("$.mine", hasSize(1)));
        mvc.perform(get("/api/public/stickers/selamlar/merhaba.svg"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Content-Security-Policy", org.hamcrest.Matchers.containsString("default-src 'none'")));
        // JPEG sticker olamaz (seffaflik yok).
        mvc.perform(multipart("/api/me/stickers").file(new MockMultipartFile("file", "s.jpg", "image/jpeg",
                PhotoFixtures.jpegWithExifOrientation(64, 64, 1))).with(a.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void presenceFollowsTheTargetsChoice() throws Exception {
        String bName = Users.uniqueName();
        var b = withPage(users.verified(), bName);
        var a = users.verified();
        String conversation = startedBy(a, bName);
        mvc.perform(json(post("/api/me/conversations/" + conversation + "/messages"), "{\"body\":\"selam\"}")
                .with(b.auth()).with(csrf())).andExpect(status().isCreated());

        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$[0].presence.online").value(false));
        mvc.perform(json(put("/api/me/chat-settings"), "{\"lastSeenAudience\":\"NOBODY\",\"readReceipts\":true}")
                .with(a.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$[0].presence").value(nullValue()));
        // Kendininkini gizleyen baskasininkini de goremez.
        mvc.perform(get("/api/me/conversations").with(a.auth())).andExpect(jsonPath("$[0].presence").value(nullValue()));
        mvc.perform(json(put("/api/me/chat-settings"), "{\"lastSeenAudience\":\"CHATS\",\"readReceipts\":true}")
                .with(a.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/me/conversations").with(b.auth())).andExpect(jsonPath("$[0].presence.online").value(false));
        mvc.perform(json(patch("/api/me/conversations/" + conversation), "{\"state\":\"ARCHIVED\"}").with(b.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/me/conversations?folder=ARCHIVE").with(b.auth())).andExpect(jsonPath("$", hasSize(1)));
    }

    // --- yardimcilar ---

    private String startedBy(Users.Person sender, String username) throws Exception {
        return JsonPath.read(mvc.perform(json(post("/api/profiles/" + username + "/messages"), "{\"body\":\"Merhaba\"}")
                .with(sender.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.conversationId");
    }

    private String upload(Users.Person owner, byte[] jpeg) throws Exception {
        return JsonPath.read(mvc.perform(multipart("/api/me/assets/photos")
                        .file(new MockMultipartFile("file", "a.jpg", "image/jpeg", jpeg)).with(owner.auth()).with(csrf()))
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

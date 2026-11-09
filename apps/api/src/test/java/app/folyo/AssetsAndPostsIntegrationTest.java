package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.asset.VideoFixtures;
import app.folyo.auth.UserService;
import app.folyo.media.PhotoFixtures;
import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
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
class AssetsAndPostsIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    @TempDir
    Path dir;

    Users users;

    @BeforeEach
    void setUp() {
        users = new Users(userService, jdbc);
    }

    @Test
    void profilePhotoIsPublicAndReplacingItRemovesTheOldOne() throws Exception {
        var me = users.unverified();
        String first = avatar(me, PhotoFixtures.jpegWithExifOrientation(900, 600, 1));
        assertThat(first).startsWith("/api/public/assets/").endsWith("/avatar");
        mvc.perform(get("/api/me").with(me.auth())).andExpect(jsonPath("$.user.avatarUrl").value(first));
        byte[] square = mvc.perform(get(first)).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andReturn().getResponse().getContentAsByteArray();
        var image = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(square));
        assertThat(image.getWidth()).isEqualTo(image.getHeight());
        assertThat(new String(square, StandardCharsets.ISO_8859_1)).doesNotContain("GPS");

        String second = avatar(me, PhotoFixtures.jpegWithExifOrientation(300, 300, 1));
        assertThat(second).isNotEqualTo(first);
        mvc.perform(get(first)).andExpect(status().isNotFound());

        mvc.perform(delete("/api/me/avatar").with(me.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/me").with(me.auth())).andExpect(jsonPath("$.user.avatarUrl").value(nullValue()));
        mvc.perform(get(second)).andExpect(status().isNotFound());
    }

    @Test
    void photosKeepFullQualityWithoutLocationAndFollowThePostAudience() throws Exception {
        String name = Users.uniqueName();
        var author = withPage(users.verified(), name);
        byte[] jpeg = PhotoFixtures.jpegWithExifOrientation(2400, 1200, 1);
        String upload = mvc.perform(multipart("/api/me/assets/photos")
                        .file(new MockMultipartFile("file", "a.jpg", "image/jpeg", jpeg)).with(author.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.width").value(2400))
                .andExpect(jsonPath("$.height").value(1200))
                .andReturn().getResponse().getContentAsString();
        String asset = JsonPath.read(upload, "$.id");
        String original = JsonPath.read(upload, "$.url");
        // Yuklenen ama paylasilmayan dosyayi yalniz sahibi gorur.
        mvc.perform(get(original)).andExpect(status().isNotFound());
        mvc.perform(get(original).with(users.verified().auth())).andExpect(status().isNotFound());
        byte[] stored = mvc.perform(get(original).with(author.auth())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        // Kalite: goruntu verisi bayt bayt ayni; yalniz konum notu (EXIF) atildi.
        assertThat(new String(stored, StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
        assertThat(stored.length).isLessThan(jpeg.length).isGreaterThan(jpeg.length - 200);
        assertThat(tail(stored, 4096)).isEqualTo(tail(jpeg, 4096));

        String post = createPost(author, "{\"body\":\"Yalnız doğrulanmışlara\",\"audience\":\"VERIFIED\",\"mediaIds\":[\"" + asset + "\"]}");
        String postId = JsonPath.read(post, "$.id");
        assertThat((String) JsonPath.read(post, "$.media[0].largeUrl")).endsWith("/large");
        mvc.perform(get(original)).andExpect(status().isNotFound());
        mvc.perform(get(original).with(users.unverified().auth())).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(status().isNotFound());
        mvc.perform(get(original).with(users.verified().auth())).andExpect(status().isOk());
        mvc.perform(get("/api/public/assets/" + asset + "/large").with(users.verified().auth()))
                .andExpect(status().isOk());
        // Aralikli okuma.
        mvc.perform(get(original).with(users.verified().auth()).header("Range", "bytes=0-99"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", startsWith("bytes 0-99/")))
                .andExpect(header().longValue("Content-Length", 100));
        // Ayni dosya ikinci bir gonderiye eklenemez.
        mvc.perform(json(post("/api/me/posts"), "{\"mediaIds\":[\"" + asset + "\"]}").with(author.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        mvc.perform(delete("/api/me/posts/" + postId).with(author.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get(original).with(author.auth())).andExpect(status().isNotFound());
        assertThat(jdbc.sql("select count(*) from media_assets where id = cast(:id as uuid)").param("id", asset)
                .query(Long.class).single()).isZero();
    }

    @Test
    void videosAreRemuxedWithoutReencodingAndStreamInRanges() throws Exception {
        String name = Users.uniqueName();
        var author = withPage(users.verified(), name);
        Path video = VideoFixtures.mp4WithLocation(dir, 2);
        String upload = mvc.perform(multipart("/api/me/assets/videos")
                        .file(new MockMultipartFile("file", "v.mp4", "video/mp4", Files.readAllBytes(video)))
                        .with(author.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.kind").value("VIDEO"))
                .andExpect(jsonPath("$.contentType").value("video/mp4"))
                .andReturn().getResponse().getContentAsString();
        String asset = JsonPath.read(upload, "$.id");
        assertThat((Integer) JsonPath.read(upload, "$.durationMs")).isBetween(1500, 2500);
        assertThat((String) JsonPath.read(upload, "$.posterUrl")).endsWith("/poster");

        String photo = JsonPath.read(mvc.perform(multipart("/api/me/assets/photos")
                        .file(new MockMultipartFile("file", "a.jpg", "image/jpeg", PhotoFixtures.jpegWithExifOrientation(50, 50, 1)))
                        .with(author.auth()).with(csrf()))
                .andReturn().getResponse().getContentAsString(), "$.id");
        // Video tek basina paylasilir.
        mvc.perform(json(post("/api/me/posts"), "{\"mediaIds\":[\"" + asset + "\",\"" + photo + "\"]}")
                        .with(author.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        String post = createPost(author, "{\"body\":\"Video\",\"mediaIds\":[\"" + asset + "\"]}");
        String url = JsonPath.read(post, "$.media[0].url");
        byte[] all = mvc.perform(get(url)).andExpect(status().isOk())
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(new String(all, StandardCharsets.ISO_8859_1)).doesNotContain("+41.0082");
        mvc.perform(get(url).header("Range", "bytes=-10"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes " + (all.length - 10) + "-" + (all.length - 1) + "/" + all.length));
        mvc.perform(get(url).header("Range", "bytes=" + all.length + "-"))
                .andExpect(status().isRequestedRangeNotSatisfiable());
        mvc.perform(get(JsonPath.<String>read(post, "$.media[0].posterUrl")))
                .andExpect(status().isOk()).andExpect(header().string("Content-Type", "image/jpeg"));
    }

    @Test
    void exploreShowsVerifiedAuthorsAndPagesWithACursor() throws Exception {
        var unverified = withPage(users.unverified(), Users.uniqueName());
        String hidden = JsonPath.read(createPost(unverified, "{\"body\":\"Doğrulanmamış\"}"), "$.id");
        String name = Users.uniqueName();
        var author = withPage(users.verified(), name);
        for (int i = 1; i <= 22; i++) {
            createPost(author, "{\"body\":\"Gönderi " + i + "\"}");
        }

        String explore = mvc.perform(get("/api/public/posts")).andExpect(status().isOk())
                .andExpect(jsonPath("$.posts", hasSize(20)))
                .andExpect(jsonPath("$.posts[0].body").value("Gönderi 22"))
                .andExpect(jsonPath("$.posts[0].author.verified").value(true))
                .andReturn().getResponse().getContentAsString();
        assertThat(JsonPath.<List<String>>read(explore, "$.posts[*].id")).doesNotContain(hidden);
        // Dogrulanmamis yazarin gonderisi kendi sayfasinda gorunur.
        mvc.perform(get("/api/public/profiles/" + unverifiedName(unverified) + "/posts"))
                .andExpect(jsonPath("$.posts[0].id").value(hidden))
                .andExpect(jsonPath("$.posts[0].author.verified").value(false));

        String first = mvc.perform(get("/api/public/profiles/" + name + "/posts"))
                .andExpect(jsonPath("$.posts", hasSize(20)))
                .andExpect(jsonPath("$.posts[0].body").value("Gönderi 22"))
                .andExpect(jsonPath("$.posts[0].mine").value(false))
                .andExpect(jsonPath("$.posts[0].audience").value(nullValue()))
                .andReturn().getResponse().getContentAsString();
        String next = JsonPath.read(first, "$.next");
        mvc.perform(get("/api/public/profiles/" + name + "/posts").param("cursor", next))
                .andExpect(jsonPath("$.posts", hasSize(2)))
                .andExpect(jsonPath("$.posts[0].body").value("Gönderi 2"))
                .andExpect(jsonPath("$.posts[1].body").value("Gönderi 1"))
                .andExpect(jsonPath("$.next").value(nullValue()));
        mvc.perform(get("/api/public/posts").param("cursor", "bozuk")).andExpect(status().isBadRequest());
    }

    @Test
    void likesCountOnceAndRepliesFollowTheCommentPolicy() throws Exception {
        String name = Users.uniqueName();
        var owner = withPage(users.verified(), name);
        String postId = JsonPath.read(createPost(owner, "{\"body\":\"Ne düşünüyorsunuz?\"}"), "$.id");
        var fan = users.verified();
        String like = "/api/me/posts/" + postId + "/like";
        mvc.perform(post(like).with(fan.auth()).with(csrf())).andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(post(like).with(fan.auth()).with(csrf()))
                .andExpect(jsonPath("$.likeCount").value(1))
                .andExpect(jsonPath("$.likedByMe").value(true));
        mvc.perform(delete(like).with(fan.auth()).with(csrf())).andExpect(jsonPath("$.likeCount").value(0));
        mvc.perform(post(like)).andExpect(status().isForbidden());

        // Varsayilan: yalniz dogrulanmislar yanit yazar.
        mvc.perform(json(post("/api/me/posts"), reply(postId, "Ben de!")).with(users.unverified().auth()).with(csrf()))
                .andExpect(status().isForbidden());
        // Yanit icin sayfa gerekmez; yazar olarak sayfa sahibi degil yanit yazan gorunur.
        mvc.perform(json(post("/api/me/posts"), reply(postId, "Harika")).with(fan.auth()).with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("VISIBLE"))
                .andExpect(jsonPath("$.author.username").value(nullValue()))
                .andExpect(jsonPath("$.author.displayName").value(fan.name()));

        mvc.perform(json(put("/api/me/privacy"), """
                {"indexable":true,"profile":"EVERYONE","location":"EVERYONE","localTime":"EVERYONE","activity":"EVERYONE",
                 "guestbook":"EVERYONE","comments":"APPROVAL","messages":"VERIFIED"}""").with(owner.auth()).with(csrf()))
                .andExpect(status().isOk());
        String pending = JsonPath.read(mvc.perform(json(post("/api/me/posts"), reply(postId, "Onay bekliyor"))
                        .with(fan.auth()).with(csrf()))
                .andExpect(jsonPath("$.status").value("PENDING")).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/public/posts/" + postId))
                .andExpect(jsonPath("$.post.replyCount").value(1))
                .andExpect(jsonPath("$.replies", hasSize(1)))
                .andExpect(jsonPath("$.repliesNeedApproval").value(true));
        mvc.perform(get("/api/public/posts/" + postId).with(owner.auth())).andExpect(jsonPath("$.replies", hasSize(2)));
        mvc.perform(post("/api/me/posts/" + pending + "/approve").with(fan.auth()).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(post("/api/me/posts/" + pending + "/approve").with(owner.auth()).with(csrf()))
                .andExpect(jsonPath("$.status").value("VISIBLE"));
        mvc.perform(get("/api/public/posts/" + postId))
                .andExpect(jsonPath("$.post.replyCount").value(2))
                .andExpect(jsonPath("$.replies", hasSize(2)))
                .andExpect(jsonPath("$.replies[1].canDelete").value(false));
        // Yanitlara yanit verilmez; sayfa sahibi yanitlari silebilir.
        mvc.perform(json(post("/api/me/posts"), reply(pending, "Alt yanıt")).with(owner.auth()).with(csrf()))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/me/posts/" + pending).with(owner.auth()).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/public/posts/" + postId)).andExpect(jsonPath("$.post.replyCount").value(1));
        // Profil akisinda yanitlar yer almaz.
        mvc.perform(get("/api/public/profiles/" + name + "/posts")).andExpect(jsonPath("$.posts", hasSize(1)));
    }

    // --- yardimcilar ---

    private final java.util.Map<java.util.UUID, String> names = new java.util.HashMap<>();

    private String unverifiedName(Users.Person person) {
        return names.get(person.id());
    }

    private String avatar(Users.Person person, byte[] jpeg) throws Exception {
        return JsonPath.read(mvc.perform(multipart(HttpMethod.PUT, "/api/me/avatar")
                        .file(new MockMultipartFile("file", "a.jpg", "image/jpeg", jpeg)).with(person.auth()).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.avatarUrl");
    }

    private String createPost(Users.Person author, String body) throws Exception {
        return mvc.perform(json(post("/api/me/posts"), body).with(author.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
    }

    private static String reply(String postId, String body) {
        return "{\"replyToId\":\"" + postId + "\",\"body\":\"" + body + "\"}";
    }

    private Users.Person withPage(Users.Person person, String username) throws Exception {
        mvc.perform(json(post("/api/me/profile"), "{\"username\":\"" + username + "\",\"displayName\":\"Sahip\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        names.put(person.id(), username);
        return person;
    }

    private static byte[] tail(byte[] bytes, int n) {
        return java.util.Arrays.copyOfRange(bytes, bytes.length - n, bytes.length);
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

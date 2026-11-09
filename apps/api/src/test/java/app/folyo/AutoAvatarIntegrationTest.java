package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.User;
import app.folyo.auth.UserService;
import app.folyo.avatar.AutoAvatarService;
import app.folyo.avatar.RemoteImages;
import app.folyo.media.PhotoFixtures;
import app.folyo.connection.ConnectionProvider;
import app.folyo.connection.ConnectionService;
import app.folyo.provider.SpotifyClient;
import com.jayway.jsonpath.JsonPath;
import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Otomatik profil gorseli: bagli platformlardan uretilir, gercek fotograf varsa o, yuklenen her zaman once. */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AutoAvatarIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    AutoAvatarService autoAvatars;

    @Autowired
    app.folyo.auth.UserRepository userRepository;

    @MockitoBean
    SpotifyClient spotify;

    @MockitoBean
    ConnectionService connections;

    @MockitoBean
    RemoteImages remote;

    Users users;

    @BeforeEach
    void setUp() {
        users = new Users(userService, jdbc);
    }

    @Test
    void linkedPlatformsProduceAnOriginalAvatar() throws Exception {
        var person = withPage(users.unverified());
        link(person, "https://www.instagram.com/ada");
        link(person, "https://open.spotify.com/user/ada");
        autoAvatars.refresh(person.id());

        String status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.auto.source")).isEqualTo("GENERATED");
        assertThat(JsonPath.<List<String>>read(status, "$.auto.platforms")).containsExactly("Instagram", "Spotify");
        String url = JsonPath.read(status, "$.auto.url");
        assertThat((String) JsonPath.read(status, "$.avatarUrl")).isEqualTo(url);
        byte[] image = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        var decoded = ImageIO.read(new ByteArrayInputStream(image));
        assertThat(decoded.getWidth()).isEqualTo(512).isEqualTo(decoded.getHeight());
        // Ad ve sayfadaki her yer ayni gorseli kullanir.
        mvc.perform(get("/api/public/profiles/" + username(person)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.avatarUrl").value(url));

        // Gizli ya da kitlesi kisitli kart gorseli degistirmez (herkese acik gorselden anlasilmasin).
        String hidden = link(person, "https://youtube.com/@ada");
        mvc.perform(json(patch("/api/me/cards/" + hidden), "{\"visible\":false}").with(person.auth()).with(csrf()))
                .andExpect(status().isOk());
        String restricted = link(person, "https://github.com/ada");
        mvc.perform(json(patch("/api/me/cards/" + restricted), "{\"audience\":\"VERIFIED\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isOk());
        autoAvatars.refresh(person.id());
        String after = avatar(person);
        assertThat(JsonPath.<List<String>>read(after, "$.auto.platforms")).containsExactly("Instagram", "Spotify");
        assertThat((String) JsonPath.read(after, "$.auto.source")).isEqualTo("GENERATED");
    }

    @Test
    void aRealPhotoFromAConnectedAccountComesFirstAndTemporaryFailuresAreRetried() throws Exception {
        var person = withPage(users.unverified());
        link(person, "https://www.instagram.com/octo");
        // Kullanici adiyla eklenen hesap (kanitlanmamis sahiplik) fotograf kaynagi olmaz.
        link(person, "https://github.com/torvalds");
        autoAvatars.refresh(person.id());
        assertThat((String) JsonPath.read(avatar(person), "$.auto.source")).isEqualTo("GENERATED");

        // OAuth ile baglanan Spotify'in fotografi; ilk deneme gecici hatayla duser.
        when(connections.isActive(any(), eq(ConnectionProvider.SPOTIFY))).thenReturn(true);
        when(connections.accessToken(any(), eq(ConnectionProvider.SPOTIFY))).thenReturn("erisim");
        when(spotify.profileImage("erisim")).thenReturn("https://i.scdn.co/image/ab67");
        when(remote.download(anyString())).thenThrow(new RemoteImages.Unavailable("ağ yok", null));
        mvc.perform(json(post("/api/me/cards"), "{\"type\":\"SPOTIFY\"}").with(person.auth()).with(csrf()))
                .andExpect(status().isCreated());
        autoAvatars.refresh(person.id());
        String status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.auto.source")).isEqualTo("GENERATED");
        assertThat(JsonPath.<List<String>>read(status, "$.auto.platforms")).containsExactly("Instagram", "GitHub", "Spotify");
        assertThat(retryAt(person.id())).isNotNull();

        // Yeniden deneme zamani gelince gercek fotograf alinir.
        doReturn(PhotoFixtures.jpegWithExifOrientation(460, 460, 1)).when(remote).download("https://i.scdn.co/image/ab67");
        jdbc.sql("update users set auto_avatar_retry_at = now() - interval '1 minute' where id = :id").param("id", person.id()).update();
        autoAvatars.refresh(person.id());
        status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.auto.source")).isEqualTo("SPOTIFY");
        assertThat(retryAt(person.id())).isNull();
        byte[] image = mvc.perform(get((String) JsonPath.read(status, "$.avatarUrl"))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray();
        // Konum bilgisi tasimaz.
        assertThat(new String(image, java.nio.charset.StandardCharsets.ISO_8859_1)).doesNotContain("GPS");
    }

    @Test
    void anUploadedPhotoWinsAndRemovingItReturnsToTheAutomaticOne() throws Exception {
        var person = withPage(users.unverified());
        link(person, "https://www.instagram.com/u");
        autoAvatars.refresh(person.id());
        String auto = JsonPath.read(avatar(person), "$.auto.url");

        String uploaded = JsonPath.read(mvc.perform(multipart(HttpMethod.PUT, "/api/me/avatar")
                        .file(new MockMultipartFile("file", "a.jpg", "image/jpeg", PhotoFixtures.jpegWithExifOrientation(300, 300, 1)))
                        .with(person.auth()).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.avatarUrl");
        String status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.avatarUrl")).isEqualTo(uploaded);
        assertThat((String) JsonPath.read(status, "$.uploadedUrl")).isEqualTo(uploaded);
        // Kart degisse de yuklenen kalir; otomatik gorsel arkada guncellenir.
        link(person, "https://open.spotify.com/user/u");
        autoAvatars.refresh(person.id());
        assertThat((String) JsonPath.read(avatar(person), "$.avatarUrl")).isEqualTo(uploaded);

        mvc.perform(delete("/api/me/avatar").with(person.auth()).with(csrf())).andExpect(status().isNoContent());
        status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.avatarUrl")).isEqualTo(JsonPath.read(status, "$.auto.url"));
        assertThat((String) JsonPath.read(status, "$.auto.url")).isNotEqualTo(auto);
        // Eski otomatik gorselin dosyasi silindi.
        mvc.perform(get(auto)).andExpect(status().isNotFound());
    }

    @Test
    void withoutLinkedPlatformsTheAccountPhotoStays() throws Exception {
        String accountPhoto = "https://lh3.googleusercontent.com/a/folyo-test";
        User user = userService.signIn("test", UUID.randomUUID().toString(), null, "Hesap Foto", accountPhoto);
        var person = new Users.Person(user.getId(), user.getName(), users.auth(user));
        withPage(person);
        autoAvatars.refresh(person.id());
        assertThat((String) JsonPath.read(avatar(person), "$.avatarUrl")).isEqualTo(accountPhoto);

        String card = link(person, "https://www.instagram.com/hf");
        autoAvatars.refresh(person.id());
        String auto = JsonPath.read(avatar(person), "$.auto.url");
        assertThat((String) JsonPath.read(avatar(person), "$.avatarUrl")).isEqualTo(auto);
        // Tekrar giris yapmak otomatik gorseli ezmez.
        userService.signIn("test", jdbc.sql("select auth_subject from users where id = :id").param("id", user.getId())
                .query(String.class).single(), null, "Hesap Foto", accountPhoto);
        assertThat((String) JsonPath.read(avatar(person), "$.avatarUrl")).isEqualTo(auto);

        mvc.perform(delete("/api/me/cards/" + card).with(person.auth()).with(csrf())).andExpect(status().isNoContent());
        autoAvatars.refresh(person.id());
        String status = avatar(person);
        assertThat((String) JsonPath.read(status, "$.avatarUrl")).isEqualTo(accountPhoto);
        assertThat((Object) JsonPath.read(status, "$.auto")).isNull();
        mvc.perform(get(auto)).andExpect(status().isNotFound());
    }

    @Test
    void imagesFromAnOlderVersionAreRebuiltInTheBackground() throws Exception {
        var person = withPage(users.unverified());
        link(person, "https://www.instagram.com/v");
        autoAvatars.refresh(person.id());
        assertThat(userRepository.autoAvatarPending("v1:%", 1000)).doesNotContain(person.id());
        jdbc.sql("update users set auto_avatar_key = 'v0:eski' where id = :id").param("id", person.id()).update();
        assertThat(userRepository.autoAvatarPending("v1:%", 1000)).contains(person.id());
    }

    // --- yardimcilar ---

    private String avatar(Users.Person person) throws Exception {
        return mvc.perform(get("/api/me/avatar").with(person.auth())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private String link(Users.Person person, String url) throws Exception {
        return JsonPath.read(mvc.perform(json(post("/api/me/cards"), "{\"type\":\"LINK\",\"config\":{\"url\":\"" + url + "\"}}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private java.sql.Timestamp retryAt(UUID userId) {
        return jdbc.sql("select auto_avatar_retry_at from users where id = :id").param("id", userId)
                .query(java.sql.Timestamp.class).optional().orElse(null);
    }

    private String username(Users.Person person) {
        return jdbc.sql("select username from profiles where user_id = :id").param("id", person.id()).query(String.class).single();
    }

    private Users.Person withPage(Users.Person person) throws Exception {
        mvc.perform(json(post("/api/me/profile"), "{\"username\":\"" + Users.uniqueName() + "\",\"displayName\":\"" + person.name() + "\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        return person;
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

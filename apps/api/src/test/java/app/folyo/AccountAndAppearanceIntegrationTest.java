package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.auth.UserService;
import app.folyo.config.FolyoProperties;
import app.folyo.media.PhotoFixtures;
import com.jayway.jsonpath.JsonPath;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AccountAndAppearanceIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    UserRepository users;

    @Autowired
    JdbcClient jdbc;

    @Autowired
    FolyoProperties properties;

    // --- gorunum ---

    @Test
    void appearanceIsSavedAndShownToVisitors() throws Exception {
        String username = uniqueName();
        Owner owner = userWithProfile(username);

        mvc.perform(get("/api/me").with(owner.auth()))
                .andExpect(jsonPath("$.profile.theme").value("CLASSIC"))
                .andExpect(jsonPath("$.profile.accent").doesNotExist());

        mvc.perform(json(put("/api/me/profile/appearance"), "{\"theme\":\"NIGHT\",\"accent\":\"GREEN\"}")
                        .with(owner.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.theme").value("NIGHT"))
                .andExpect(jsonPath("$.accent").value("GREEN"));
        mvc.perform(get("/api/public/profiles/" + username))
                .andExpect(jsonPath("$.theme").value("NIGHT"))
                .andExpect(jsonPath("$.accent").value("GREEN"));

        // Vurgu rengi kaldirilabilir; tema bos birakilamaz, bilinmeyen deger kabul edilmez.
        mvc.perform(json(put("/api/me/profile/appearance"), "{\"theme\":\"CORPORATE\",\"accent\":null}")
                        .with(owner.auth()).with(csrf()))
                .andExpect(jsonPath("$.theme").value("CORPORATE"))
                .andExpect(jsonPath("$.accent").doesNotExist());
        mvc.perform(json(put("/api/me/profile/appearance"), "{\"accent\":\"BLUE\"}").with(owner.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/me/profile/appearance"), "{\"theme\":\"NEON\"}").with(owner.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
        mvc.perform(json(put("/api/me/profile/appearance"), "{\"theme\":\"NIGHT\"}").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    // --- kullanici adi ---

    @Test
    void usernamesThatCollideWithWebFilesAreRejected() throws Exception {
        RequestPostProcessor user = newUser().auth();
        for (String name : List.of("icon.png", "robots.txt", "sitemap.xml", "favicon.ico", "selfie.jpeg", "gizlilik")) {
            mvc.perform(json(post("/api/me/profile"), claimBody(name)).with(user).with(csrf()))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(json(post("/api/me/profile"), claimBody("a" + uniqueName().substring(0, 8) + ".dev"))
                        .with(user).with(csrf()))
                .andExpect(status().isCreated());
    }

    // --- hesap silme ---

    @Test
    void deletingAccountRemovesProfileMessagesPhotosAndFiles() throws Exception {
        String username = uniqueName();
        Owner owner = userWithProfile(username);
        String otherName = uniqueName();
        Owner other = userWithProfile(otherName);

        String gallery = createCard(owner.auth(), "{\"type\":\"GALLERY\",\"config\":{\"title\":\"Tatil\"}}");
        var photo = new MockMultipartFile("file", "a.jpg", "image/jpeg", PhotoFixtures.jpegWithExifOrientation(400, 300, 1));
        mvc.perform(multipart("/api/me/cards/" + gallery + "/media").file(photo).with(owner.auth()).with(csrf()))
                .andExpect(status().isCreated());
        String storageKey = jdbc.sql("select m.storage_key from media m where m.card_id = ?")
                .param(UUID.fromString(gallery)).query(String.class).single();
        Path file = Path.of(properties.mediaDir()).resolve(storageKey);
        assertThat(file).exists();

        // Silinecek kullanicinin baska bir sayfaya biraktigi mesaj da gitmeli.
        mvc.perform(json(post("/api/profiles/" + otherName + "/guestbook"), "{\"body\":\"Merhaba komsu\"}")
                        .with(owner.auth()).with(csrf()))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/public/profiles/" + otherName + "/guestbook")).andExpect(jsonPath("$", hasSize(1)));

        mvc.perform(delete("/api/me/account")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/me/account").with(owner.auth()).with(csrf())).andExpect(status().isNoContent());

        assertThat(users.findById(owner.userId())).isEmpty();
        assertThat(file).doesNotExist();
        mvc.perform(get("/api/public/profiles/" + username)).andExpect(status().isNotFound());
        mvc.perform(get("/api/public/profiles/" + otherName + "/guestbook")).andExpect(jsonPath("$", hasSize(0)));
        assertThat(jdbc.sql("select count(*) from cards where id = ?").param(UUID.fromString(gallery))
                .query(Long.class).single()).isZero();
        // Diger kullanici etkilenmez.
        mvc.perform(get("/api/public/profiles/" + otherName)).andExpect(status().isOk());
        mvc.perform(get("/api/me").with(other.auth())).andExpect(jsonPath("$.profile.username").value(otherName));
    }

    // --- ziyaretci defteri ---

    @Test
    void oneAuthorCannotSpamManyPages() throws Exception {
        Owner author = newUser();
        for (int page = 0; page < 4; page++) {
            String target = uniqueName();
            userWithProfile(target);
            for (int i = 0; i < 5; i++) {
                mvc.perform(json(post("/api/profiles/" + target + "/guestbook"), "{\"body\":\"Mesaj " + i + "\"}")
                                .with(author.auth()).with(csrf()))
                        .andExpect(status().isCreated());
            }
        }
        String fifth = uniqueName();
        userWithProfile(fifth);
        mvc.perform(json(post("/api/profiles/" + fifth + "/guestbook"), "{\"body\":\"Bir tane daha\"}")
                        .with(author.auth()).with(csrf()))
                .andExpect(status().isTooManyRequests());
    }

    // --- yardimcilar ---

    private record Owner(UUID userId, RequestPostProcessor auth) {
    }

    private Owner newUser() {
        String subject = UUID.randomUUID().toString();
        User user = userService.signIn("test", subject, null, "Test " + subject.substring(0, 6), null);
        TestUsers.verify(jdbc, user.getId());
        var principal = new FolyoPrincipal(user.getId(), user.getName());
        return new Owner(user.getId(), authentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_USER")))));
    }

    private Owner userWithProfile(String username) throws Exception {
        Owner owner = newUser();
        mvc.perform(json(post("/api/me/profile"), claimBody(username)).with(owner.auth()).with(csrf()))
                .andExpect(status().isCreated());
        return owner;
    }

    private String createCard(RequestPostProcessor owner, String body) throws Exception {
        String response = mvc.perform(json(post("/api/me/cards"), body).with(owner).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.id");
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private static String claimBody(String username) {
        return "{\"username\":\"" + username + "\",\"displayName\":\"Sahip\"}";
    }

    private static String uniqueName() {
        return "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}

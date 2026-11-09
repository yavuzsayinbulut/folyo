package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
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
class PrivacyIntegrationTest {

    private static final String PRIVACY = """
            {"indexable":%s,"profile":"%s","location":"%s","localTime":"EVERYONE","activity":"EVERYONE",
             "guestbook":"%s","comments":"%s","messages":"%s"}""";

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

    // --- gizlilik ---

    @Test
    void profileAudienceDecidesWhoSeesThePage() throws Exception {
        String username = Users.uniqueName();
        var owner = withPage(users.verified(), username);
        String page = "/api/public/profiles/" + username;

        privacy(owner, true, "SIGNED_IN", "EVERYONE", "EVERYONE", "VERIFIED", "VERIFIED");
        mvc.perform(get(page)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.requirement").value("SIGNED_IN"))
                .andExpect(jsonPath("$.displayName").doesNotExist());
        mvc.perform(get(page).with(users.unverified().auth())).andExpect(status().isOk())
                .andExpect(jsonPath("$.indexable").value(false));

        privacy(owner, true, "VERIFIED", "EVERYONE", "EVERYONE", "VERIFIED", "VERIFIED");
        mvc.perform(get(page).with(users.unverified().auth())).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.requirement").value("VERIFIED"));
        mvc.perform(get(page).with(users.verified().auth())).andExpect(status().isOk());

        privacy(owner, true, "ONLY_ME", "EVERYONE", "EVERYONE", "VERIFIED", "VERIFIED");
        mvc.perform(get(page).with(users.verified().auth())).andExpect(status().isNotFound());
        mvc.perform(get(page).with(owner.auth())).andExpect(status().isOk());
        mvc.perform(json(post("/api/profiles/" + username + "/messages"), "{\"body\":\"Gizli sayfa\"}")
                        .with(users.verified().auth()).with(csrf()))
                .andExpect(status().isNotFound());

        mvc.perform(json(put("/api/me/privacy"), "{\"indexable\":true}").with(owner.auth()).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void sectionsCardsAndInteractionsFollowTheViewer() throws Exception {
        String username = Users.uniqueName();
        var owner = withPage(users.verified(), username);
        mvc.perform(json(patch("/api/me/profile"), "{\"displayName\":\"Sahip\",\"location\":\"İstanbul\"}")
                .with(owner.auth()).with(csrf())).andExpect(status().isOk());
        privacy(owner, true, "EVERYONE", "VERIFIED", "ONLY_ME", "VERIFIED", "VERIFIED");
        String publicCard = createCard(owner, "{\"type\":\"TEXT\",\"config\":{\"text\":\"Herkese\"}}");
        String secretCard = createCard(owner, "{\"type\":\"GALLERY\",\"config\":{\"title\":\"Yakınlar\"}}");
        var photo = new MockMultipartFile("file", "a.jpg", "image/jpeg", PhotoFixtures.jpegWithExifOrientation(300, 200, 1));
        String media = JsonPath.read(mvc.perform(multipart("/api/me/cards/" + secretCard + "/media").file(photo)
                        .with(owner.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(json(patch("/api/me/cards/" + secretCard), "{\"audience\":\"VERIFIED\"}").with(owner.auth()).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.audience").value("VERIFIED"));
        mvc.perform(json(patch("/api/me/cards/" + publicCard), "{\"audience\":\"ONLY_ME\"}").with(owner.auth()).with(csrf()))
                .andExpect(status().isBadRequest());

        String page = "/api/public/profiles/" + username;
        mvc.perform(get(page))
                .andExpect(jsonPath("$.location").doesNotExist())
                .andExpect(jsonPath("$.cards", hasSize(1)))
                .andExpect(jsonPath("$.cards[0].id").value(publicCard))
                .andExpect(jsonPath("$.interactions.comment").value("SIGN_IN"))
                .andExpect(jsonPath("$.interactions.message").value("SIGN_IN"))
                .andExpect(jsonPath("$.interactions.guestbookVisible").value(false));
        mvc.perform(get("/api/public/media/" + media)).andExpect(status().isNotFound());
        mvc.perform(get(page).with(users.unverified().auth()))
                .andExpect(jsonPath("$.interactions.comment").value("VERIFY"));

        var verified = users.verified();
        mvc.perform(get(page).with(verified.auth()))
                .andExpect(jsonPath("$.location").value("İstanbul"))
                .andExpect(jsonPath("$.cards", hasSize(2)))
                .andExpect(jsonPath("$.interactions.comment").value("ALLOWED"))
                .andExpect(jsonPath("$.interactions.guestbookVisible").value(false));
        mvc.perform(get("/api/public/media/" + media).with(verified.auth())).andExpect(status().isOk());
        mvc.perform(get(page).with(owner.auth()))
                .andExpect(jsonPath("$.interactions.comment").value("OWNER"))
                .andExpect(jsonPath("$.interactions.guestbookVisible").value(true));

        // Defter yalniz sahibine acik: yazi kaydedilir ama baskasi okuyamaz.
        mvc.perform(json(post("/api/profiles/" + username + "/guestbook"), "{\"body\":\"Gizli defter\"}")
                .with(verified.auth()).with(csrf())).andExpect(status().isCreated());
        mvc.perform(get(page + "/guestbook").with(verified.auth())).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get(page + "/guestbook").with(owner.auth())).andExpect(jsonPath("$", hasSize(1)));
    }

    @Test
    void commentsCanRequireApprovalOrBeClosed() throws Exception {
        String username = Users.uniqueName();
        var owner = withPage(users.verified(), username);
        String url = "/api/profiles/" + username + "/guestbook";
        var visitor = users.verified();

        mvc.perform(json(post(url), "{\"body\":\"Doğrulanmadan\"}").with(users.unverified().auth()).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("Deftere yazmak için önce hesabını doğrula"));

        privacy(owner, true, "EVERYONE", "EVERYONE", "EVERYONE", "APPROVAL", "VERIFIED");
        String entry = JsonPath.read(mvc.perform(json(post(url), "{\"body\":\"Onay bekliyorum\"}")
                        .with(visitor.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        mvc.perform(get("/api/public/profiles/" + username + "/guestbook")).andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get("/api/me/guestbook").with(owner.auth())).andExpect(jsonPath("$[0].status").value("PENDING"));
        mvc.perform(json(patch("/api/me/guestbook/" + entry), "{\"status\":\"VISIBLE\"}").with(owner.auth()).with(csrf()))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/public/profiles/" + username + "/guestbook")).andExpect(jsonPath("$", hasSize(1)));

        privacy(owner, true, "EVERYONE", "EVERYONE", "EVERYONE", "NOBODY", "VERIFIED");
        mvc.perform(json(post(url), "{\"body\":\"Kapalı mı\"}").with(visitor.auth()).with(csrf()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.detail").value("Bu sayfa yorumlara kapalı"));
        mvc.perform(get("/api/public/profiles/" + username).with(visitor.auth()))
                .andExpect(jsonPath("$.interactions.comment").value("CLOSED"));
    }

    // --- yardimcilar ---

    private Users.Person withPage(Users.Person person, String username) throws Exception {
        mvc.perform(json(post("/api/me/profile"), "{\"username\":\"" + username + "\",\"displayName\":\"Sahip\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        return person;
    }

    private void privacy(Users.Person owner, boolean indexable, String profile, String location, String guestbook,
            String comments, String messages) throws Exception {
        mvc.perform(json(put("/api/me/privacy"), PRIVACY.formatted(indexable, profile, location, guestbook, comments, messages))
                        .with(owner.auth()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.privacy.profile").value(profile));
    }

    private String createCard(Users.Person owner, String body) throws Exception {
        return JsonPath.read(mvc.perform(json(post("/api/me/cards"), body).with(owner.auth()).with(csrf()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

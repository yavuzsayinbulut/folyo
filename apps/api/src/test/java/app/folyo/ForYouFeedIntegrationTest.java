package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.UserService;
import com.jayway.jsonpath.JsonPath;
import java.time.Duration;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Kesfet "Senin icin" siralamasi. Veritabani diger testlerle paylasildigi icin yalniz bu testin gonderilerinin
 * birbirine gore sirasi kontrol edilir.
 */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ForYouFeedIntegrationTest {

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
    void freshnessAndEngagementAreBalanced() throws Exception {
        String old = publish(author(), "eski ama çok beğenilmiş", Duration.ofHours(48), 30);
        String fresh = publish(author(), "yeni, beğenisiz", Duration.ZERO, 0);
        String middle = publish(author(), "birkaç saatlik, ilgi gören", Duration.ofHours(6), 10);

        assertThat(order(forYou(null), old, fresh, middle)).containsExactly(middle, fresh, old);
        // "En yeni" akisi tarihe gore kalir.
        assertThat(order(latest(null), old, fresh, middle)).containsExactly(fresh, middle, old);
    }

    @Test
    void oneAuthorCannotTakeOverTheFeed() throws Exception {
        Users.Person prolific = author();
        String d1 = publish(prolific, "d1", Duration.ofHours(1), 5);
        String d2 = publish(prolific, "d2", Duration.ofHours(1), 5);
        String d3 = publish(prolific, "d3", Duration.ofHours(1), 5);
        String other = publish(author(), "e", Duration.ofHours(1), 2);

        List<String> ranked = order(forYou(null), d1, d2, d3, other);
        // Esit puanli uc gonderiden ucuncusu, daha az begenilmis baska bir yazarin gerisine duser.
        assertThat(ranked.indexOf(other)).isEqualTo(2);
        assertThat(ranked).containsExactlyInAnyOrder(d1, d2, d3, other);
    }

    @Test
    void authorsTheViewerInteractsWithRankHigherOnlyForThatViewer() throws Exception {
        String friendName = Users.uniqueName();
        Users.Person friend = withPage(users.verified(), friendName);
        Users.Person stranger = author();
        String friendOld = publish(friend, "eski", Duration.ofHours(100), 0);
        String friendPost = publish(friend, "arkadaş", Duration.ofHours(2), 1);
        String strangerPost = publish(stranger, "yabancı", Duration.ofHours(2), 2);

        Users.Person viewer = withPage(users.verified(), Users.uniqueName());
        String own = publish(viewer, "benim", Duration.ZERO, 50);
        mvc.perform(post("/api/me/posts/" + friendOld + "/like").with(viewer.auth()).with(csrf())).andExpect(status().isOk());
        mvc.perform(json(post("/api/me/posts"), "{\"replyToId\":\"" + friendOld + "\",\"body\":\"Güzel\"}")
                .with(viewer.auth()).with(csrf())).andExpect(status().isCreated());
        mvc.perform(json(post("/api/profiles/" + friendName + "/messages"), "{\"body\":\"Selam\"}")
                .with(viewer.auth()).with(csrf())).andExpect(status().isCreated());

        assertThat(order(forYou(null), friendPost, strangerPost)).containsExactly(strangerPost, friendPost);
        List<String> personal = forYou(viewer.auth());
        assertThat(order(personal, friendPost, strangerPost)).containsExactly(friendPost, strangerPost);
        // Kendi gonderin "Senin icin"de yer almaz (profilinde ve "En yeni"de vardir).
        assertThat(personal).doesNotContain(own);
    }

    @Test
    void whatYouSeeFollowsYourMembership() throws Exception {
        Users.Person author = author();
        String everyone = publish(author, "herkese", Duration.ofMinutes(10), 0);
        String signedIn = publishFor(author, "giriş yapanlara", "SIGNED_IN");
        String verified = publishFor(author, "doğrulanmışlara", "VERIFIED");
        // Sayfasi olmayan, dogrulanmamis uyenin gonderisi Kesfet'e hic girmez.
        Users.Person newcomer = withPage(users.unverified(), Users.uniqueName());
        String unverifiedAuthor = publish(newcomer, "henüz doğrulanmamış", Duration.ofMinutes(10), 0);

        List<String> mine = List.of(everyone, signedIn, verified, unverifiedAuthor);
        assertThat(order(forYou(null), mine.toArray(String[]::new))).containsExactly(everyone);
        assertThat(order(forYou(users.unverified().auth()), mine.toArray(String[]::new))).containsExactlyInAnyOrder(everyone, signedIn);
        assertThat(order(forYou(users.verified().auth()), mine.toArray(String[]::new))).containsExactlyInAnyOrder(everyone, signedIn, verified);
    }

    @Test
    void blockedAuthorsDisappearBothWays() throws Exception {
        String blockerName = Users.uniqueName();
        Users.Person blocker = withPage(users.verified(), blockerName);
        String hidden = publish(blocker, "engelleyenin gönderisi", Duration.ofMinutes(5), 0);
        Users.Person viewer = users.verified();
        assertThat(forYou(viewer.auth())).contains(hidden);

        String conversation = JsonPath.read(mvc.perform(json(post("/api/profiles/" + blockerName + "/messages"), "{\"body\":\"Selam\"}")
                .with(viewer.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(),
                "$.conversationId");
        mvc.perform(post("/api/me/conversations/" + conversation + "/block").with(blocker.auth()).with(csrf()))
                .andExpect(status().isNoContent());

        assertThat(forYou(viewer.auth())).doesNotContain(hidden);
        assertThat(latest(viewer.auth())).doesNotContain(hidden);
        // Engellemeyen ziyaretciler gormeye devam eder.
        assertThat(forYou(users.verified().auth())).contains(hidden);
    }

    @Test
    void pagingKeepsTheRankedOrderStable() throws Exception {
        List<String> mine = new ArrayList<>();
        for (int i = 0; i < 25; i++) {
            mine.add(publish(author(), "sayfa " + i, Duration.ofMinutes(30 + i), 0));
        }
        String first = page(get("/api/public/posts/for-you"));
        List<String> seen = new ArrayList<>(ids(first));
        assertThat(seen).hasSize(20);
        String next = JsonPath.read(first, "$.next");
        assertThat(next).isNotNull();

        // Ilk sayfadan sonra gelen begeniler siralamayi bu kisinin akisinda bozmaz: tekrar ya da kayip olmaz.
        String last = mine.getLast();
        jdbc.sql("update posts set like_count = 1000 where id = cast(:id as uuid)").param("id", last).update();
        while (next != null) {
            String result = page(get("/api/public/posts/for-you").param("cursor", next));
            seen.addAll(ids(result));
            next = JsonPath.read(result, "$.next");
        }
        assertThat(new HashSet<>(seen)).hasSize(seen.size());
        assertThat(seen).containsAll(mine);

        // Yeni bir akis yeni begeniyi hesaba katar.
        assertThat(order(forYou(null), mine.toArray(String[]::new)).getFirst()).isEqualTo(last);
        mvc.perform(get("/api/public/posts/for-you").param("cursor", "bozuk")).andExpect(status().isBadRequest());
        // Suresi dolmus (bilinmeyen) liste yeniden siralanir.
        mvc.perform(get("/api/public/posts/for-you").param("cursor", "AAAAAAAAAAAAAAAAAAAAAA.20")).andExpect(status().isOk());
    }

    // --- yardimcilar ---

    private Users.Person author() throws Exception {
        return withPage(users.verified(), Users.uniqueName());
    }

    /** Gonderi olusturur; yasini ve begeni sayisini dogrudan ayarlar (siralama girdileri). */
    private String publish(Users.Person author, String body, Duration age, int likes) throws Exception {
        String id = JsonPath.read(mvc.perform(json(post("/api/me/posts"), "{\"body\":\"" + body + "\"}")
                .with(author.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        jdbc.sql("update posts set created_at = :at, like_count = :likes where id = cast(:id as uuid)")
                .params(Map.of("at", Timestamp.from(Instant.now().minus(age)), "likes", likes, "id", id)).update();
        return id;
    }

    private String publishFor(Users.Person author, String body, String audience) throws Exception {
        return JsonPath.read(mvc.perform(json(post("/api/me/posts"), "{\"body\":\"" + body + "\",\"audience\":\"" + audience + "\"}")
                .with(author.auth()).with(csrf())).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
    }

    private List<String> forYou(RequestPostProcessor viewer) throws Exception {
        return all("/api/public/posts/for-you", viewer);
    }

    private List<String> latest(RequestPostProcessor viewer) throws Exception {
        return all("/api/public/posts", viewer);
    }

    /** Akisin tum sayfalari. */
    private List<String> all(String path, RequestPostProcessor viewer) throws Exception {
        List<String> all = new ArrayList<>();
        String next = null;
        do {
            MockHttpServletRequestBuilder request = get(path);
            if (next != null) {
                request.param("cursor", next);
            }
            if (viewer != null) {
                request.with(viewer);
            }
            String result = page(request);
            all.addAll(ids(result));
            next = JsonPath.read(result, "$.next");
        } while (next != null);
        return all;
    }

    private String page(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static List<String> ids(String page) {
        return JsonPath.read(page, "$.posts[*].id");
    }

    /** Listedeki siralarina gore yalniz verilen gonderiler. */
    private static List<String> order(List<String> feed, String... wanted) {
        List<String> set = List.of(wanted);
        return feed.stream().filter(set::contains).toList();
    }

    private Users.Person withPage(Users.Person person, String username) throws Exception {
        mvc.perform(json(post("/api/me/profile"), "{\"username\":\"" + username + "\",\"displayName\":\"Yazar\"}")
                .with(person.auth()).with(csrf())).andExpect(status().isCreated());
        return person;
    }

    private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder builder, String body) {
        return builder.contentType(MediaType.APPLICATION_JSON).content(body);
    }
}

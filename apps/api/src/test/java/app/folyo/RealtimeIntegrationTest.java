package app.folyo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserService;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Anlik kanal: gercek sunucu, mobil Bearer token ile WebSocket. */
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class RealtimeIntegrationTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    @LocalServerPort
    int port;

    @Autowired
    MockMvc mvc;

    @Autowired
    UserService userService;

    @Autowired
    JdbcClient jdbc;

    @Test
    void messagesTicksTypingAndPresenceArriveInstantly() throws Exception {
        Device a = device("Ada");
        Device b = device("Barış");
        String bName = Users.uniqueName();
        mvc.perform(post("/api/me/profile").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + bName + "\",\"displayName\":\"Barış\"}")
                        .header("Authorization", "Bearer " + b.token))
                .andExpect(status().isCreated());
        String conversation = JsonPath.read(mvc.perform(post("/api/profiles/" + bName + "/messages")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"İlk\"}")
                        .header("Authorization", "Bearer " + a.token))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.conversationId");

        Client ca = connect(a);
        ca.await("ready");
        Client cb = connect(b);
        cb.await("ready");
        // B baglandi: A cevrimici oldugunu gorur.
        JsonNode online = ca.await("presence");
        assertThat(online.path("userId").asString()).isEqualTo(b.id.toString());
        assertThat(online.path("online").asBoolean()).isTrue();

        mvc.perform(post("/api/me/conversations/" + conversation + "/messages").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Anlık mı?\"}").header("Authorization", "Bearer " + a.token))
                .andExpect(status().isCreated());
        JsonNode received = cb.await("message");
        assertThat(received.path("message").path("body").asString()).isEqualTo("Anlık mı?");
        assertThat(received.path("message").path("mine").asBoolean()).isFalse();
        assertThat(ca.await("message").path("message").path("mine").asBoolean()).isTrue();
        // Alicinin baglantisina ulasti: cift tik.
        JsonNode delivered = ca.await("receipt");
        assertThat(delivered.path("deliveredSeq").asLong()).isEqualTo(2);

        cb.send("{\"type\":\"typing\",\"conversationId\":\"" + conversation + "\"}");
        assertThat(ca.await("typing").path("userId").asString()).isEqualTo(b.id.toString());

        cb.send("{\"type\":\"read\",\"conversationId\":\"" + conversation + "\",\"seq\":2}");
        JsonNode read = ca.await("receipt");
        assertThat(read.path("readSeq").asLong()).isEqualTo(2);

        cb.close();
        JsonNode offline = ca.await("presence");
        assertThat(offline.path("online").asBoolean()).isFalse();
        assertThat(offline.path("lastSeenAt").isNull()).isFalse();
        ca.close();
    }

    @Test
    void connectionsWithoutAValidTokenAreRefused() {
        var headers = new WebSocketHttpHeaders();
        headers.setBearerAuth("uydurma");
        assertThatThrownBy(() -> new StandardWebSocketClient()
                .execute(new TextWebSocketHandler(), headers, URI.create("ws://localhost:" + port + "/api/realtime"))
                .get(5, TimeUnit.SECONDS))
                .isNotNull();
        assertThatThrownBy(() -> new StandardWebSocketClient()
                .execute(new TextWebSocketHandler(), new WebSocketHttpHeaders(), URI.create("ws://localhost:" + port + "/api/realtime"))
                .get(5, TimeUnit.SECONDS))
                .isNotNull();
    }

    // --- yardimcilar ---

    record Device(UUID id, String token) {
    }

    /** Web oturumundan mobil kod alinir ve PKCE ile token'a cevrilir; kullanici dogrulanmis yapilir. */
    private Device device(String name) throws Exception {
        User user = userService.signIn("test", UUID.randomUUID().toString(), null, name, null);
        TestUsers.verify(jdbc, user.getId());
        var web = authentication(UsernamePasswordAuthenticationToken.authenticated(
                new FolyoPrincipal(user.getId(), user.getName()), null, List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        byte[] random = new byte[48];
        new SecureRandom().nextBytes(random);
        String verifier = Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        String code = JsonPath.read(mvc.perform(post("/api/me/mobile/codes").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"codeChallenge\":\"" + challenge + "\",\"redirectUri\":\"folyo://auth\"}")
                        .with(web).with(csrf()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.code");
        String token = JsonPath.read(mvc.perform(post("/api/mobile/token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + code + "\",\"codeVerifier\":\"" + verifier + "\",\"deviceName\":\"Test\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(), "$.token");
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        return new Device(user.getId(), token);
    }

    private Client connect(Device device) throws Exception {
        var headers = new WebSocketHttpHeaders();
        headers.setBearerAuth(device.token());
        Client client = new Client();
        client.session = new StandardWebSocketClient()
                .execute(client, headers, URI.create("ws://localhost:" + port + "/api/realtime"))
                .get(5, TimeUnit.SECONDS);
        return client;
    }

    static final class Client extends TextWebSocketHandler {

        final BlockingQueue<JsonNode> events = new LinkedBlockingQueue<>();
        WebSocketSession session;

        @Override
        protected void handleTextMessage(WebSocketSession session, TextMessage message) {
            events.add(JSON.readTree(message.getPayload()));
        }

        /** Istenen turdeki ilk olayi bekler; araya giren diger olaylari atlar. */
        JsonNode await(String type) throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                JsonNode event = events.poll(100, TimeUnit.MILLISECONDS);
                if (event != null && type.equals(event.path("type").asString())) {
                    return event;
                }
            }
            throw new AssertionError("Olay gelmedi: " + type);
        }

        void send(String payload) throws Exception {
            session.sendMessage(new TextMessage(payload));
        }

        void close() throws Exception {
            session.close();
        }
    }
}

package app.folyo.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class GatewaysAndContactsTest {

    private final RestClient.Builder builder = RestClient.builder();
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

    @Test
    void phonesAreNormalizedToE164AndMasked() {
        assertThat(Contacts.normalizePhone("0555 111 22 33")).isEqualTo("+905551112233");
        assertThat(Contacts.normalizePhone("555-111-2233")).isEqualTo("+905551112233");
        assertThat(Contacts.normalizePhone("+90 (555) 111 22 33")).isEqualTo("+905551112233");
        assertThat(Contacts.normalizePhone("905551112233")).isEqualTo("+905551112233");
        assertThat(Contacts.normalizePhone("0049 151 23456789")).isEqualTo("+4915123456789");
        assertThat(Contacts.normalizePhone("12")).isNull();
        assertThat(Contacts.normalizePhone("abc")).isNull();
        assertThat(Contacts.maskPhone("+905551112233")).isEqualTo("+90 5•• ••• •• 33");
        assertThat(Contacts.normalizeEmail(" Ada@Example.TEST ")).isEqualTo("Ada@example.test");
        assertThat(Contacts.normalizeEmail("yok@")).isNull();
        assertThat(Contacts.normalizeEmail("a b@example.test")).isNull();
    }

    @Test
    void twilioReceivesFormWithBasicAuth() {
        String auth = "Basic " + Base64.getEncoder().encodeToString("AC1:tok".getBytes(StandardCharsets.UTF_8));
        server.expect(requestTo("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", auth))
                .andExpect(content().formDataContains(Map.of("To", "+905551112233", "From", "+15005550006", "Body", "kod 1")))
                .andRespond(withSuccess("{\"sid\":\"SM1\"}", MediaType.APPLICATION_JSON));
        new TwilioSmsGateway(builder.build(), "AC1", "tok", "+15005550006").send("+905551112233", "kod 1");
        server.verify();
    }

    @Test
    void twilioRejectionBecomesDeliveryFailure() {
        server.expect(requestTo("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json"))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));
        assertThatThrownBy(() -> new TwilioSmsGateway(builder.build(), "AC1", "tok", "+1").send("+905551112233", "x"))
                .isInstanceOf(DeliveryException.class);
    }

    @Test
    void netgsmReceivesJsonWithoutPlusAndChecksResultCode() {
        server.expect(requestTo("https://api.netgsm.com.tr/sms/rest/v2/send"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"msgheader":"FOLYO","encoding":"TR","messages":[{"msg":"kod 2","no":"905551112233"}]}"""))
                .andRespond(withSuccess("{\"code\":\"00\",\"jobid\":\"1\"}", MediaType.APPLICATION_JSON));
        new NetgsmSmsGateway(builder.build(), "8501234567", "parola", "FOLYO").send("+905551112233", "kod 2");

        server.reset();
        server.expect(requestTo("https://api.netgsm.com.tr/sms/rest/v2/send"))
                .andRespond(withSuccess("{\"code\":\"40\"}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> new NetgsmSmsGateway(builder.build(), "u", "p", "FOLYO").send("+905551112233", "x"))
                .isInstanceOf(DeliveryException.class).hasMessageContaining("40");
    }

    @Test
    void smtpGatewayUsesAuthAndStartTlsWhenConfigured() {
        var gateway = new SmtpEmailGateway("smtp.example.test", 587, "user", "pass", "no-reply@example.test", true);
        assertThat(gateway.sender().getHost()).isEqualTo("smtp.example.test");
        assertThat(gateway.sender().getJavaMailProperties())
                .containsEntry("mail.smtp.auth", "true")
                .containsEntry("mail.smtp.starttls.enable", "true")
                .containsEntry("mail.smtp.timeout", "5000");
        var anonymous = new SmtpEmailGateway("localhost", 25, null, null, "a@example.test", false);
        assertThat(anonymous.sender().getJavaMailProperties()).doesNotContainKey("mail.smtp.auth");
    }
}

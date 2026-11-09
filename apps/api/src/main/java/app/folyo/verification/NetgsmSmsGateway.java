package app.folyo.verification;

import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

/** Netgsm REST v2: kullanici kodu + API parolasi ile temel kimlik dogrulama, onayli gonderici basligi. */
class NetgsmSmsGateway implements SmsGateway {

    static final String API = "https://api.netgsm.com.tr/sms/rest/v2/send";

    private final RestClient http;
    private final String usercode;
    private final String password;
    private final String header;

    NetgsmSmsGateway(RestClient http, String usercode, String password, String header) {
        this.http = http;
        this.usercode = usercode;
        this.password = password;
        this.header = header;
    }

    @Override
    public void send(String phone, String text) {
        // Netgsm numarayi + isaretsiz bekler (905551112233).
        Map<String, Object> body = Map.of("msgheader", header, "encoding", "TR",
                "messages", List.of(Map.of("msg", text, "no", phone.substring(1))));
        JsonNode response;
        try {
            response = http.post().uri(API)
                    .headers(h -> h.setBasicAuth(usercode, password))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            throw new DeliveryException("Netgsm SMS'i kabul etmedi", e);
        }
        String code = response == null ? null : response.path("code").asString(null);
        if (!"00".equals(code)) {
            throw new DeliveryException("Netgsm SMS'i kabul etmedi (kod " + code + ")");
        }
    }
}

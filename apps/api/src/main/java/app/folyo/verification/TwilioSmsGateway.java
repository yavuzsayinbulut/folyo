package app.folyo.verification;

import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Twilio Programmable Messaging: hesap SID + auth token ile temel kimlik dogrulama, gonderen numara ya da servis. */
class TwilioSmsGateway implements SmsGateway {

    static final String API = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json";

    private final RestClient http;
    private final String accountSid;
    private final String authToken;
    private final String from;

    TwilioSmsGateway(RestClient http, String accountSid, String authToken, String from) {
        this.http = http;
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.from = from;
    }

    @Override
    public void send(String phone, String text) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("To", phone);
        form.add("From", from);
        form.add("Body", text);
        try {
            http.post().uri(API, accountSid)
                    .headers(h -> h.setBasicAuth(accountSid, authToken))
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new DeliveryException("Twilio SMS'i kabul etmedi", e);
        }
    }
}

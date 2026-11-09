package app.folyo.auth;

import java.util.HashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

/**
 * GitHub'in /user cevabi gizli e-postayi icermez ve dogrulanmis olup olmadigini soylemez. Giris sirasinda
 * (user:email izniyle) /user/emails okunur; birincil ve dogrulanmis e-posta "email" + "email_verified" olarak eklenir.
 * Okunamazsa giris yine olur, yalniz e-posta dogrulanmamis sayilir.
 */
@Component
public class GitHubEmailUserService implements OAuth2UserService<OAuth2UserRequest, OAuth2User> {

    static final String EMAILS_URL = "https://api.github.com/user/emails";

    private final DefaultOAuth2UserService delegate = new DefaultOAuth2UserService();
    private final RestClient http;

    public GitHubEmailUserService(RestClient.Builder builder) {
        this.http = builder.build();
    }

    @Override
    public OAuth2User loadUser(OAuth2UserRequest request) {
        OAuth2User user = delegate.loadUser(request);
        if (!"github".equals(request.getClientRegistration().getRegistrationId())) {
            return user;
        }
        Map<String, Object> attributes = new HashMap<>(user.getAttributes());
        attributes.put("email_verified", false);
        try {
            JsonNode emails = http.get().uri(EMAILS_URL)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + request.getAccessToken().getTokenValue())
                    .header(HttpHeaders.ACCEPT, "application/vnd.github+json")
                    .retrieve().body(JsonNode.class);
            if (emails != null) {
                for (JsonNode email : emails) {
                    if (email.path("primary").asBoolean(false) && email.path("verified").asBoolean(false)) {
                        attributes.put("email", email.path("email").asString());
                        attributes.put("email_verified", true);
                    }
                }
            }
        } catch (RestClientException e) {
            // E-posta okunamadi: kullanici sonradan e-postasini kodla dogrulayabilir.
        }
        return new DefaultOAuth2User(user.getAuthorities(), attributes, "id");
    }
}

package app.folyo.auth;

import app.folyo.config.FolyoProperties;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * Google/GitHub ile giris. Yalniz istemci bilgisi dolu olan saglayici acilir: Spring'in kendi
 * spring.security.oauth2.client.* ayarlari bos degerle tanimlaninca uygulama hic acilmaz, burada bos olan atlanir.
 * Ortam degiskenleri: FOLYO_LOGIN_GOOGLE_CLIENT_ID/SECRET, FOLYO_LOGIN_GITHUB_CLIENT_ID/SECRET.
 */
@ConfigurationProperties("folyo.login")
public record LoginProviders(FolyoProperties.OAuthClient google, FolyoProperties.OAuthClient github) {

    boolean any() {
        return configured(google) || configured(github);
    }

    private static boolean configured(FolyoProperties.OAuthClient client) {
        return client != null && client.configured();
    }

    @Configuration
    @EnableConfigurationProperties(LoginProviders.class)
    static class Registrations {

        /** Donus adresi sabit web adresinden kurulur; proxy basliklarina bagli kalmaz. */
        @Bean
        @Conditional(AnyConfigured.class)
        InMemoryClientRegistrationRepository clientRegistrationRepository(LoginProviders providers,
                FolyoProperties properties) {
            String redirect = properties.webUrl() + "/login/oauth2/code/{registrationId}";
            List<ClientRegistration> registrations = new ArrayList<>();
            if (configured(providers.google())) {
                registrations.add(CommonOAuth2Provider.GOOGLE.getBuilder("google")
                        .clientId(providers.google().clientId()).clientSecret(providers.google().clientSecret())
                        .redirectUri(redirect).build());
            }
            if (configured(providers.github())) {
                // user:email: gizli e-posta dahil birincil ve dogrulanmis e-postayi okumak icin (GitHubEmailUserService).
                registrations.add(CommonOAuth2Provider.GITHUB.getBuilder("github")
                        .clientId(providers.github().clientId()).clientSecret(providers.github().clientSecret())
                        .scope("read:user", "user:email").redirectUri(redirect).build());
            }
            return new InMemoryClientRegistrationRepository(registrations);
        }
    }

    static class AnyConfigured implements Condition {

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return Binder.get(context.getEnvironment()).bind("folyo.login", LoginProviders.class)
                    .map(LoginProviders::any).orElse(false);
        }
    }
}

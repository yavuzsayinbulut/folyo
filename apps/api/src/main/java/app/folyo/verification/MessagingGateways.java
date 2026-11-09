package app.folyo.verification;

import app.folyo.settings.EmailSettings;
import app.folyo.settings.PlatformSettings;
import app.folyo.settings.SettingsSecrets;
import app.folyo.settings.SmsSettings;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** Admin'in sectigi entegrasyona gore SMS / e-posta gondericisini kurar. Ayar degisince bir sonraki gonderim yenisini kullanir. */
@Component
public class MessagingGateways {

    private final PlatformSettings settings;
    private final SettingsSecrets secrets;
    private final RestClient http;

    public MessagingGateways(PlatformSettings settings, SettingsSecrets secrets, RestClient.Builder builder) {
        this.settings = settings;
        this.secrets = secrets;
        this.http = builder.build();
    }

    public Optional<SmsGateway> sms() {
        return sms(settings.sms());
    }

    public Optional<EmailGateway> email() {
        return email(settings.email());
    }

    public Optional<SmsGateway> sms(SmsSettings s) {
        return switch (s.provider()) {
            case OFF -> Optional.empty();
            case LOG -> settings.allowLog() ? Optional.of(LogGateways.SMS) : Optional.empty();
            case TWILIO -> s.twilio() == null ? Optional.empty() : Optional.of(new TwilioSmsGateway(http,
                    s.twilio().accountSid(), secrets.open(s.twilio().authTokenEnc()), s.twilio().from()));
            case NETGSM -> s.netgsm() == null ? Optional.empty() : Optional.of(new NetgsmSmsGateway(http,
                    s.netgsm().usercode(), secrets.open(s.netgsm().passwordEnc()), s.netgsm().header()));
        };
    }

    public Optional<EmailGateway> email(EmailSettings s) {
        return switch (s.provider()) {
            case OFF -> Optional.empty();
            case LOG -> settings.allowLog() ? Optional.of(LogGateways.EMAIL) : Optional.empty();
            case SMTP -> s.smtp() == null ? Optional.empty() : Optional.of(new SmtpEmailGateway(s.smtp().host(),
                    s.smtp().port(), s.smtp().username(), secrets.open(s.smtp().passwordEnc()), s.smtp().from(),
                    s.smtp().startTls()));
        };
    }
}

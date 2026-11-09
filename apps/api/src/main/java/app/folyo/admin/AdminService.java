package app.folyo.admin;

import app.folyo.auth.UserRepository;
import app.folyo.auth.UserService;
import app.folyo.settings.EmailProvider;
import app.folyo.settings.EmailSettings;
import app.folyo.settings.PlatformSettings;
import app.folyo.settings.SettingsSecrets;
import app.folyo.settings.SmsProvider;
import app.folyo.settings.SmsSettings;
import app.folyo.settings.StorageSettings;
import app.folyo.settings.VerificationPolicy;
import app.folyo.verification.Contacts;
import app.folyo.verification.DeliveryException;
import app.folyo.verification.MessagingGateways;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin kararlari: hangi SMS / e-posta entegrasyonu kullanilir ve "dogrulanmis kullanici" icin ne gerekir.
 * Gizli alanlar (token, parola) asla geri donmez; bos gonderilirse mevcut deger korunur.
 */
@Service
public class AdminService {

    private final UserRepository users;
    private final UserService userService;
    private final PlatformSettings settings;
    private final SettingsSecrets secrets;
    private final MessagingGateways gateways;
    private final app.folyo.asset.BlobStores stores;

    public AdminService(UserRepository users, UserService userService, PlatformSettings settings,
            SettingsSecrets secrets, MessagingGateways gateways, app.folyo.asset.BlobStores stores) {
        this.stores = stores;
        this.users = users;
        this.userService = userService;
        this.settings = settings;
        this.secrets = secrets;
        this.gateways = gateways;
    }

    public record TwilioView(String accountSid, String from, boolean authTokenSet) {
    }

    public record NetgsmView(String usercode, String header, boolean passwordSet) {
    }

    public record SmtpView(String host, int port, String username, String from, boolean startTls, boolean passwordSet) {
    }

    public record SmsView(SmsProvider provider, TwilioView twilio, NetgsmView netgsm) {
    }

    public record EmailView(EmailProvider provider, SmtpView smtp) {
    }

    public record S3View(String endpoint, String region, String bucket, String accessKey, boolean pathStyle,
            boolean secretKeySet) {
    }

    public record StorageView(StorageSettings.Provider provider, S3View s3) {
    }

    public record SettingsView(SmsView sms, EmailView email, StorageView storage, VerificationPolicy policy,
            boolean allowLog, List<String> warnings) {
    }

    public record S3Input(String endpoint, String region, String bucket, String accessKey, String secretKey,
            Boolean pathStyle) {
    }

    public record StorageInput(StorageSettings.Provider provider, S3Input s3) {
    }

    public record TwilioInput(String accountSid, String from, String authToken) {
    }

    public record NetgsmInput(String usercode, String header, String password) {
    }

    public record SmtpInput(String host, Integer port, String username, String from, Boolean startTls, String password) {
    }

    public record SmsInput(SmsProvider provider, TwilioInput twilio, NetgsmInput netgsm) {
    }

    public record EmailInput(EmailProvider provider, SmtpInput smtp) {
    }

    /** Admin yetkisi her istekte ortamdaki yonetici listesinden hesaplanir; listeden cikan hemen yetkisini kaybeder. */
    public void requireAdmin(UUID userId) {
        boolean admin = users.findById(userId).map(userService::isAdmin).orElse(false);
        if (!admin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bu alan yalnız yöneticiler içindir");
        }
    }

    public SettingsView view() {
        SmsSettings sms = settings.sms();
        EmailSettings email = settings.email();
        VerificationPolicy policy = settings.policy();
        var twilio = sms.twilio() == null ? null
                : new TwilioView(sms.twilio().accountSid(), sms.twilio().from(), sms.twilio().authTokenEnc() != null);
        var netgsm = sms.netgsm() == null ? null
                : new NetgsmView(sms.netgsm().usercode(), sms.netgsm().header(), sms.netgsm().passwordEnc() != null);
        var smtp = email.smtp() == null ? null : new SmtpView(email.smtp().host(), email.smtp().port(),
                email.smtp().username(), email.smtp().from(), email.smtp().startTls(), email.smtp().passwordEnc() != null);
        StorageSettings storage = settings.storage();
        var s3 = storage.s3() == null ? null : new S3View(storage.s3().endpoint(), storage.s3().region(),
                storage.s3().bucket(), storage.s3().accessKey(), storage.s3().pathStyle(), storage.s3().secretKeyEnc() != null);
        return new SettingsView(new SmsView(sms.provider(), twilio, netgsm), new EmailView(email.provider(), smtp),
                new StorageView(storage.provider(), s3), policy, settings.allowLog(), warnings(sms, email, policy));
    }

    public SettingsView saveSms(UUID adminId, SmsInput input) {
        if (input.provider() == null) {
            throw bad("Bir SMS sağlayıcısı seç");
        }
        requireLogAllowed(input.provider() == SmsProvider.LOG);
        SmsSettings current = settings.sms();
        SmsSettings.Twilio twilio = current.twilio();
        SmsSettings.Netgsm netgsm = current.netgsm();
        if (input.twilio() != null) {
            // Hesap degisirse eski token yeni hesaba gonderilmez: yeniden girilmesi gerekir.
            boolean sameAccount = twilio != null && java.util.Objects.equals(twilio.accountSid(), clean(input.twilio().accountSid()));
            twilio = new SmsSettings.Twilio(clean(input.twilio().accountSid()), clean(input.twilio().from()),
                    keepOrSeal(input.twilio().authToken(), sameAccount ? twilio.authTokenEnc() : null));
        }
        if (input.netgsm() != null) {
            boolean sameAccount = netgsm != null && java.util.Objects.equals(netgsm.usercode(), clean(input.netgsm().usercode()));
            netgsm = new SmsSettings.Netgsm(clean(input.netgsm().usercode()), clean(input.netgsm().header()),
                    keepOrSeal(input.netgsm().password(), sameAccount ? netgsm.passwordEnc() : null));
        }
        if (input.provider() == SmsProvider.TWILIO && (twilio == null || blank(twilio.accountSid())
                || blank(twilio.from()) || twilio.authTokenEnc() == null)) {
            throw bad("Twilio için hesap SID, gönderen numara ve auth token gerekli");
        }
        if (input.provider() == SmsProvider.NETGSM && (netgsm == null || blank(netgsm.usercode())
                || blank(netgsm.header()) || netgsm.passwordEnc() == null)) {
            throw bad("Netgsm için kullanıcı kodu, gönderici başlığı ve API parolası gerekli");
        }
        settings.saveSms(new SmsSettings(input.provider(), twilio, netgsm), adminId);
        return view();
    }

    public SettingsView saveEmail(UUID adminId, EmailInput input) {
        if (input.provider() == null) {
            throw bad("Bir e-posta sağlayıcısı seç");
        }
        requireLogAllowed(input.provider() == EmailProvider.LOG);
        EmailSettings current = settings.email();
        EmailSettings.Smtp smtp = current.smtp();
        if (input.smtp() != null) {
            SmtpInput in = input.smtp();
            int port = in.port() == null ? 587 : in.port();
            if (port < 1 || port > 65535) {
                throw bad("SMTP portu 1-65535 arasında olmalı");
            }
            // Sunucu ya da kullanici degisirse kayitli parola yeni sunucuya gonderilmez: yeniden girilmesi gerekir.
            boolean sameServer = smtp != null && java.util.Objects.equals(smtp.host(), clean(in.host()))
                    && java.util.Objects.equals(smtp.username(), clean(in.username()));
            smtp = new EmailSettings.Smtp(clean(in.host()), port, clean(in.username()), clean(in.from()),
                    in.startTls() == null || in.startTls(), keepOrSeal(in.password(), sameServer ? smtp.passwordEnc() : null));
        }
        if (input.provider() == EmailProvider.SMTP && (smtp == null || blank(smtp.host()) || blank(smtp.from())
                || Contacts.normalizeEmail(smtp.from()) == null)) {
            throw bad("SMTP için sunucu ve geçerli bir gönderen adresi gerekli");
        }
        if (input.provider() == EmailProvider.SMTP && !blank(smtp.username()) && smtp.passwordEnc() == null) {
            throw bad("SMTP sunucusu ya da kullanıcısı değişti; parolayı yeniden gir");
        }
        settings.saveEmail(new EmailSettings(input.provider(), smtp), adminId);
        return view();
    }

    /**
     * Yeni yuklemelerin deposu. Eski dosyalar yazildiklari depoda kalir ve oradan okunur; S3 ayarlari (kova, anahtar)
     * sonradan degistirilirse o depodaki eski dosyalara erisilemez.
     */
    public SettingsView saveStorage(UUID adminId, StorageInput input) {
        if (input.provider() == null) {
            throw bad("Bir depo seç");
        }
        StorageSettings.S3 current = settings.storage().s3();
        StorageSettings.S3 s3 = current;
        if (input.s3() != null) {
            S3Input in = input.s3();
            boolean sameAccount = current != null && java.util.Objects.equals(current.accessKey(), clean(in.accessKey()))
                    && java.util.Objects.equals(current.endpoint(), clean(in.endpoint()));
            String endpoint = clean(in.endpoint());
            if (endpoint != null && !endpoint.startsWith("https://") && !(settings.allowLog() && endpoint.startsWith("http://"))) {
                throw bad("Depo adresi https ile başlamalı");
            }
            s3 = new StorageSettings.S3(endpoint, clean(in.region()), clean(in.bucket()), clean(in.accessKey()),
                    keepOrSeal(in.secretKey(), sameAccount ? current.secretKeyEnc() : null),
                    in.pathStyle() != null && in.pathStyle());
        }
        if (input.provider() == StorageSettings.Provider.S3 && (s3 == null || blank(s3.bucket()) || blank(s3.accessKey())
                || s3.secretKeyEnc() == null)) {
            throw bad("S3 için kova, erişim anahtarı ve gizli anahtar gerekli");
        }
        settings.saveStorage(new StorageSettings(input.provider(), s3), adminId);
        return view();
    }

    /** Kayitli depoya kucuk bir deneme dosyasi yazip okur ve siler. */
    public void testStorage() {
        var provider = stores.current();
        var store = stores.get(provider);
        String key = UUID.randomUUID() + "/probe.jpg";
        byte[] probe = "folyo".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try {
            store.put(key, probe, "image/jpeg");
            try (var in = store.open(key, 0, -1)) {
                if (!java.util.Arrays.equals(in.readAllBytes(), probe)) {
                    throw new IllegalStateException("okunan icerik farkli");
                }
            }
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Depoya yazılıp okunamadı: " + e.getClass().getSimpleName(), e);
        } finally {
            store.deleteQuietly(List.of(key));
        }
    }

    public SettingsView savePolicy(UUID adminId, VerificationPolicy policy) {
        settings.savePolicy(policy, adminId);
        return view();
    }

    public void testSms(String rawPhone) {
        String phone = Contacts.normalizePhone(rawPhone);
        if (phone == null) {
            throw bad("Geçerli bir telefon numarası yaz");
        }
        var gateway = gateways.sms().orElseThrow(() -> bad("SMS entegrasyonu kapalı"));
        try {
            gateway.send(phone, "folyo deneme mesaji: SMS entegrasyonu calisiyor.");
        } catch (DeliveryException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage(), e);
        }
    }

    public void testEmail(String rawEmail) {
        String email = Contacts.normalizeEmail(rawEmail);
        if (email == null) {
            throw bad("Geçerli bir e-posta adresi yaz");
        }
        var gateway = gateways.email().orElseThrow(() -> bad("E-posta entegrasyonu kapalı"));
        try {
            gateway.send(email, "folyo deneme e-postası", "E-posta entegrasyonu çalışıyor.");
        } catch (DeliveryException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage(), e);
        }
    }

    /** Kurallarla entegrasyonlar celisiyorsa (or. telefon zorunlu ama SMS kapali) admin uyarilir. */
    private List<String> warnings(SmsSettings sms, EmailSettings email, VerificationPolicy policy) {
        List<String> warnings = new ArrayList<>();
        if (policy.requirePhone() && sms.provider() == SmsProvider.OFF) {
            warnings.add("Telefon doğrulaması zorunlu ama SMS entegrasyonu kapalı: yeni kimse doğrulanamaz, mesaj ve yorum yazamaz.");
        }
        if (policy.requireEmail() && email.provider() == EmailProvider.OFF) {
            warnings.add("E-posta doğrulaması zorunlu ama e-posta entegrasyonu kapalı: yalnız Google/GitHub'ın doğruladığı e-postalar geçerli.");
        }
        if (sms.provider() == SmsProvider.LOG || email.provider() == EmailProvider.LOG) {
            warnings.add("Geliştirme sağlayıcısı seçili: kodlar gönderilmiyor, sunucu loguna yazılıyor.");
        }
        return warnings;
    }

    private void requireLogAllowed(boolean log) {
        if (log && !settings.allowLog()) {
            throw bad("Geliştirme sağlayıcısı yalnız geliştirme ortamında seçilebilir");
        }
    }

    private String keepOrSeal(String input, String existing) {
        return blank(input) ? existing : secrets.seal(input.strip());
    }

    private static String clean(String value) {
        return blank(value) ? null : value.strip();
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}

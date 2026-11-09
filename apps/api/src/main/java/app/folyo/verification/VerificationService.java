package app.folyo.verification;

import app.folyo.access.VerificationStatus;
import app.folyo.access.ViewerService;
import app.folyo.auth.User;
import app.folyo.auth.UserRepository;
import app.folyo.auth.UserService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import app.folyo.settings.PlatformSettings;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * E-posta ve telefon dogrulamasi: 6 haneli kod, 10 dakika gecerli, 5 yanlis denemede yanar.
 * Kod veritabanina yalniz ozet olarak yazilir. Gonderim (saglayici cagrisi) transaction disinda yapilir.
 */
@Service
public class VerificationService {

    static final Duration CODE_TTL = Duration.ofMinutes(10);
    static final Duration RESEND_AFTER = Duration.ofSeconds(60);
    static final int MAX_PER_DAY = 10;
    static final int MAX_PER_TARGET_PER_DAY = 5;
    static final int MAX_ATTEMPTS = 5;

    private final VerificationCodeRepository codes;
    private final UserRepository users;
    private final UserService userService;
    private final ViewerService viewers;
    private final MessagingGateways gateways;
    private final CodeGenerator generator;
    private final TransactionTemplate transaction;
    private final PlatformSettings settings;

    public VerificationService(VerificationCodeRepository codes, UserRepository users, UserService userService,
            ViewerService viewers, MessagingGateways gateways, CodeGenerator generator, TransactionTemplate transaction,
            PlatformSettings settings) {
        this.settings = settings;
        this.codes = codes;
        this.users = users;
        this.userService = userService;
        this.viewers = viewers;
        this.gateways = gateways;
        this.generator = generator;
        this.transaction = transaction;
    }

    public record StatusView(String email, boolean emailVerified, String phone, boolean phoneVerified,
            boolean requireEmail, boolean requirePhone, boolean verified, boolean emailAvailable,
            boolean phoneAvailable) {
    }

    public StatusView status(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        VerificationStatus status = viewers.status(userId);
        return new StatusView(user.getEmail(), status.emailVerified(),
                user.getPhoneVerifiedAt() == null ? null : Contacts.maskPhone(user.getPhone()), status.phoneVerified(),
                status.requireEmail(), status.requirePhone(), status.verified(), gateways.email().isPresent(),
                gateways.sms().isPresent());
    }

    public void startEmail(UUID userId, String rawEmail) {
        String email = Contacts.normalizeEmail(rawEmail);
        if (email == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Geçerli bir e-posta adresi yaz");
        }
        EmailGateway gateway = gateways.email().orElseThrow(() -> new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "E-posta doğrulaması şu an kapalı"));
        Issued issued = issue(userId, Channel.EMAIL, email);
        deliver(issued, () -> gateway.send(email, "folyo doğrulama kodun",
                "folyo doğrulama kodun: " + issued.code() + "\n\nKod 10 dakika geçerli. Bu isteği sen yapmadıysan bu e-postayı yok say."));
    }

    public void startPhone(UUID userId, String rawPhone) {
        String phone = Contacts.normalizePhone(rawPhone);
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Geçerli bir telefon numarası yaz (ör. 0555 111 22 33)");
        }
        if (!settings.policy().phoneAllowed(phone)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bu ülkenin numaralarına şu an SMS gönderilmiyor");
        }
        SmsGateway gateway = gateways.sms().orElseThrow(() -> new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE, "Telefon doğrulaması şu an kapalı"));
        Issued issued = issue(userId, Channel.PHONE, phone);
        if (issued.taken()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bu numara başka bir hesapta doğrulanmış");
        }
        deliver(issued, () -> gateway.send(phone, "folyo dogrulama kodun: " + issued.code() + ". Kimseyle paylasma."));
    }

    /** Dogru kodla e-posta/telefon hesaba yazilir; yanlis kod deneme sayisini arttirir. */
    public StatusView confirm(UUID userId, Channel channel, String rawCode) {
        String code = rawCode == null ? "" : rawCode.replaceAll("\\s", "");
        String failure = transaction.execute(status -> {
            var open = codes.lockLatestOpen(userId, channel).orElse(null);
            if (open == null || open.expiresAt().isBefore(Instant.now())) {
                return "Kodun süresi doldu, yeni kod iste";
            }
            if (open.attempts() >= MAX_ATTEMPTS) {
                return "Çok fazla yanlış deneme, yeni kod iste";
            }
            if (!MessageDigest.isEqual(hash(open.id(), code).getBytes(StandardCharsets.US_ASCII),
                    open.codeHash().getBytes(StandardCharsets.US_ASCII))) {
                codes.incrementAttempts(open.id());
                return "Kod hatalı";
            }
            codes.consume(open.id());
            try {
                if (channel == Channel.EMAIL) {
                    users.markEmailVerified(userId, open.target());
                } else {
                    users.markPhoneVerified(userId, open.target());
                }
            } catch (DataIntegrityViolationException e) {
                status.setRollbackOnly();
                return "Bu numara başka bir hesapta doğrulanmış";
            }
            return null;
        });
        if (failure != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, failure);
        }
        if (channel == Channel.EMAIL) {
            userService.refreshRole(userId);
        }
        return status(userId);
    }

    /** taken: numara baska hesapta dogrulanmis; deneme siklik sinirina yine sayilir (numara sorgulama yavaslar). */
    private record Issued(UUID id, String code, boolean taken) {
    }

    /** Siklik sinirlari kontrol edip yeni kodu kaydeder (oncekiler gecersiz olur) ve kodu doner. */
    private Issued issue(UUID userId, Channel channel, String target) {
        Instant now = Instant.now();
        String code = generator.next();
        UUID id = UUID.randomUUID();
        Boolean taken = transaction.execute(status -> {
            users.lockById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
            if (codes.countSince(userId, channel, now.minus(RESEND_AFTER)) > 0) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Yeni kod için bir dakika bekle");
            }
            if (codes.countSince(userId, channel, now.minus(Duration.ofDays(1))) >= MAX_PER_DAY
                    || codes.countTargetSince(target, now.minus(Duration.ofDays(1))) >= MAX_PER_TARGET_PER_DAY) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Bugün çok fazla kod istendi, yarın tekrar dene");
            }
            if (channel == Channel.PHONE && codes.countChannelSince(Channel.PHONE, now.minus(Duration.ofDays(1)))
                    >= settings.policy().smsDailyLimit()) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Bugünkü SMS kotası doldu, yarın tekrar dene");
            }
            codes.consumeOpen(userId, channel);
            codes.insert(id, userId, channel, target, hash(id, code), now.plus(CODE_TTL));
            if (channel == Channel.PHONE && users.phoneVerifiedByAnotherUser(target, userId)) {
                codes.consume(id);
                return true;
            }
            return false;
        });
        return new Issued(id, code, Boolean.TRUE.equals(taken));
    }

    /** Gonderim basarisizsa kod silinir; kullanici bekleme suresine takilmadan tekrar deneyebilir. */
    private void deliver(Issued issued, Runnable send) {
        try {
            send.run();
        } catch (DeliveryException e) {
            codes.delete(issued.id());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Kod gönderilemedi, biraz sonra tekrar dene", e);
        }
    }

    @Scheduled(cron = "0 30 4 * * *")
    public void cleanup() {
        codes.deleteOlderThan(Instant.now().minus(Duration.ofDays(30)));
    }

    static String hash(UUID id, String code) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((id + ":" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

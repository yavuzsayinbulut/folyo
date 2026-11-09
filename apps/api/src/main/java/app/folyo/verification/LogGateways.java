package app.folyo.verification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Yalniz gelistirme ve test: mesaj gonderilmez, sunucu loguna yazilir. Prod'da secilemez (folyo.integrations.allow-log). */
final class LogGateways {

    private static final Logger log = LoggerFactory.getLogger(LogGateways.class);

    static final SmsGateway SMS = (phone, text) -> log.info("[gelistirme SMS] {} <- {}", phone, text);

    static final EmailGateway EMAIL = (to, subject, text) -> log.info("[gelistirme e-posta] {} <- [{}] {}", to, subject, text);

    private LogGateways() {
    }
}

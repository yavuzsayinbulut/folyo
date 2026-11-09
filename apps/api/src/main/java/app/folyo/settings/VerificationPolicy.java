package app.folyo.settings;

import java.util.List;

/**
 * Admin karari: "dogrulanmis kullanici" icin hangi dogrulamalar gerekir, hangi ulke numaralarina SMS gider ve
 * platform gunde en fazla kac dogrulama SMS'i gonderir. Ulke ve gunluk sinir ucretli numaralara SMS pompalanarak
 * fatura sisirilmesini (SMS pumping) engeller.
 */
public record VerificationPolicy(boolean requireEmail, boolean requirePhone, List<String> phoneCountries,
        Integer smsDailyLimit) {

    public static final List<String> DEFAULT_COUNTRIES = List.of("+90");
    public static final int DEFAULT_SMS_DAILY_LIMIT = 500;
    public static final VerificationPolicy DEFAULT = new VerificationPolicy(true, true, DEFAULT_COUNTRIES,
            DEFAULT_SMS_DAILY_LIMIT);

    public VerificationPolicy {
        phoneCountries = phoneCountries == null || phoneCountries.isEmpty() ? DEFAULT_COUNTRIES
                : phoneCountries.stream().map(String::strip).filter(c -> c.matches("^\\+[1-9]\\d{0,3}$")).distinct().toList();
        if (phoneCountries.isEmpty()) {
            phoneCountries = DEFAULT_COUNTRIES;
        }
        // Eski kayitlar ve istemciler bu alani gondermez (Jackson 3 eksik ilkel alani hata sayar; bu yuzden Integer).
        smsDailyLimit = smsDailyLimit == null || smsDailyLimit <= 0 ? DEFAULT_SMS_DAILY_LIMIT : Math.min(smsDailyLimit, 100_000);
    }

    public boolean phoneAllowed(String e164) {
        return phoneCountries.stream().anyMatch(e164::startsWith);
    }
}

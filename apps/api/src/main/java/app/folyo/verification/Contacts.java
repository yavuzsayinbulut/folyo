package app.folyo.verification;

import java.util.Locale;
import java.util.regex.Pattern;

/** Telefon ve e-posta bicim kurallari. */
public final class Contacts {

    private static final Pattern E164 = Pattern.compile("^\\+[1-9]\\d{7,14}$");
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]{1,64}@[^\\s@]+\\.[^\\s@]{2,}$");

    private Contacts() {
    }

    /** "0555 111 22 33", "555 111 2233", "+90 555..." -> "+905551112233". Turkiye numaralari icin ulke kodu varsayilir. */
    public static String normalizePhone(String raw) {
        if (raw == null) {
            return null;
        }
        String digits = raw.replaceAll("[\\s()\\-.]", "");
        String phone;
        if (digits.startsWith("+")) {
            phone = digits;
        } else if (digits.startsWith("00")) {
            phone = "+" + digits.substring(2);
        } else if (digits.startsWith("90") && digits.length() == 12) {
            phone = "+" + digits;
        } else if (digits.startsWith("0") && digits.length() == 11) {
            phone = "+90" + digits.substring(1);
        } else if (digits.startsWith("5") && digits.length() == 10) {
            phone = "+90" + digits;
        } else {
            phone = digits;
        }
        return E164.matcher(phone).matches() ? phone : null;
    }

    public static String normalizeEmail(String raw) {
        if (raw == null) {
            return null;
        }
        String email = raw.strip();
        int at = email.lastIndexOf('@');
        if (email.length() > 254 || at < 1 || !EMAIL.matcher(email).matches()) {
            return null;
        }
        return email.substring(0, at) + "@" + email.substring(at + 1).toLowerCase(Locale.ROOT);
    }

    /** "+905551112233" -> "+90 5•• ••• •• 33": numaranin sahibine hangi numarayi dogruladigini hatirlatir. */
    public static String maskPhone(String phone) {
        if (phone == null || phone.length() < 6) {
            return null;
        }
        String last = phone.substring(phone.length() - 2);
        return phone.substring(0, 3) + " " + phone.charAt(3) + "•• ••• •• " + last;
    }
}

package app.folyo.settings;

/** SMTP parolasi AES-GCM ile sifrelenmis, base64 olarak saklanir. */
public record EmailSettings(EmailProvider provider, Smtp smtp) {

    public record Smtp(String host, int port, String username, String from, boolean startTls, String passwordEnc) {
    }

    public static EmailSettings off(EmailProvider provider) {
        return new EmailSettings(provider, null);
    }
}

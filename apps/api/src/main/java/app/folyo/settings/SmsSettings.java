package app.folyo.settings;

/** Gizli alanlar (authToken, password) AES-GCM ile sifrelenmis, base64 olarak saklanir. */
public record SmsSettings(SmsProvider provider, Twilio twilio, Netgsm netgsm) {

    public record Twilio(String accountSid, String from, String authTokenEnc) {
    }

    public record Netgsm(String usercode, String header, String passwordEnc) {
    }

    public static SmsSettings off(SmsProvider provider) {
        return new SmsSettings(provider, null, null);
    }
}

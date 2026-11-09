package app.folyo.settings;

/** SMS ile kod gonderecek entegrasyon. LOG yalniz gelistirme/testte secilebilir: kodu sunucu loguna yazar. */
public enum SmsProvider {
    OFF,
    LOG,
    TWILIO,
    NETGSM
}

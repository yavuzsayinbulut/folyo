package app.folyo.verification;

public interface SmsGateway {

    /** phone E.164 bicimindedir (+905551112233). */
    void send(String phone, String text);
}

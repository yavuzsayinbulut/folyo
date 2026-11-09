package app.folyo.verification;

public interface EmailGateway {

    void send(String to, String subject, String text);
}

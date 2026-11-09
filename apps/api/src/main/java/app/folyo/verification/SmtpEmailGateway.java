package app.folyo.verification;

import java.util.Properties;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;

/** Admin panelinde girilen SMTP sunucusu uzerinden duz metin e-posta. */
class SmtpEmailGateway implements EmailGateway {

    private final JavaMailSenderImpl sender = new JavaMailSenderImpl();
    private final String from;

    SmtpEmailGateway(String host, int port, String username, String password, String from, boolean startTls) {
        sender.setHost(host);
        sender.setPort(port);
        sender.setDefaultEncoding("UTF-8");
        Properties props = sender.getJavaMailProperties();
        if (username != null && !username.isBlank()) {
            sender.setUsername(username);
            sender.setPassword(password);
            props.put("mail.smtp.auth", "true");
        }
        props.put("mail.smtp.starttls.enable", String.valueOf(startTls));
        props.put("mail.smtp.starttls.required", String.valueOf(startTls));
        props.put("mail.smtp.connectiontimeout", "5000");
        props.put("mail.smtp.timeout", "5000");
        props.put("mail.smtp.writetimeout", "5000");
        this.from = from;
    }

    JavaMailSenderImpl sender() {
        return sender;
    }

    @Override
    public void send(String to, String subject, String text) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        try {
            sender.send(message);
        } catch (MailException e) {
            throw new DeliveryException("E-posta gönderilemedi", e);
        }
    }
}

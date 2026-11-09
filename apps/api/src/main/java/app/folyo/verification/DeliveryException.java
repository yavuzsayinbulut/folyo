package app.folyo.verification;

/** SMS ya da e-posta saglayicisi mesaji kabul etmedi ya da yanit vermedi. */
public class DeliveryException extends RuntimeException {

    public DeliveryException(String message) {
        super(message);
    }

    public DeliveryException(String message, Throwable cause) {
        super(message, cause);
    }
}

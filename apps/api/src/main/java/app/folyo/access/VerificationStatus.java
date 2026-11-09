package app.folyo.access;

/** Kullanicinin dogrulama durumu ve admin'in istedigi dogrulamalar. */
public record VerificationStatus(boolean emailVerified, boolean phoneVerified, boolean requireEmail,
        boolean requirePhone) {

    public boolean verified() {
        return (!requireEmail || emailVerified) && (!requirePhone || phoneVerified);
    }
}

package app.folyo.guestbook;

public enum GuestbookStatus {
    VISIBLE,
    HIDDEN,
    /** Sahip "onayimdan sonra" sectiyse yeni yazi onaylanana kadar bekler. */
    PENDING
}

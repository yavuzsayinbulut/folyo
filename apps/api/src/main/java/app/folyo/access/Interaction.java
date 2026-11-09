package app.folyo.access;

/** Ziyaretcinin bir sayfaya yazip yazamayacagi ve yazamiyorsa nedeni (arayuz buna gore yonlendirir). */
public enum Interaction {
    ALLOWED,
    OWNER,
    SIGN_IN,
    VERIFY,
    BLOCKED,
    CLOSED
}

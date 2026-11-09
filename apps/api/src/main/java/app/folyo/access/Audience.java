package app.folyo.access;

/** Bir seyi kimin gorebilecegi. Sayfa sahibi her zaman her seyi gorur. */
public enum Audience {
    EVERYONE,
    SIGNED_IN,
    VERIFIED,
    ONLY_ME
}

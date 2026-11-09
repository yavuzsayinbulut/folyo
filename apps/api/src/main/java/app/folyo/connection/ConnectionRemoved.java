package app.folyo.connection;

import java.util.UUID;

/** Kullanici bir hesabin baglantisini kaldirdi; o hesaptan gelen veri artik gosterilmez. */
public record ConnectionRemoved(UUID profileId, ConnectionProvider provider) {
}

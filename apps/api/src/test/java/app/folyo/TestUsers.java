package app.folyo;

import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Test kullanicilarini dogrulanmis yapar (e-posta + benzersiz telefon); yazma kurallari bunu ister. */
final class TestUsers {

    private static final AtomicLong PHONES = new AtomicLong(ThreadLocalRandom.current().nextLong(10_000_000L, 80_000_000L));

    private TestUsers() {
    }

    static void verify(JdbcClient jdbc, UUID userId) {
        String phone = "+9050" + PHONES.incrementAndGet();
        jdbc.sql("""
                update users set email = coalesce(email, :email), email_verified_at = now(),
                    phone = :phone, phone_verified_at = now() where id = :id""")
                .param("email", "u" + userId.toString().substring(0, 8) + "@example.test")
                .param("phone", phone).param("id", userId).update();
    }
}

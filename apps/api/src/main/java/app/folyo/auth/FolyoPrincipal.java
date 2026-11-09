package app.folyo.auth;

import java.io.Serializable;
import java.util.UUID;
import org.springframework.security.core.AuthenticatedPrincipal;

/**
 * Oturumdaki kullanici. Hangi yolla girilmis olursa olsun (Google, GitHub, dev) uygulama bu tipi gorur.
 * Adi kullanici kimligidir: oturum tablosundaki principal_name ile kullanicinin tum oturumlari bulunabilir.
 */
public record FolyoPrincipal(UUID userId, String name) implements AuthenticatedPrincipal, Serializable {

    @Override
    public String getName() {
        return userId.toString();
    }
}

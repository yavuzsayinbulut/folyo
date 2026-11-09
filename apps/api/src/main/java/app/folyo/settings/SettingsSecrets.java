package app.folyo.settings;

import app.folyo.connection.TokenCipher;
import java.util.Base64;
import org.springframework.stereotype.Component;

/** Admin'in girdigi entegrasyon parolalari veritabanina sifreli yazilir; arayuze hic geri donmez. */
@Component
public class SettingsSecrets {

    private final TokenCipher cipher;

    public SettingsSecrets(TokenCipher cipher) {
        this.cipher = cipher;
    }

    public String seal(String plain) {
        return Base64.getEncoder().encodeToString(cipher.encrypt(plain));
    }

    public String open(String sealed) {
        return sealed == null ? null : cipher.decrypt(Base64.getDecoder().decode(sealed));
    }
}

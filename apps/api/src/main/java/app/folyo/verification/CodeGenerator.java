package app.folyo.verification;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

/** 6 haneli tek kullanimlik kod. Testlerde sabit kodla degistirilir. */
@Component
public class CodeGenerator {

    private final SecureRandom random = new SecureRandom();

    public String next() {
        return String.format("%06d", random.nextInt(1_000_000));
    }
}

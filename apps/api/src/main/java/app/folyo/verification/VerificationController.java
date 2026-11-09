package app.folyo.verification;

import app.folyo.auth.FolyoPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/verification")
public class VerificationController {

    private final VerificationService verification;

    public VerificationController(VerificationService verification) {
        this.verification = verification;
    }

    public record EmailRequest(@NotBlank(message = "E-posta adresini yaz") String email) {
    }

    public record PhoneRequest(@NotBlank(message = "Telefon numaranı yaz") String phone) {
    }

    public record CodeRequest(@NotBlank(message = "Kodu yaz") String code) {
    }

    @GetMapping
    public VerificationService.StatusView status(@AuthenticationPrincipal FolyoPrincipal principal) {
        return verification.status(principal.userId());
    }

    @PostMapping("/email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void startEmail(@AuthenticationPrincipal FolyoPrincipal principal, @Valid @RequestBody EmailRequest body) {
        verification.startEmail(principal.userId(), body.email());
    }

    @PostMapping("/email/confirm")
    public VerificationService.StatusView confirmEmail(@AuthenticationPrincipal FolyoPrincipal principal,
            @Valid @RequestBody CodeRequest body) {
        return verification.confirm(principal.userId(), Channel.EMAIL, body.code());
    }

    @PostMapping("/phone")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void startPhone(@AuthenticationPrincipal FolyoPrincipal principal, @Valid @RequestBody PhoneRequest body) {
        verification.startPhone(principal.userId(), body.phone());
    }

    @PostMapping("/phone/confirm")
    public VerificationService.StatusView confirmPhone(@AuthenticationPrincipal FolyoPrincipal principal,
            @Valid @RequestBody CodeRequest body) {
        return verification.confirm(principal.userId(), Channel.PHONE, body.code());
    }
}

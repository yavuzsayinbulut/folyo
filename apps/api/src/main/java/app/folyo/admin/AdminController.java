package app.folyo.admin;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.settings.VerificationPolicy;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService admin;

    public AdminController(AdminService admin) {
        this.admin = admin;
    }

    public record PhoneTest(@NotBlank String phone) {
    }

    public record EmailTest(@NotBlank String email) {
    }

    @GetMapping("/settings")
    public AdminService.SettingsView settings(@AuthenticationPrincipal FolyoPrincipal principal) {
        admin.requireAdmin(principal.userId());
        return admin.view();
    }

    @PutMapping("/settings/sms")
    public AdminService.SettingsView sms(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody AdminService.SmsInput body) {
        admin.requireAdmin(principal.userId());
        return admin.saveSms(principal.userId(), body);
    }

    @PutMapping("/settings/email")
    public AdminService.SettingsView email(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody AdminService.EmailInput body) {
        admin.requireAdmin(principal.userId());
        return admin.saveEmail(principal.userId(), body);
    }

    @PutMapping("/settings/policy")
    public AdminService.SettingsView policy(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody VerificationPolicy body) {
        admin.requireAdmin(principal.userId());
        return admin.savePolicy(principal.userId(), body);
    }

    @PutMapping("/settings/storage")
    public AdminService.SettingsView storage(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody AdminService.StorageInput body) {
        admin.requireAdmin(principal.userId());
        return admin.saveStorage(principal.userId(), body);
    }

    @PostMapping("/settings/storage/test")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void testStorage(@AuthenticationPrincipal FolyoPrincipal principal) {
        admin.requireAdmin(principal.userId());
        admin.testStorage();
    }

    @PostMapping("/settings/sms/test")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void testSms(@AuthenticationPrincipal FolyoPrincipal principal, @Valid @RequestBody PhoneTest body) {
        admin.requireAdmin(principal.userId());
        admin.testSms(body.phone());
    }

    @PostMapping("/settings/email/test")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void testEmail(@AuthenticationPrincipal FolyoPrincipal principal, @Valid @RequestBody EmailTest body) {
        admin.requireAdmin(principal.userId());
        admin.testEmail(body.email());
    }
}

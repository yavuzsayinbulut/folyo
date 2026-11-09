package app.folyo.moderation;

import app.folyo.admin.AdminService;
import app.folyo.auth.FolyoPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ModerationController {

    private final ReportService reports;
    private final ModerationService moderation;
    private final AdminService admin;

    public ModerationController(ReportService reports, ModerationService moderation, AdminService admin) {
        this.reports = reports;
        this.moderation = moderation;
        this.admin = admin;
    }

    // --- kullanici ---

    /** Gonderi, yanit, sohbet mesaji, sayfa ya da defter yazisi sikayeti; istenirse yazar engellenir. */
    @PostMapping("/api/me/reports")
    @ResponseStatus(HttpStatus.CREATED)
    public ReportService.ReportResult report(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody ReportService.ReportRequest body) {
        return reports.report(principal, body);
    }

    /** Topluluk kurallarini kabul: ilk paylasimdan once bir kez. */
    @PostMapping("/api/me/rules/accept")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void acceptRules(@AuthenticationPrincipal FolyoPrincipal principal) {
        moderation.acceptRules(principal.userId());
    }

    // --- yonetici ---

    @GetMapping("/api/admin/reports")
    public List<ReportService.ReportGroup> queue(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestParam(defaultValue = "OPEN") String status) {
        admin.requireAdmin(principal.userId());
        return reports.queue(!"RESOLVED".equals(status));
    }

    @GetMapping("/api/admin/reports/count")
    public Map<String, Long> openCount(@AuthenticationPrincipal FolyoPrincipal principal) {
        admin.requireAdmin(principal.userId());
        return Map.of("open", reports.openCount());
    }

    public record Decision(ReportService.TargetType targetType, String targetId, ReportService.Action action,
            Boolean suspendAuthor, String reason) {
    }

    @PostMapping("/api/admin/reports/resolve")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@AuthenticationPrincipal FolyoPrincipal principal, @RequestBody Decision body) {
        admin.requireAdmin(principal.userId());
        if (body.targetType() == null || body.targetId() == null || body.action() == null) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Bir karar seç");
        }
        reports.resolve(principal.userId(), body.targetType(), body.targetId(), body.action(),
                Boolean.TRUE.equals(body.suspendAuthor()), body.reason());
    }

    @GetMapping("/api/admin/suspensions")
    public List<ReportService.Suspension> suspensions(@AuthenticationPrincipal FolyoPrincipal principal) {
        admin.requireAdmin(principal.userId());
        return reports.suspensions();
    }

    public record SuspendRequest(String reason) {
    }

    @PostMapping("/api/admin/users/{userId}/suspension")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void suspend(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID userId,
            @RequestBody(required = false) SuspendRequest body) {
        admin.requireAdmin(principal.userId());
        if (userId.equals(principal.userId())) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "Kendini askıya alamazsın");
        }
        reports.suspend(userId, body == null ? null : body.reason());
    }

    @DeleteMapping("/api/admin/users/{userId}/suspension")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unsuspend(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID userId) {
        admin.requireAdmin(principal.userId());
        reports.unsuspend(userId);
    }
}

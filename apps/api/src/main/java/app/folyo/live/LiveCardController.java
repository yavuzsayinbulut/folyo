package app.folyo.live;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import app.folyo.auth.FolyoPrincipal;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class LiveCardController {

    private final LiveCardService liveCardService;

    public LiveCardController(LiveCardService liveCardService) {
        this.liveCardService = liveCardService;
    }

    @GetMapping("/api/public/cards/{cardId}/live")
    public ResponseEntity<LiveCardService.LiveView> live(@PathVariable UUID cardId,
            @AuthenticationPrincipal FolyoPrincipal principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(liveCardService.forPublicCard(cardId, principal));
    }
}

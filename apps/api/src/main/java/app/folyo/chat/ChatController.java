package app.folyo.chat;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.message.BlockRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ChatController {

    private final ChatService chats;
    private final BlockRepository blocks;

    public ChatController(ChatService chats, BlockRepository blocks) {
        this.chats = chats;
        this.blocks = blocks;
    }

    public record StartRequest(
            @NotBlank(message = "Önce bir mesaj yaz") @Size(max = ChatService.MAX_BODY, message = "Mesaj çok uzun") String body) {
    }

    public record ReadRequest(long seq) {
    }

    public record StateRequest(MemberState state) {
    }

    /** Profildeki "Mesaj gonder": sohbeti acar (gerekirse) ve ilk mesaji gonderir. */
    @PostMapping("/api/profiles/{username}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ChatService.Started start(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable String username,
            @Valid @RequestBody StartRequest body) {
        return chats.startFromProfile(principal, username, body.body());
    }

    @GetMapping("/api/me/conversations")
    public List<ChatService.ConversationView> list(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestParam(defaultValue = "CHATS") String folder) {
        return chats.list(principal, folder);
    }

    @GetMapping("/api/me/conversations/unread")
    public ChatService.Unread unread(@AuthenticationPrincipal FolyoPrincipal principal) {
        return chats.unread(principal.userId());
    }

    @GetMapping("/api/me/conversations/{id}")
    public ChatService.Thread thread(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id,
            @RequestParam(required = false) Long before) {
        return chats.thread(principal, id, before);
    }

    @PostMapping("/api/me/conversations/{id}/messages")
    @ResponseStatus(HttpStatus.CREATED)
    public ChatService.MessageView send(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id,
            @RequestBody ChatService.SendRequest body) {
        return chats.send(principal, id, body);
    }

    @PostMapping("/api/me/conversations/{id}/read")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void read(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id, @RequestBody ReadRequest body) {
        chats.markRead(principal.userId(), id, body.seq());
    }

    @PatchMapping("/api/me/conversations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void state(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id, @RequestBody StateRequest body) {
        chats.setState(principal, id, body.state());
    }

    @DeleteMapping("/api/me/conversations/{id}/messages/{messageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteMessage(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id,
            @PathVariable long messageId) {
        chats.deleteMessage(principal, id, messageId);
    }

    @PostMapping("/api/me/conversations/{id}/block")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void block(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        chats.block(principal, id);
    }

    @GetMapping("/api/me/chat-settings")
    public ChatService.Settings settings(@AuthenticationPrincipal FolyoPrincipal principal) {
        return chats.settings(principal.userId());
    }

    @PutMapping("/api/me/chat-settings")
    public ChatService.Settings saveSettings(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody ChatService.Settings body) {
        return chats.saveSettings(principal.userId(), body);
    }

    @GetMapping("/api/me/blocks")
    public List<BlockRepository.BlockedUser> blocks(@AuthenticationPrincipal FolyoPrincipal principal) {
        return blocks.list(principal.userId());
    }

    @DeleteMapping("/api/me/blocks/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void unblock(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID userId) {
        blocks.unblock(principal.userId(), userId);
    }
}

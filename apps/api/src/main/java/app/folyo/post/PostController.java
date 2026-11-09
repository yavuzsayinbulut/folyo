package app.folyo.post;

import app.folyo.auth.FolyoPrincipal;
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
public class PostController {

    private final PostService posts;

    public PostController(PostService posts) {
        this.posts = posts;
    }

    /** Kesfet: dogrulanmis hesaplarin herkese (ya da bakan kisiye) acik gonderileri, yeniden eskiye. */
    @GetMapping("/api/public/posts")
    public PostService.Page explore(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestParam(required = false) String cursor) {
        return posts.explore(principal, cursor);
    }

    @GetMapping("/api/public/profiles/{username}/posts")
    public PostService.Page profile(@PathVariable String username, @AuthenticationPrincipal FolyoPrincipal principal,
            @RequestParam(required = false) String cursor) {
        return posts.profileFeed(username, principal, cursor);
    }

    @GetMapping("/api/public/posts/{id}")
    public PostService.Thread thread(@PathVariable UUID id, @AuthenticationPrincipal FolyoPrincipal principal) {
        return posts.thread(id, principal);
    }

    @PostMapping("/api/me/posts")
    @ResponseStatus(HttpStatus.CREATED)
    public PostService.PostView create(@AuthenticationPrincipal FolyoPrincipal principal,
            @RequestBody PostService.CreateRequest body) {
        return posts.create(principal, body);
    }

    @DeleteMapping("/api/me/posts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        posts.delete(principal, id);
    }

    @PostMapping("/api/me/posts/{id}/like")
    public PostService.PostView like(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        return posts.like(principal, id, true);
    }

    @DeleteMapping("/api/me/posts/{id}/like")
    public PostService.PostView unlike(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        return posts.like(principal, id, false);
    }

    @PostMapping("/api/me/posts/{id}/approve")
    public PostService.PostView approve(@AuthenticationPrincipal FolyoPrincipal principal, @PathVariable UUID id) {
        return posts.approve(principal, id);
    }
}

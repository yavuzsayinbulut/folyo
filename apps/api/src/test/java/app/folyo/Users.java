package app.folyo;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;

import app.folyo.auth.FolyoPrincipal;
import app.folyo.auth.User;
import app.folyo.auth.UserService;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/** Yeni testler icin kullanici olusturma: dogrulanmis ya da dogrulanmamis. */
record Users(UserService userService, JdbcClient jdbc) {

    record Person(UUID id, String name, RequestPostProcessor auth) {
    }

    org.springframework.test.web.servlet.request.RequestPostProcessor auth(User user) {
        var principal = new FolyoPrincipal(user.getId(), user.getName());
        return authentication(UsernamePasswordAuthenticationToken.authenticated(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    }

    Person unverified() {
        String subject = UUID.randomUUID().toString();
        User user = userService.signIn("test", subject, null, "Kişi " + subject.substring(0, 5), null);
        var principal = new FolyoPrincipal(user.getId(), user.getName());
        return new Person(user.getId(), user.getName(), authentication(UsernamePasswordAuthenticationToken
                .authenticated(principal, null, List.of(new SimpleGrantedAuthority("ROLE_USER")))));
    }

    Person verified() {
        Person person = unverified();
        TestUsers.verify(jdbc, person.id());
        return person;
    }

    static String uniqueName() {
        return "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}

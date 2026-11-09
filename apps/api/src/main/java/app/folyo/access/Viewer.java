package app.folyo.access;

import java.util.UUID;

/** Sayfaya bakan kisi: anonim, giris yapmis, dogrulanmis ya da sayfanin sahibi. */
public record Viewer(UUID userId, boolean verified, boolean owner) {

    public static final Viewer ANONYMOUS = new Viewer(null, false, false);

    public boolean signedIn() {
        return userId != null;
    }

    public boolean sees(Audience audience) {
        if (owner) {
            return true;
        }
        return switch (audience) {
            case EVERYONE -> true;
            case SIGNED_IN -> signedIn();
            case VERIFIED -> verified;
            case ONLY_ME -> false;
        };
    }

    /** Yazma izni: sira onemli (kapali sayfada once "kapali" denir, giris/dogrulama istenmez). */
    public Interaction interaction(InteractionPolicy policy, boolean blocked) {
        if (policy == InteractionPolicy.NOBODY) {
            return Interaction.CLOSED;
        }
        if (owner) {
            return Interaction.OWNER;
        }
        if (!signedIn()) {
            return Interaction.SIGN_IN;
        }
        if (blocked) {
            return Interaction.BLOCKED;
        }
        return verified ? Interaction.ALLOWED : Interaction.VERIFY;
    }
}

package app.folyo.profile;

import app.folyo.access.Audience;
import app.folyo.access.InteractionPolicy;

/**
 * Sahibin gizlilik secimleri. indexable: arama motorlari sayfayi listeleyebilir mi (yalniz herkese acik sayfada
 * anlamlidir). Kitleler: kim gorebilir. comments/messages: kim yazabilir (her durumda dogrulanmis olmak gerekir).
 */
public record PrivacySettings(boolean indexable, Audience profile, Audience location, Audience localTime,
        Audience activity, Audience guestbook, InteractionPolicy comments, InteractionPolicy messages) {

    public static final PrivacySettings DEFAULT = new PrivacySettings(true, Audience.EVERYONE, Audience.EVERYONE,
            Audience.EVERYONE, Audience.EVERYONE, Audience.EVERYONE, InteractionPolicy.VERIFIED,
            InteractionPolicy.VERIFIED);

    public boolean complete() {
        return profile != null && location != null && localTime != null && activity != null && guestbook != null
                && comments != null && messages != null;
    }
}

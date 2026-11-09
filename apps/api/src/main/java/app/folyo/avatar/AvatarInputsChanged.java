package app.folyo.avatar;

import java.util.UUID;

/** Otomatik profil gorselinin girdileri (kartlar, bagli hesaplar, gorunen ad) degisti. */
public record AvatarInputsChanged(UUID userId) {
}

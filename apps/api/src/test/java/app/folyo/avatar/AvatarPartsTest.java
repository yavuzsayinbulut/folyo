package app.folyo.avatar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.util.List;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class AvatarPartsTest {

    @Test
    void artIsASquarePngAndDeterministic() throws Exception {
        List<AvatarPlatform> platforms = List.of(AvatarPlatform.SPOTIFY, AvatarPlatform.INSTAGRAM);
        byte[] first = AvatarArt.render("AL", platforms, 7);
        assertThat(AvatarArt.render("AL", platforms, 7)).isEqualTo(first);
        assertThat(AvatarArt.render("AL", List.of(AvatarPlatform.GITHUB), 7)).isNotEqualTo(first);
        var image = ImageIO.read(new ByteArrayInputStream(first));
        assertThat(image.getWidth()).isEqualTo(512).isEqualTo(image.getHeight());
        assertThat(AvatarArt.render("?", List.of(), 1)).isNotEmpty();
    }

    @Test
    void initialsFollowTurkishCasing() {
        assertThat(AvatarArt.initials("ilke şen")).isEqualTo("İŞ");
        assertThat(AvatarArt.initials("Ada Byron Lovelace")).isEqualTo("AL");
        assertThat(AvatarArt.initials("deniz")).isEqualTo("DE");
        assertThat(AvatarArt.initials("  ")).isEqualTo("?");
    }

    @Test
    void platformsAreRecognisedFromLinks() {
        assertThat(AvatarPlatform.forUrl("https://www.instagram.com/ada")).isEqualTo(AvatarPlatform.INSTAGRAM);
        assertThat(AvatarPlatform.forUrl("https://open.spotify.com/user/x")).isEqualTo(AvatarPlatform.SPOTIFY);
        assertThat(AvatarPlatform.forUrl("https://ornek.dev")).isEqualTo(AvatarPlatform.WEB);
        assertThat(AvatarPlatform.forUrl("not a url")).isNull();
    }

    @Test
    void downloadsOnlyGoToKnownPhotoHostsOverHttps() {
        assertThat(RemoteImages.allowed("https://i.scdn.co/image/ab67")).isNotNull();
        assertThat(RemoteImages.allowed("https://dgalywyr863hv.cloudfront.net/pictures/athletes/1/large.jpg")).isNotNull();
        for (String bad : List.of("http://i.scdn.co/x", "https://evil.example/x", "https://i.scdn.co:8443/x",
                "https://169.254.169.254/latest", "https://avatars.githubusercontent.com/u/1", "https://scdn.co.evil.example/x", "file:///etc/passwd")) {
            assertThatThrownBy(() -> RemoteImages.allowed(bad)).as(bad).isInstanceOf(RemoteImages.Rejected.class);
        }
    }
}

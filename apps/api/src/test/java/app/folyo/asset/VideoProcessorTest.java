package app.folyo.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

/** ffmpeg/ffprobe gerektirir (CI'da kurulu). */
class VideoProcessorTest {

    private final VideoProcessor processor = new VideoProcessor("ffmpeg", "ffprobe", Duration.ofMinutes(3));

    @TempDir
    Path dir;

    @Test
    void videoIsRemuxedWithoutReencodingAndLosesLocation() throws Exception {
        Path input = VideoFixtures.mp4WithLocation(dir, 2);
        assertThat(run("ffprobe", "-v", "error", "-show_entries", "format_tags", input.toString())).contains("location");

        Path work = Files.createDirectory(dir.resolve("work"));
        VideoProcessor.Processed result = processor.process(input, work);

        assertThat(result.contentType()).isEqualTo("video/mp4");
        assertThat(result.width()).isEqualTo(320);
        assertThat(result.height()).isEqualTo(240);
        assertThat(result.durationMs()).isBetween(1900, 2100);
        assertThat(run("ffprobe", "-v", "error", "-show_entries", "format_tags", result.file().toString()))
                .doesNotContain("location");
        // Yeniden kodlanmadi: goruntu paketleri birebir ayni.
        assertThat(md5(result.file())).isEqualTo(md5(input));
        assertThat(result.poster()).isNotEmpty();
        assertThat(result.posterWidth()).isEqualTo(320);
    }

    @Test
    void playlistsAndTooLongVideosAreRejected() throws Exception {
        Path playlist = dir.resolve("evil.mp4");
        Files.writeString(playlist, "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n");
        assertThatThrownBy(() -> processor.process(playlist, dir))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("desteklenmiyor");

        Path longVideo = VideoFixtures.mp4WithLocation(dir, 3);
        var strict = new VideoProcessor("ffmpeg", "ffprobe", Duration.ofSeconds(2));
        assertThatThrownBy(() -> strict.process(longVideo, Files.createDirectory(dir.resolve("w2"))))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("en fazla");
    }

    private static String md5(Path video) throws Exception {
        return run("ffmpeg", "-v", "error", "-i", video.toString(), "-map", "0:v", "-c", "copy", "-f", "md5", "-");
    }

    static String run(String... command) throws Exception {
        Process p = new ProcessBuilder(List.of(command)).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        p.waitFor();
        return out;
    }
}

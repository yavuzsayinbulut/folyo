package app.folyo.asset;

import java.nio.file.Path;

/** ffmpeg ile test videosu: renk deseni, konum etiketi (GPS) iceren MP4. */
public final class VideoFixtures {

    private VideoFixtures() {
    }

    public static Path mp4WithLocation(Path dir, int seconds) throws Exception {
        Path out = dir.resolve("sample-" + seconds + "-" + System.nanoTime() + ".mp4");
        Process p = new ProcessBuilder("ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                "testsrc=duration=" + seconds + ":size=320x240:rate=15", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-metadata", "location=+41.0082+028.9784/", "-movflags", "use_metadata_tags", out.toString())
                .redirectErrorStream(true).start();
        p.getInputStream().readAllBytes();
        if (p.waitFor() != 0) {
            throw new IllegalStateException("ffmpeg test videosu uretemedi");
        }
        return out;
    }
}

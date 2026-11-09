package app.folyo.asset;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Video: yeniden kodlanmaz (kalite birebir korunur). ffmpeg yalniz kapsayiciyi yeniden yazar: konum dahil tum
 * metadata silinir, MP4'te oynatma hemen baslasin diye dizin basa alinir (faststart). Kapak icin bir kare alinir.
 */
@Component
public class VideoProcessor {

    private static final Logger log = LoggerFactory.getLogger(VideoProcessor.class);
    private static final Set<String> CODECS = Set.of("h264", "hevc", "vp8", "vp9", "av1");
    private static final Duration TIMEOUT = Duration.ofMinutes(2);

    private final String ffmpeg;
    private final String ffprobe;
    private final Duration maxDuration;
    private final Semaphore slots = new Semaphore(2);
    private final JsonMapper json = JsonMapper.builder().build();

    public VideoProcessor(@Value("${folyo.media.ffmpeg:ffmpeg}") String ffmpeg,
            @Value("${folyo.media.ffprobe:ffprobe}") String ffprobe,
            @Value("${folyo.media.max-video-duration:PT3M}") Duration maxDuration) {
        this.ffmpeg = ffmpeg;
        this.ffprobe = ffprobe;
        this.maxDuration = maxDuration;
    }

    public record Processed(Path file, String contentType, String ext, int width, int height, int durationMs,
            byte[] poster, int posterWidth, int posterHeight) {
    }

    /** input gecici dosyadir; donen dosyalari cagiran siler. */
    public Processed process(Path input, Path workDir) {
        try {
            if (!slots.tryAcquire(30, TimeUnit.SECONDS)) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Şu an çok yoğun, biraz sonra tekrar dene");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Yükleme yarıda kaldı");
        }
        try {
            // Kapsayici turu ilk baytlardan belirlenir ve ffmpeg'e acikca verilir: dosya "video" diye yuklenen bir
            // oynatma listesi (HLS/concat) olsa bile ffmpeg sunucudaki baska dosyalari okuyamaz.
            String demuxer = container(input);
            JsonNode probe = probe(input, demuxer);
            JsonNode video = null;
            for (JsonNode stream : probe.path("streams")) {
                if ("video".equals(stream.path("codec_type").asString(null)) && video == null) {
                    video = stream;
                }
            }
            String formatName = probe.path("format").path("format_name").asString("");
            if (video == null || !CODECS.contains(video.path("codec_name").asString(""))) {
                throw bad("Bu video biçimi desteklenmiyor (MP4/MOV ya da WebM yükle)");
            }
            double seconds = probe.path("format").path("duration").asDouble(0);
            if (seconds <= 0) {
                throw bad("Videonun süresi okunamadı");
            }
            if (seconds > maxDuration.toSeconds() + 0.5) {
                throw bad("Video en fazla " + maxDuration.toMinutes() + " dakika olabilir");
            }
            boolean webm = formatName.contains("webm") || formatName.contains("matroska");
            String codec = video.path("codec_name").asString("");
            if (webm && !(codec.equals("vp8") || codec.equals("vp9") || codec.equals("av1"))) {
                throw bad("Bu video biçimi desteklenmiyor (MP4/MOV ya da WebM yükle)");
            }
            int width = video.path("width").asInt(0);
            int height = video.path("height").asInt(0);
            if (Math.abs(rotation(video)) % 180 == 90) {
                int t = width;
                width = height;
                height = t;
            }
            Path out = workDir.resolve("video." + (webm ? "webm" : "mp4"));
            List<String> remux = new ArrayList<>(List.of(ffmpeg, "-v", "error", "-y", "-protocol_whitelist", "file",
                    "-f", demuxer, "-i", input.toString(),
                    "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy", "-map_metadata", "-1", "-map_metadata:s", "-1",
                    "-map_chapters", "-1", "-fflags", "+bitexact"));
            if (webm) {
                remux.addAll(List.of("-f", "webm"));
            } else {
                remux.addAll(List.of("-movflags", "+faststart", "-f", "mp4"));
            }
            remux.add(out.toString());
            run(remux, "Video işlenemedi");

            Path poster = workDir.resolve("poster.jpg");
            double at = Math.min(1.0, seconds / 2);
            run(List.of(ffmpeg, "-v", "error", "-y", "-protocol_whitelist", "file", "-ss", String.format(java.util.Locale.ROOT, "%.2f", at), "-i",
                    out.toString(), "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", poster.toString()),
                    "Videonun kapağı alınamadı");
            byte[] posterBytes = Files.readAllBytes(poster);
            var posterImage = javax.imageio.ImageIO.read(poster.toFile());
            return new Processed(out, webm ? "video/webm" : "video/mp4", webm ? "webm" : "mp4", width, height,
                    (int) Math.round(seconds * 1000), posterBytes, posterImage == null ? 0 : posterImage.getWidth(),
                    posterImage == null ? 0 : posterImage.getHeight());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Video okunamadı", e);
        } finally {
            slots.release();
        }
    }

    private JsonNode probe(Path input, String demuxer) throws IOException {
        String output = run(List.of(ffprobe, "-v", "error", "-protocol_whitelist", "file", "-f", demuxer,
                "-print_format", "json", "-show_format", "-show_streams", input.toString()), "Video okunamadı");
        return json.readTree(output);
    }

    /** MP4/MOV: 4. bayttan itibaren "ftyp" kutusu. WebM/MKV: EBML basligi. Baska bir sey kabul edilmez. */
    static String container(Path input) throws IOException {
        byte[] head = new byte[12];
        try (var in = Files.newInputStream(input)) {
            if (in.readNBytes(head, 0, 12) < 12) {
                throw bad("Video okunamadı");
            }
        }
        if (head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p') {
            return "mov";
        }
        if ((head[0] & 0xFF) == 0x1A && (head[1] & 0xFF) == 0x45 && (head[2] & 0xFF) == 0xDF && (head[3] & 0xFF) == 0xA3) {
            return "matroska";
        }
        throw bad("Bu video biçimi desteklenmiyor (MP4/MOV ya da WebM yükle)");
    }

    private static int rotation(JsonNode video) {
        for (JsonNode side : video.path("side_data_list")) {
            if (side.has("rotation")) {
                return side.path("rotation").asInt(0);
            }
        }
        return video.path("tags").path("rotate").asInt(0);
    }

    private static String run(List<String> command, String failure) throws IOException {
        Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
        try {
            byte[] output = process.getInputStream().readAllBytes();
            if (!process.waitFor(TIMEOUT.toSeconds(), TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw bad(failure);
            }
            if (process.exitValue() != 0) {
                log.info("{} basarisiz: {}", command.getFirst(), new String(output, StandardCharsets.UTF_8).strip());
                throw bad(failure);
            }
            return new String(output, StandardCharsets.UTF_8);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            throw bad(failure);
        }
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}

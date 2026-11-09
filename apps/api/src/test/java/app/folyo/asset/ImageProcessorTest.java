package app.folyo.asset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.folyo.media.PhotoFixtures;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class ImageProcessorTest {

    private final ImageProcessor processor = new ImageProcessor();
    private final List<ImageProcessor.Spec> specs = List.of(new ImageProcessor.Spec("thumb", 480, false),
            new ImageProcessor.Spec("large", 1600, false));

    @Test
    void jpegKeepsEveryCompressedByteButLosesGpsAndTrailers() throws Exception {
        byte[] input = withTrailer(PhotoFixtures.jpegWithExifOrientation(3000, 1000, 6), "GPS-TRAILER 41.0N");
        assertThat(contains(input, "GPS")).isTrue();

        ImageProcessor.Processed result = processor.process(input, specs);

        assertThat(result.format()).isEqualTo(ImageProcessor.Format.JPEG);
        assertThat(contains(result.original(), "GPS")).isFalse();
        // Kayipsiz: sikistirilmis goruntu verisi (SOS'tan EOI'ye) birebir ayni.
        assertThat(Arrays.equals(scan(result.original()), scan(input))).isTrue();
        // Yon bilgisi korunur: goruntuleyiciler fotografi dik gosterir.
        assertThat(ImageProcessor.orientation(result.original())).isEqualTo(6);
        assertThat(result.width()).isEqualTo(1000);
        assertThat(result.height()).isEqualTo(3000);
        ImageProcessor.Variant large = result.variants().get("large");
        assertThat(large.height()).isEqualTo(1600);
        assertThat(large.width()).isLessThan(large.height());
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(large.bytes()));
        assertThat(decoded.getHeight()).isEqualTo(1600);
        assertThat(result.variants().get("thumb").height()).isEqualTo(480);
    }

    @Test
    void uprightJpegGetsNoExifAtAll() throws Exception {
        ImageProcessor.Processed result = processor.process(PhotoFixtures.jpegWithExifOrientation(800, 600, 1), specs);
        assertThat(contains(result.original(), "Exif")).isFalse();
        assertThat(result.width()).isEqualTo(800);
    }

    @Test
    void pngDropsTextChunksAndKeepsPixelsAndAlpha() throws Exception {
        BufferedImage image = new BufferedImage(40, 20, BufferedImage.TYPE_INT_ARGB);
        image.setRGB(3, 3, 0x80FF0000);
        var out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        byte[] input = insertPngText(out.toByteArray(), "Comment", "GPS 41.0N");
        assertThat(contains(input, "GPS")).isTrue();

        ImageProcessor.Processed result = processor.process(input, specs);

        assertThat(result.format()).isEqualTo(ImageProcessor.Format.PNG);
        assertThat(contains(result.original(), "GPS")).isFalse();
        BufferedImage decoded = ImageIO.read(new ByteArrayInputStream(result.original()));
        assertThat(decoded.getRGB(3, 3)).isEqualTo(0x80FF0000);
        assertThat(result.variants().get("thumb").contentType()).isEqualTo("image/png");
    }

    @Test
    void webpExifAndXmpChunksAreRemovedAndFlagsCleared() {
        byte[] vp8x = new byte[10];
        vp8x[0] = 0x0C; // EXIF + XMP bayraklari
        byte[] riff = riff(chunk("VP8X", vp8x), chunk("VP8L", new byte[] {1, 2, 3}), chunk("EXIF", "GPS".getBytes()),
                chunk("XMP ", "<x>GPS</x>".getBytes()));
        byte[] stripped = LosslessMetadata.stripWebp(riff);
        assertThat(contains(stripped, "GPS")).isFalse();
        assertThat(contains(stripped, "EXIF")).isFalse();
        assertThat(stripped[12 + 8] & 0x0C).isZero();
        int size = ByteBuffer.wrap(stripped, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
        assertThat(size).isEqualTo(stripped.length - 8);
        assertThat(contains(stripped, "VP8L")).isTrue();
    }

    @Test
    void rejectsNonImages() {
        assertThatThrownBy(() -> processor.process("merhaba".getBytes(StandardCharsets.UTF_8), specs))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("JPEG, PNG veya WebP");
        byte[] fakeJpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0x00, 0x01, 0x02};
        assertThatThrownBy(() -> processor.process(fakeJpeg, specs))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("okunamadı");
    }

    private static byte[] scan(byte[] jpeg) {
        for (int i = 2; i + 1 < jpeg.length; i++) {
            if ((jpeg[i] & 0xFF) == 0xFF && (jpeg[i + 1] & 0xFF) == 0xDA) {
                for (int j = i + 2; j + 1 < jpeg.length; j++) {
                    if ((jpeg[j] & 0xFF) == 0xFF && (jpeg[j + 1] & 0xFF) == 0xD9) {
                        return Arrays.copyOfRange(jpeg, i, j + 2);
                    }
                }
            }
        }
        throw new AssertionError("SOS bulunamadi");
    }

    private static byte[] withTrailer(byte[] jpeg, String trailer) {
        byte[] extra = trailer.getBytes(StandardCharsets.US_ASCII);
        byte[] out = Arrays.copyOf(jpeg, jpeg.length + extra.length);
        System.arraycopy(extra, 0, out, jpeg.length, extra.length);
        return out;
    }

    private static byte[] insertPngText(byte[] png, String key, String value) {
        byte[] data = (key + "\0" + value).getBytes(StandardCharsets.ISO_8859_1);
        ByteBuffer chunk = ByteBuffer.allocate(12 + data.length);
        chunk.putInt(data.length).put("tEXt".getBytes(StandardCharsets.US_ASCII)).put(data);
        CRC32 crc = new CRC32();
        crc.update("tEXt".getBytes(StandardCharsets.US_ASCII));
        crc.update(data);
        chunk.putInt((int) crc.getValue());
        // IHDR (8 + 25 bayt) sonrasina eklenir.
        int at = 8 + 25;
        byte[] out = new byte[png.length + chunk.capacity()];
        System.arraycopy(png, 0, out, 0, at);
        System.arraycopy(chunk.array(), 0, out, at, chunk.capacity());
        System.arraycopy(png, at, out, at + chunk.capacity(), png.length - at);
        return out;
    }

    private static byte[] chunk(String fourcc, byte[] data) {
        int padded = data.length + (data.length & 1);
        ByteBuffer b = ByteBuffer.allocate(8 + padded).order(ByteOrder.LITTLE_ENDIAN);
        b.put(fourcc.getBytes(StandardCharsets.US_ASCII)).putInt(data.length).put(data);
        return b.array();
    }

    private static byte[] riff(byte[]... chunks) {
        int length = Arrays.stream(chunks).mapToInt(c -> c.length).sum();
        ByteBuffer b = ByteBuffer.allocate(12 + length).order(ByteOrder.LITTLE_ENDIAN);
        b.put("RIFF".getBytes(StandardCharsets.US_ASCII)).putInt(4 + length).put("WEBP".getBytes(StandardCharsets.US_ASCII));
        for (byte[] c : chunks) {
            b.put(c);
        }
        return b.array();
    }

    private static boolean contains(byte[] haystack, String needle) {
        return new String(haystack, StandardCharsets.ISO_8859_1).contains(needle);
    }
}

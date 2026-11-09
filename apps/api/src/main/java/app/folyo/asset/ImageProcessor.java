package app.folyo.asset;

import com.drew.imaging.ImageMetadataReader;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Yuklenen gorsel: orijinal kalite korunur (yalniz metadata kayipsiz silinir); listelerde hizli acilsin diye
 * yuksek kaliteli kucuk kopyalar ayrica uretilir. Tur, dosya adina degil ilk baytlara bakilarak belirlenir.
 */
@Component
public class ImageProcessor {

    static final long MAX_SOURCE_PIXELS = 60_000_000L;
    private static final float JPEG_QUALITY = 0.9f;
    private static final int MAX_CONCURRENT = 2;

    private final Semaphore slots = new Semaphore(MAX_CONCURRENT);

    public enum Format {
        JPEG("image/jpeg", "jpg"),
        PNG("image/png", "png"),
        WEBP("image/webp", "webp");

        final String contentType;
        final String ext;

        Format(String contentType, String ext) {
            this.contentType = contentType;
            this.ext = ext;
        }
    }

    /** name: kopyanin adi (thumb, large, avatar...). square: ortadan kare kirpilir. */
    public record Spec(String name, int maxEdge, boolean square) {
    }

    public record Variant(byte[] bytes, String contentType, String ext, int width, int height) {
    }

    public record Processed(Format format, byte[] original, int width, int height, Map<String, Variant> variants) {
    }

    public Processed process(byte[] input, List<Spec> specs) {
        Format format = detect(input);
        acquire();
        try {
            int orientation = format == Format.JPEG ? orientation(input) : 1;
            byte[] original = switch (format) {
                case JPEG -> LosslessMetadata.stripJpeg(input, orientation);
                case PNG -> LosslessMetadata.stripPng(input);
                case WEBP -> LosslessMetadata.stripWebp(input);
            };
            Decoded decoded = decode(input, specs.stream().mapToInt(Spec::maxEdge).max().orElse(0));
            boolean swap = orientation >= 5 && orientation <= 8;
            int width = swap ? decoded.height : decoded.width;
            int height = swap ? decoded.width : decoded.height;
            BufferedImage oriented = applyOrientation(decoded.image, orientation);
            boolean alpha = oriented.getColorModel().hasAlpha();
            Map<String, Variant> variants = new LinkedHashMap<>();
            for (Spec spec : specs) {
                BufferedImage source = spec.square() ? centerSquare(oriented) : oriented;
                BufferedImage scaled = fitWithin(source, spec.maxEdge(), alpha);
                byte[] bytes = alpha ? encodePng(scaled) : encodeJpeg(scaled);
                variants.put(spec.name(), new Variant(bytes, alpha ? "image/png" : "image/jpeg", alpha ? "png" : "jpg",
                        scaled.getWidth(), scaled.getHeight()));
            }
            return new Processed(format, original, width, height, variants);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bu görsel okunamadı");
        } finally {
            slots.release();
        }
    }

    /** Uzantiya ya da istemcinin bildirdigi tipe degil, dosyanin ilk baytlarina bakilir. */
    public static Format detect(byte[] b) {
        if (b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) {
            return Format.JPEG;
        }
        if (b.length > 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
            return Format.PNG;
        }
        if (b.length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E'
                && b[10] == 'B' && b[11] == 'P') {
            return Format.WEBP;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Yalnız JPEG, PNG veya WebP yükleyebilirsin");
    }

    private void acquire() {
        try {
            if (!slots.tryAcquire(20, TimeUnit.SECONDS)) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Şu an çok yoğun, biraz sonra tekrar dene");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Yükleme yarıda kaldı");
        }
    }

    private record Decoded(BufferedImage image, int width, int height) {
    }

    /** Boyut once basliktan okunur (dev gorselle bellek doldurulamaz); kopyalar icin gerektiginden buyuk okunmaz. */
    private static Decoded decode(byte[] input, int largestEdge) {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new IllegalArgumentException("okuyucu yok");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if ((long) width * height > MAX_SOURCE_PIXELS) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Görsel çözünürlüğü çok yüksek");
                }
                ImageReadParam param = reader.getDefaultReadParam();
                int step = largestEdge <= 0 ? 1 : Math.max(1, Math.max(width, height) / largestEdge);
                if (step > 1) {
                    param.setSourceSubsampling(step, step, 0, 0);
                }
                return new Decoded(reader.read(0, param), width, height);
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("okunamadi", e);
        }
    }

    static int orientation(byte[] input) {
        try {
            Metadata metadata = ImageMetadataReader.readMetadata(new ByteArrayInputStream(input));
            ExifIFD0Directory exif = metadata.getFirstDirectoryOfType(ExifIFD0Directory.class);
            if (exif != null && exif.containsTag(ExifIFD0Directory.TAG_ORIENTATION)) {
                return exif.getInt(ExifIFD0Directory.TAG_ORIENTATION);
            }
        } catch (Exception e) {
            // Bozuk ya da eksik EXIF: fotograf oldugu gibi kullanilir.
        }
        return 1;
    }

    /** Telefonlarin cogu fotografi yan cekip EXIF'e "dondur" notu duser; kopyalara donus uygulanir. */
    static BufferedImage applyOrientation(BufferedImage source, int orientation) {
        int quarterTurns = switch (orientation) {
            case 3, 4 -> 2;
            case 6, 5 -> 1;
            case 8, 7 -> 3;
            default -> 0;
        };
        if (quarterTurns == 0) {
            return source;
        }
        int w = source.getWidth();
        int h = source.getHeight();
        boolean swap = quarterTurns % 2 == 1;
        int type = source.getColorModel().hasAlpha() ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage rotated = new BufferedImage(swap ? h : w, swap ? w : h, type);
        Graphics2D g = rotated.createGraphics();
        try {
            g.translate(rotated.getWidth() / 2.0, rotated.getHeight() / 2.0);
            g.rotate(Math.toRadians(90.0 * quarterTurns));
            g.translate(-w / 2.0, -h / 2.0);
            g.drawImage(source, 0, 0, null);
        } finally {
            g.dispose();
        }
        return rotated;
    }

    private static BufferedImage centerSquare(BufferedImage source) {
        int edge = Math.min(source.getWidth(), source.getHeight());
        return source.getSubimage((source.getWidth() - edge) / 2, (source.getHeight() - edge) / 2, edge, edge);
    }

    private static BufferedImage fitWithin(BufferedImage source, int maxEdge, boolean keepAlpha) {
        int w = source.getWidth();
        int h = source.getHeight();
        double scale = Math.min(1.0, (double) maxEdge / Math.max(w, h));
        int targetW = Math.max(1, (int) Math.round(w * scale));
        int targetH = Math.max(1, (int) Math.round(h * scale));
        int type = keepAlpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage target = new BufferedImage(targetW, targetH, type);
        Graphics2D g = target.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(source, 0, 0, targetW, targetH, null);
        } finally {
            g.dispose();
        }
        return target;
    }

    private static byte[] encodeJpeg(BufferedImage image) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        var out = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(stream);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(JPEG_QUALITY);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new IllegalStateException("JPEG yazilamadi", e);
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    private static byte[] encodePng(BufferedImage image) {
        var out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException e) {
            throw new IllegalStateException("PNG yazilamadi", e);
        }
        return out.toByteArray();
    }
}

package app.folyo.asset;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Gorselin piksellerine dokunmadan (yeniden sikistirmadan) kisisel metadata'yi siler: kalite birebir korunur.
 * - JPEG: EXIF/XMP (APP1), IPTC (APP13), yorum (COM) ve diger uygulama bolumleri cikar; JFIF (APP0), renk profili
 *   (APP2 ICC) ve Adobe (APP14) kalir. Fotograf yan cekildiyse yalniz "yon" bilgisini tasiyan kucuk bir EXIF eklenir.
 * - PNG: metin (tEXt/zTXt/iTXt), EXIF (eXIf) ve zaman (tIME) parcalari cikar.
 * - WebP: EXIF ve XMP parcalari cikar, VP8X bayraklari duzeltilir.
 */
public final class LosslessMetadata {

    private LosslessMetadata() {
    }

    public static byte[] stripJpeg(byte[] in, int orientation) {
        if (in.length < 4 || (in[0] & 0xFF) != 0xFF || (in[1] & 0xFF) != 0xD8) {
            throw new IllegalArgumentException("JPEG degil");
        }
        var out = new ByteArrayOutputStream(in.length);
        out.write(0xFF);
        out.write(0xD8);
        boolean orientationWritten = orientation <= 1 || orientation > 8;
        int i = 2;
        while (i < in.length) {
            if ((in[i] & 0xFF) != 0xFF) {
                throw new IllegalArgumentException("JPEG bolumu bozuk");
            }
            int marker = in[i + 1] & 0xFF;
            if (marker == 0xFF) {
                i++;
                continue;
            }
            if (marker == 0xDA || marker == 0xD9) {
                // Goruntu verisi basladi: ana goruntunun sonuna (EOI) kadar oldugu gibi kopyalanir. Sonrasina eklenen
                // ikinci goruntuler (derinlik haritasi, onizleme) ve marka kuyruklari konum tasiyabilir; atilir.
                if (!orientationWritten) {
                    writeOrientation(out, orientation);
                }
                int end = endOfImage(in, i);
                out.write(in, i, end - i);
                return out.toByteArray();
            }
            if (marker >= 0xD0 && marker <= 0xD7 || marker == 0x01) {
                out.write(in, i, 2);
                i += 2;
                continue;
            }
            int length = ((in[i + 2] & 0xFF) << 8) | (in[i + 3] & 0xFF);
            if (length < 2 || i + 2 + length > in.length) {
                throw new IllegalArgumentException("JPEG bolum uzunlugu bozuk");
            }
            boolean icc = marker == 0xE2 && length >= 14
                    && new String(in, i + 4, 11, java.nio.charset.StandardCharsets.US_ASCII).equals("ICC_PROFILE");
            boolean keep = marker == 0xE0 || icc || marker == 0xEE || marker < 0xE0 || (marker > 0xEF && marker != 0xFE);
            if (keep) {
                out.write(in, i, 2 + length);
            }
            if (marker == 0xE0 && !orientationWritten) {
                writeOrientation(out, orientation);
                orientationWritten = true;
            }
            i += 2 + length;
        }
        return out.toByteArray();
    }

    /** SOS'tan sonraki ilk FF D9 ana goruntunun sonudur (sikistirilmis veride FF hep 00 ya da RST ile gelir). */
    private static int endOfImage(byte[] in, int from) {
        for (int k = from + 2; k + 1 < in.length; k++) {
            if ((in[k] & 0xFF) == 0xFF && (in[k + 1] & 0xFF) == 0xD9) {
                return k + 2;
            }
        }
        return in.length;
    }

    /** Yalniz Orientation (0x0112) iceren en kucuk EXIF bolumu. */
    private static void writeOrientation(ByteArrayOutputStream out, int orientation) {
        byte[] exif = {
                'E', 'x', 'i', 'f', 0, 0,
                'M', 'M', 0, 0x2A, 0, 0, 0, 8,
                0, 1,
                0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, (byte) orientation, 0, 0,
                0, 0, 0, 0};
        int length = exif.length + 2;
        out.write(0xFF);
        out.write(0xE1);
        out.write(length >> 8);
        out.write(length & 0xFF);
        out.write(exif, 0, exif.length);
    }

    public static byte[] stripPng(byte[] in) {
        byte[] signature = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
        for (int k = 0; k < signature.length; k++) {
            if (in.length < 8 || in[k] != signature[k]) {
                throw new IllegalArgumentException("PNG degil");
            }
        }
        var out = new ByteArrayOutputStream(in.length);
        out.write(in, 0, 8);
        int i = 8;
        while (i + 12 <= in.length) {
            int length = ByteBuffer.wrap(in, i, 4).getInt();
            if (length < 0 || i + 12L + length > in.length) {
                throw new IllegalArgumentException("PNG parcasi bozuk");
            }
            String type = new String(in, i + 4, 4, java.nio.charset.StandardCharsets.US_ASCII);
            boolean drop = type.equals("tEXt") || type.equals("zTXt") || type.equals("iTXt") || type.equals("eXIf")
                    || type.equals("tIME");
            if (!drop) {
                out.write(in, i, 12 + length);
            }
            i += 12 + length;
            if (type.equals("IEND")) {
                break;
            }
        }
        return out.toByteArray();
    }

    public static byte[] stripWebp(byte[] in) {
        if (in.length < 12 || !new String(in, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                || !new String(in, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) {
            throw new IllegalArgumentException("WebP degil");
        }
        var body = new ByteArrayOutputStream(in.length);
        int i = 12;
        while (i + 8 <= in.length) {
            String fourcc = new String(in, i, 4, java.nio.charset.StandardCharsets.US_ASCII);
            int size = ByteBuffer.wrap(in, i + 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt();
            int padded = size + (size & 1);
            if (size < 0 || i + 8L + padded > in.length) {
                throw new IllegalArgumentException("WebP parcasi bozuk");
            }
            if (!fourcc.equals("EXIF") && !fourcc.equals("XMP ")) {
                int start = body.size();
                body.write(in, i, 8 + padded);
                if (fourcc.equals("VP8X")) {
                    byte[] so = body.toByteArray();
                    so[start + 8] = (byte) (so[start + 8] & ~0x0C);
                    body.reset();
                    body.write(so, 0, so.length);
                }
            }
            i += 8 + padded;
        }
        byte[] chunks = body.toByteArray();
        ByteBuffer out = ByteBuffer.allocate(12 + chunks.length).order(ByteOrder.LITTLE_ENDIAN);
        out.put(new byte[] {'R', 'I', 'F', 'F'}).putInt(4 + chunks.length).put(new byte[] {'W', 'E', 'B', 'P'}).put(chunks);
        return out.array();
    }
}

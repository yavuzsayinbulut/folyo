package app.folyo.avatar;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.LinearGradientPaint;
import java.awt.MultipleGradientPaint;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.TextLayout;
import java.awt.geom.Arc2D;
import java.awt.geom.Ellipse2D;
import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.awt.geom.Rectangle2D;
import java.awt.geom.RoundRectangle2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Random;
import java.util.Set;
import javax.imageio.ImageIO;

/**
 * Bagli platformlardan ozgun profil gorseli: platform renklerinden gradyan, her platform icin soyut bir motif
 * (ses dalgasi, objektif, katki izgarasi, rota...) ve ortada bas harfler. Ayni girdiler ayni gorseli uretir.
 * Gorsel yuvarlak kirpilarak gosterilir; motifler daire icinde kalacak sekilde yerlestirilir.
 */
public final class AvatarArt {

    static final int SIZE = 512;
    private static final Color FOLYO = new Color(0x534AB7);
    private static final Color INK = new Color(255, 255, 255);

    private AvatarArt() {
    }

    /** @param platforms en fazla ilk 3'u kullanilir; bos ise folyo renkleri */
    public static byte[] render(String initials, List<AvatarPlatform> platforms, long seed) {
        List<AvatarPlatform> used = platforms.stream().distinct().limit(3).toList();
        Random random = new Random(seed ^ used.hashCode());
        BufferedImage image = new BufferedImage(SIZE, SIZE, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);

            background(g, used, random);
            List<Point2D> spots = spots(used.size());
            for (int i = 0; i < used.size(); i++) {
                motif(g, used.get(i).motif(), spots.get(i), random);
            }
            initials(g, initials);
        } finally {
            g.dispose();
        }
        var out = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, "png", out);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    /** "Ada Lovelace" -> "AL", "ada" -> "AD". */
    public static String initials(String name) {
        String[] parts = name == null ? new String[0] : name.strip().split("\\s+");
        Locale tr = Locale.forLanguageTag("tr");
        if (parts.length == 0 || parts[0].isEmpty()) {
            return "?";
        }
        String letters = parts.length > 1
                ? first(parts[0]) + first(parts[parts.length - 1])
                : parts[0].codePoints().limit(2).collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append).toString();
        return letters.toUpperCase(tr);
    }

    private static String first(String word) {
        return new String(Character.toChars(word.codePointAt(0)));
    }

    private static void background(Graphics2D g, List<AvatarPlatform> platforms, Random random) {
        // Once her platformun ana rengi (iki platform da gradyanda gorunsun), sonra ikincil renkler.
        Set<Color> unique = new LinkedHashSet<>();
        platforms.forEach(p -> unique.add(p.colors().getFirst()));
        platforms.forEach(p -> unique.addAll(p.colors()));
        List<Color> stops = new ArrayList<>(unique.stream().limit(3).toList());
        if (stops.isEmpty()) {
            stops.add(FOLYO);
        }
        if (stops.size() == 1) {
            stops.add(shade(stops.getFirst(), 0.55f));
        }
        // Gradyan yonu kisiye gore biraz degisir; ayni platformlari baglayan iki kisinin gorseli birebir ayni olmaz.
        double angle = Math.toRadians(30 + random.nextInt(60));
        double cx = SIZE / 2.0;
        double dx = Math.cos(angle) * SIZE / 2.0;
        double dy = Math.sin(angle) * SIZE / 2.0;
        float[] fractions = new float[stops.size()];
        for (int i = 0; i < fractions.length; i++) {
            fractions[i] = (float) i / (fractions.length - 1);
        }
        g.setPaint(new LinearGradientPaint(new Point2D.Double(cx - dx, cx - dy), new Point2D.Double(cx + dx, cx + dy),
                fractions, stops.toArray(Color[]::new), MultipleGradientPaint.CycleMethod.NO_CYCLE));
        g.fillRect(0, 0, SIZE, SIZE);
        // Kenarlara dogru hafif koyulasma: derinlik ve bas harflerin okunurlugu.
        g.setPaint(new RadialGradientPaint(new Point2D.Double(cx, cx * 0.9), SIZE * 0.72f, new float[] {0f, 1f},
                new Color[] {new Color(0, 0, 0, 0), new Color(0, 0, 0, 70)}));
        g.fillRect(0, 0, SIZE, SIZE);
    }

    /** Motiflerin merkezleri: yuvarlak kirpmada gorunur kalan halka uzerinde, bas harflerin ustu ve alt yanlari. */
    private static List<Point2D> spots(int count) {
        Point2D top = new Point2D.Double(SIZE * 0.5, SIZE * 0.19);
        Point2D left = new Point2D.Double(SIZE * 0.25, SIZE * 0.76);
        Point2D right = new Point2D.Double(SIZE * 0.75, SIZE * 0.76);
        return switch (count) {
            case 1 -> List.of(top);
            case 2 -> List.of(left, right);
            default -> List.of(top, left, right);
        };
    }

    private static void motif(Graphics2D g, AvatarPlatform.Motif motif, Point2D at, Random random) {
        double x = at.getX();
        double y = at.getY();
        double r = SIZE * 0.115;
        Color line = new Color(255, 255, 255, 120);
        Color fill = new Color(255, 255, 255, 95);
        g.setStroke(new BasicStroke(SIZE * 0.022f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.setColor(line);
        switch (motif) {
            case MUSIC -> {
                // Ses dalgalari: ortadaki noktadan yayilan uc yay.
                g.setColor(fill);
                g.fill(new Ellipse2D.Double(x - r * 0.2, y - r * 0.2, r * 0.4, r * 0.4));
                g.setColor(line);
                for (double k : new double[] {0.55, 0.95, 1.35}) {
                    g.draw(new Arc2D.Double(x - r * k, y - r * k, 2 * r * k, 2 * r * k, -45, 90, Arc2D.OPEN));
                    g.draw(new Arc2D.Double(x - r * k, y - r * k, 2 * r * k, 2 * r * k, 135, 90, Arc2D.OPEN));
                }
            }
            case PHOTO -> {
                // Fotograf makinesi: yuvarlatilmis govde, objektif, flas noktasi.
                g.draw(new RoundRectangle2D.Double(x - r, y - r * 0.78, 2 * r, 1.56 * r, r * 0.7, r * 0.7));
                g.draw(new Ellipse2D.Double(x - r * 0.42, y - r * 0.42, r * 0.84, r * 0.84));
                g.setColor(fill);
                g.fill(new Ellipse2D.Double(x + r * 0.55, y - r * 0.6, r * 0.22, r * 0.22));
            }
            case CODE -> {
                // Katki izgarasi: 4x4 kare, yogunlugu kisiye gore degisen.
                double cell = r * 0.4;
                double gap = r * 0.13;
                double start = -(4 * cell + 3 * gap) / 2;
                for (int row = 0; row < 4; row++) {
                    for (int col = 0; col < 4; col++) {
                        g.setColor(new Color(255, 255, 255, 50 + random.nextInt(130)));
                        g.fill(new RoundRectangle2D.Double(x + start + col * (cell + gap), y + start + row * (cell + gap),
                                cell, cell, cell * 0.35, cell * 0.35));
                    }
                }
            }
            case SPORT -> {
                // Rota: zikzak cizgi, baslangic ve bitis noktalari.
                GeneralPath route = new GeneralPath();
                route.moveTo(x - r * 1.1, y + r * 0.55);
                route.lineTo(x - r * 0.45, y - r * 0.25);
                route.lineTo(x + r * 0.05, y + r * 0.35);
                route.lineTo(x + r * 0.5, y - r * 0.55);
                route.lineTo(x + r * 1.1, y - r * 0.05);
                g.draw(route);
                g.setColor(fill);
                double dot = r * 0.32;
                g.fill(new Ellipse2D.Double(x - r * 1.1 - dot / 2, y + r * 0.55 - dot / 2, dot, dot));
                g.fill(new Ellipse2D.Double(x + r * 1.1 - dot / 2, y - r * 0.05 - dot / 2, dot, dot));
            }
            case VIDEO -> {
                // Ekran ve oynat ucgeni.
                g.draw(new RoundRectangle2D.Double(x - r * 1.05, y - r * 0.72, 2.1 * r, 1.44 * r, r * 0.45, r * 0.45));
                GeneralPath play = new GeneralPath();
                play.moveTo(x - r * 0.28, y - r * 0.38);
                play.lineTo(x + r * 0.42, y);
                play.lineTo(x - r * 0.28, y + r * 0.38);
                play.closePath();
                g.setColor(fill);
                g.fill(play);
            }
            case SOCIAL -> {
                // Konusma balonu ve uc nokta.
                GeneralPath bubble = new GeneralPath(new RoundRectangle2D.Double(x - r, y - r * 0.7, 2 * r, 1.3 * r,
                        r * 0.6, r * 0.6));
                g.draw(bubble);
                GeneralPath tail = new GeneralPath();
                tail.moveTo(x - r * 0.45, y + r * 0.6);
                tail.lineTo(x - r * 0.7, y + r * 1.05);
                tail.lineTo(x - r * 0.05, y + r * 0.6);
                g.draw(tail);
                g.setColor(fill);
                double dot = r * 0.26;
                for (int i = -1; i <= 1; i++) {
                    g.fill(new Ellipse2D.Double(x + i * r * 0.5 - dot / 2, y - r * 0.05 - dot / 2, dot, dot));
                }
            }
            case WEB -> {
                // Dunya: daire, meridyen ve ekvator.
                g.draw(new Ellipse2D.Double(x - r, y - r, 2 * r, 2 * r));
                g.draw(new Ellipse2D.Double(x - r * 0.45, y - r, r * 0.9, 2 * r));
                g.draw(new java.awt.geom.Line2D.Double(x - r, y, x + r, y));
            }
        }
    }

    private static void initials(Graphics2D g, String text) {
        Font font = new Font(Font.SANS_SERIF, Font.BOLD, text.codePointCount(0, text.length()) > 1 ? 168 : 196);
        FontRenderContext context = g.getFontRenderContext();
        TextLayout layout = new TextLayout(text, font, context);
        Rectangle2D bounds = layout.getBounds();
        float x = (float) (SIZE / 2.0 - bounds.getWidth() / 2 - bounds.getX());
        float y = (float) (SIZE / 2.0 - bounds.getHeight() / 2 - bounds.getY());
        g.setColor(new Color(0, 0, 0, 60));
        layout.draw(g, x + 3, y + 5);
        g.setColor(INK);
        layout.draw(g, x, y);
    }

    private static Color shade(Color color, float factor) {
        return new Color(Math.round(color.getRed() * factor), Math.round(color.getGreen() * factor),
                Math.round(color.getBlue() * factor));
    }
}

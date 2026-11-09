package app.folyo.chat;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Uygulamaya ozgu hazir sticker paketleri (classpath:stickers). Kimlik "paket/ad" bicimindedir. */
@Component
public class StickerCatalog {

    private static final Pattern ID = Pattern.compile("^[a-z0-9-]{1,40}/[a-z0-9-]{1,40}$");

    public record Sticker(String id, String title, String url) {
    }

    public record Pack(String id, String name, List<Sticker> stickers) {
    }

    private record RawSticker(String id, String title) {
    }

    private record RawPack(String id, String name, List<RawSticker> stickers) {
    }

    private final List<Pack> packs;
    private final Map<String, Sticker> byId;

    public StickerCatalog() {
        try (InputStream in = new ClassPathResource("stickers/catalog.json").getInputStream()) {
            List<RawPack> raw = JsonMapper.builder().build().readValue(in, new TypeReference<List<RawPack>>() { });
            this.packs = raw.stream().map(p -> new Pack(p.id(), p.name(), p.stickers().stream()
                    .map(s -> new Sticker(s.id(), s.title(), url(s.id()))).toList())).toList();
        } catch (IOException e) {
            throw new UncheckedIOException("Sticker katalogu okunamadi", e);
        }
        this.byId = packs.stream().flatMap(p -> p.stickers().stream())
                .collect(Collectors.toUnmodifiableMap(Sticker::id, Function.identity()));
    }

    public List<Pack> packs() {
        return packs;
    }

    public boolean exists(String id) {
        return id != null && byId.containsKey(id);
    }

    public static String url(String id) {
        return "/api/public/stickers/" + id + ".svg";
    }

    /** Yalniz katalogdaki dosyalar sunulur; yol disaridan gelen metinle olusturulmaz. */
    public byte[] svg(String id) {
        if (id == null || !ID.matcher(id).matches() || !byId.containsKey(id)) {
            return null;
        }
        try (InputStream in = new ClassPathResource("stickers/" + id + ".svg").getInputStream()) {
            return in.readAllBytes();
        } catch (IOException e) {
            return null;
        }
    }
}

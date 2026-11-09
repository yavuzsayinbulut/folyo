package app.folyo.settings;

import java.util.List;

/**
 * Moderasyon kurallari (admin panelinden).
 *
 * @param blockedWords      gonderi, yanit, mesaj ve defterde kabul edilmeyen ifadeler (kelime olarak eslesir)
 * @param autoHideThreshold bu kadar farkli kisi sikayet edince icerik inceleme bitene kadar gizlenir
 * @param dailyReportLimit  bir kisinin gunde gonderebilecegi sikayet (kotuye kullanimi onler)
 */
public record ModerationPolicy(List<String> blockedWords, Integer autoHideThreshold, Integer dailyReportLimit) {

    public static final ModerationPolicy DEFAULT = new ModerationPolicy(List.of(), 3, 20);

    public List<String> words() {
        return blockedWords == null ? List.of() : blockedWords;
    }

    public int threshold() {
        return autoHideThreshold == null || autoHideThreshold < 1 ? 3 : autoHideThreshold;
    }

    public int dailyLimit() {
        return dailyReportLimit == null || dailyReportLimit < 1 ? 20 : dailyReportLimit;
    }
}

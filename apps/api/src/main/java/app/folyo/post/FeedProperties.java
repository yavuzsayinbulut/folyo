package app.folyo.post;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * "Senin icin" siralamasinin katsayilari (folyo.feed.*). Puan:
 * (begeni + replyWeight x yanit + 1) / (saat + 2)^gravity x (1 + affinityStep x yakinlik) x diversityDecay^(yazarin onceki gonderi sayisi).
 *
 * @param gravity        yasla dusus hizi; buyudukce yeni gonderiler daha cok one cikar
 * @param replyWeight    bir yanitin begeniye gore agirligi
 * @param affinityStep   bakan kisinin yazarla her yakinlik puaninin carpana katkisi
 * @param affinityCap    yakinlik puaninin ust siniri (tek yazar akisi ele gecirmesin)
 * @param affinityWindow yakinlik sinyallerinin (begeni, yanit, sohbet) geriye bakis suresi
 * @param diversityDecay ayni yazarin her sonraki gonderisinin puan carpani
 * @param candidatePool  siralanan en yeni aday gonderi sayisi
 * @param snapshotSize   bir akista sayfalanan en fazla gonderi
 * @param snapshotTtl    siralanmis listenin sayfalama icin saklanma suresi (son erisimden itibaren)
 * @param maxSnapshots   bellekte tutulan en fazla akis
 */
@ConfigurationProperties("folyo.feed")
public record FeedProperties(
        @DefaultValue("1.5") double gravity,
        @DefaultValue("2") double replyWeight,
        @DefaultValue("0.1") double affinityStep,
        @DefaultValue("10") int affinityCap,
        @DefaultValue("90d") Duration affinityWindow,
        @DefaultValue("0.6") double diversityDecay,
        @DefaultValue("500") int candidatePool,
        @DefaultValue("200") int snapshotSize,
        @DefaultValue("30m") Duration snapshotTtl,
        @DefaultValue("10000") int maxSnapshots) {
}

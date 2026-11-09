/** Widget'a uygulamadan gecen veri. Widget kodu ayri bir calisma ortaminda calisir; hesaplama burada yapilir. */
export type VisitsWidgetProps = {
  username: string;
  /** Bicimlenmis sayi, or. "137". */
  visitors: string;
  delta: string;
  deltaTrend: "up" | "down" | "flat";
  /** Son 7 gunun cubuk yukseklikleri (dp/pt, 3-56). */
  bars: number[];
  message: string;
};

export const EMPTY_VISITS: VisitsWidgetProps = {
  username: "folyo",
  visitors: "–",
  delta: "Uygulamayı açınca güncellenir",
  deltaTrend: "flat",
  bars: [3, 3, 3, 3, 3, 3, 3],
  message: "",
};

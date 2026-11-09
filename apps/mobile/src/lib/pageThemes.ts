/**
 * Ziyaretci sayfasi sablonlari: web'deki globals.css [data-theme] kurallari ve web/src/lib/themes.ts ile ayni degerler.
 * Uygulamanin kendi arayuzu cihaz temasini izler; bunlar yalniz sayfa onizlemesinde ve secicide kullanilir.
 */
export type ThemeKey = "CLASSIC" | "FRIENDLY" | "CORPORATE" | "MINIMAL" | "NIGHT" | "EDITORIAL";
export type AccentKey = "PURPLE" | "BLUE" | "GREEN" | "ORANGE" | "PINK" | "MONO";

export type PageLook = {
  dark: boolean;
  radius: number;
  bg: string;
  surface: string;
  line: string;
  ink: string;
  ink3: string;
  accent: string;
  /** Platform rozetleri tek renk mi (Kurumsal, Minimal)? */
  monoBadge: { bg: string; ink: string } | null;
};

type Palette = Omit<PageLook, "dark" | "radius" | "monoBadge">;

const CLASSIC_LIGHT: Palette = { bg: "#f7f6f3", surface: "#ffffff", line: "rgba(31,30,28,0.09)", ink: "#1f1e1c", ink3: "#888780", accent: "#534ab7" };
const CLASSIC_DARK: Palette = { bg: "#141413", surface: "#1f1f1d", line: "rgba(255,255,255,0.08)", ink: "#f1efe8", ink3: "#888780", accent: "#afa9ec" };

const FIXED: Record<Exclude<ThemeKey, "CLASSIC">, Omit<PageLook, "monoBadge"> & { mono?: { bg: string; ink: string } }> = {
  FRIENDLY: { dark: false, radius: 22, bg: "#fff6ec", surface: "#ffffff", line: "rgba(122,62,20,0.1)", ink: "#2d1d12", ink3: "#a08673", accent: "#e8590c" },
  CORPORATE: {
    dark: false, radius: 6, bg: "#f3f5f8", surface: "#ffffff", line: "rgba(15,27,45,0.1)", ink: "#0f1b2d", ink3: "#7a8699", accent: "#1e40af",
    mono: { bg: "#eaeef3", ink: "#1e3a8a" },
  },
  MINIMAL: {
    dark: false, radius: 10, bg: "#ffffff", surface: "#ffffff", line: "rgba(0,0,0,0.09)", ink: "#111111", ink3: "#8a8a8a", accent: "#111111",
    mono: { bg: "#f2f2f2", ink: "#111111" },
  },
  NIGHT: { dark: true, radius: 14, bg: "#0b0d12", surface: "#141821", line: "rgba(255,255,255,0.08)", ink: "#e9edf5", ink3: "#7d879b", accent: "#8ea2ff" },
  EDITORIAL: { dark: false, radius: 4, bg: "#f8f4ec", surface: "#fffdf8", line: "rgba(60,40,20,0.12)", ink: "#2a2118", ink3: "#8d7e6e", accent: "#9a3412" },
};

export const THEMES: { key: ThemeKey; name: string; description: string }[] = [
  { key: "CLASSIC", name: "Klasik", description: "Sade, cihazın açık/koyu ayarına uyar" },
  { key: "FRIENDLY", name: "Samimi", description: "Yuvarlak, sıcak renkler" },
  { key: "CORPORATE", name: "Kurumsal", description: "Net, düzenli, lacivert" },
  { key: "MINIMAL", name: "Minimal", description: "Siyah-beyaz, bol boşluk" },
  { key: "NIGHT", name: "Gece", description: "Her zaman koyu" },
  { key: "EDITORIAL", name: "Editoryal", description: "Kâğıt tonları, serif başlık" },
];

export const ACCENTS: { key: AccentKey; name: string; light: string; dark: string }[] = [
  { key: "PURPLE", name: "Mor", light: "#534ab7", dark: "#afa9ec" },
  { key: "BLUE", name: "Mavi", light: "#1d63c4", dark: "#85b7eb" },
  { key: "GREEN", name: "Yeşil", light: "#2f7a3a", dark: "#97c459" },
  { key: "ORANGE", name: "Turuncu", light: "#d9480f", dark: "#f5a26b" },
  { key: "PINK", name: "Pembe", light: "#c2255c", dark: "#f08fb0" },
  { key: "MONO", name: "Siyah", light: "#111111", dark: "#f1f1f1" },
];

/** Ziyaretcinin gorecegi renkler. Klasik tema ziyaretcinin cihazini izler; onizlemede bu cihazin ayari kullanilir. */
export function pageLook(theme: ThemeKey | null | undefined, accent: AccentKey | null | undefined, deviceDark: boolean): PageLook {
  const key = theme ?? "CLASSIC";
  const base: Omit<PageLook, "monoBadge"> & { mono?: { bg: string; ink: string } } =
    key === "CLASSIC" ? { ...(deviceDark ? CLASSIC_DARK : CLASSIC_LIGHT), dark: deviceDark, radius: 14 } : FIXED[key];
  const chosen = accent ? ACCENTS.find((a) => a.key === accent) : undefined;
  const { mono, ...rest } = base;
  return { ...rest, accent: chosen ? (base.dark ? chosen.dark : chosen.light) : base.accent, monoBadge: mono ?? null };
}

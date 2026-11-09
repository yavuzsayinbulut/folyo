import type { CSSProperties } from "react";

export type ThemeKey = "CLASSIC" | "FRIENDLY" | "CORPORATE" | "MINIMAL" | "NIGHT" | "EDITORIAL";
export type AccentKey = "PURPLE" | "BLUE" | "GREEN" | "ORANGE" | "PINK" | "MONO";

/**
 * Tema sablonlari. Renkler, kose ve yazi tipi globals.css'teki [data-theme] kurallarindadir;
 * burada yalniz secicide gosterilen bilgi ve onizleme renkleri var.
 */
export const THEMES: { key: ThemeKey; name: string; description: string; swatch: [string, string, string] }[] = [
  { key: "CLASSIC", name: "Klasik", description: "Sade, sıcak, cihazın açık/koyu ayarına uyar", swatch: ["#f7f6f3", "#ffffff", "#534ab7"] },
  { key: "FRIENDLY", name: "Samimi", description: "Yuvarlak hatlar, sıcak renkler, yumuşak yazı", swatch: ["#fff6ec", "#ffffff", "#e8590c"] },
  { key: "CORPORATE", name: "Kurumsal", description: "Net, düzenli, lacivert tonlar", swatch: ["#f3f5f8", "#ffffff", "#1e40af"] },
  { key: "MINIMAL", name: "Minimal", description: "Siyah-beyaz, bol boşluk, renksiz rozetler", swatch: ["#ffffff", "#f5f5f5", "#111111"] },
  { key: "NIGHT", name: "Gece", description: "Her zaman koyu, yüksek kontrast", swatch: ["#0b0d12", "#141821", "#8ea2ff"] },
  { key: "EDITORIAL", name: "Editoryal", description: "Kâğıt dokusu renkler, serif başlıklar", swatch: ["#f8f4ec", "#fffdf8", "#9a3412"] },
];

type AccentTokens = { accent: string; soft: string; ink: string; on: string };

const ACCENTS: Record<AccentKey, { name: string; light: AccentTokens; dark: AccentTokens }> = {
  PURPLE: { name: "Mor", light: { accent: "#534ab7", soft: "#eeedfe", ink: "#3c3489", on: "#ffffff" }, dark: { accent: "#afa9ec", soft: "#26215c", ink: "#cecbf6", on: "#1b1640" } },
  BLUE: { name: "Mavi", light: { accent: "#1d63c4", soft: "#e3eefb", ink: "#0c447c", on: "#ffffff" }, dark: { accent: "#85b7eb", soft: "#0c2a4a", ink: "#cfe3f8", on: "#06182b" } },
  GREEN: { name: "Yeşil", light: { accent: "#2f7a3a", soft: "#e4f3e2", ink: "#1f5428", on: "#ffffff" }, dark: { accent: "#97c459", soft: "#173404", ink: "#d6ebbd", on: "#0f2203" } },
  ORANGE: { name: "Turuncu", light: { accent: "#d9480f", soft: "#ffe8d8", ink: "#8f2f08", on: "#ffffff" }, dark: { accent: "#f5a26b", soft: "#4a1b0c", ink: "#fbd5bc", on: "#2a0e04" } },
  PINK: { name: "Pembe", light: { accent: "#c2255c", soft: "#fde4ec", ink: "#7f1d42", on: "#ffffff" }, dark: { accent: "#f08fb0", soft: "#4b1528", ink: "#f8cfdd", on: "#2a0a16" } },
  MONO: { name: "Siyah", light: { accent: "#111111", soft: "#ededed", ink: "#111111", on: "#ffffff" }, dark: { accent: "#f1f1f1", soft: "#2a2a2a", ink: "#f1f1f1", on: "#111111" } },
};

export const ACCENT_OPTIONS = (Object.keys(ACCENTS) as AccentKey[]).map((key) => ({
  key,
  name: ACCENTS[key].name,
  color: ACCENTS[key].light.accent,
}));

/** Klasik tema cihaz ayarini izler; Gece hep koyu; digerleri hep acik. */
export function schemeOf(theme: ThemeKey): "light" | "dark" | undefined {
  if (theme === "CLASSIC") return undefined;
  return theme === "NIGHT" ? "dark" : "light";
}

/**
 * Tema kokune konacak nitelikler. Secilen vurgu renginin acik ve koyu tonlari degisken olarak verilir;
 * hangisinin kullanilacagina CSS karar verir (Klasik tema cihaz ayarini izledigi icin ikisi de gerekir).
 */
export function themeProps(theme: ThemeKey | null | undefined, accent: AccentKey | null | undefined) {
  const key = theme ?? "CLASSIC";
  const tokens = accent ? ACCENTS[accent] : undefined;
  const style: Record<string, string> = {};
  if (tokens) {
    style["--al"] = tokens.light.accent;
    style["--al-soft"] = tokens.light.soft;
    style["--al-ink"] = tokens.light.ink;
    style["--al-on"] = tokens.light.on;
    style["--ad"] = tokens.dark.accent;
    style["--ad-soft"] = tokens.dark.soft;
    style["--ad-ink"] = tokens.dark.ink;
    style["--ad-on"] = tokens.dark.on;
  }
  return {
    "data-theme": key,
    "data-scheme": schemeOf(key),
    "data-accent": tokens ? accent!.toLowerCase() : undefined,
    style: style as CSSProperties,
  };
}

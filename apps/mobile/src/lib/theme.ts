import { useColorScheme } from "react-native";

/** Web'deki renk token'larinin karsiligi; acik/koyu tema ayri adimlarla. */
const light = {
  bg: "#f7f6f3",
  surface: "#ffffff",
  surface2: "#f1efe8",
  line: "rgba(31,30,28,0.09)",
  lineStrong: "rgba(31,30,28,0.18)",
  ink: "#1f1e1c",
  ink2: "#5f5e5a",
  ink3: "#888780",
  accent: "#534ab7",
  accentSoft: "#eeedfe",
  accentInk: "#3c3489",
  onAccent: "#ffffff",
  okSoft: "#eaf3de",
  okInk: "#27500a",
  danger: "#a32d2d",
  chart: "#534ab7",
};

const dark: typeof light = {
  bg: "#141413",
  surface: "#1f1f1d",
  surface2: "#2a2a27",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.18)",
  ink: "#f1efe8",
  ink2: "#b4b2a9",
  ink3: "#888780",
  accent: "#afa9ec",
  accentSoft: "#26215c",
  accentInk: "#cecbf6",
  onAccent: "#26215c",
  okSoft: "#173404",
  okInk: "#c0dd97",
  danger: "#f09595",
  chart: "#8b84e6",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export type Tone = "gray" | "green" | "pink" | "blue" | "coral" | "amber" | "purple" | "teal" | "red";

const TONES: Record<Tone, { light: [string, string]; dark: [string, string] }> = {
  gray: { light: ["#f1efe8", "#2c2c2a"], dark: ["#2c2c2a", "#d3d1c7"] },
  green: { light: ["#eaf3de", "#27500a"], dark: ["#173404", "#c0dd97"] },
  pink: { light: ["#fbeaf0", "#72243e"], dark: ["#4b1528", "#f4c0d1"] },
  blue: { light: ["#e6f1fb", "#0c447c"], dark: ["#042c53", "#b5d4f4"] },
  coral: { light: ["#faece7", "#712b13"], dark: ["#4a1b0c", "#f5c4b3"] },
  amber: { light: ["#faeeda", "#633806"], dark: ["#412402", "#fac775"] },
  purple: { light: ["#eeedfe", "#3c3489"], dark: ["#26215c", "#cecbf6"] },
  teal: { light: ["#e1f5ee", "#085041"], dark: ["#04342c", "#9fe1cb"] },
  red: { light: ["#fcebeb", "#791f1f"], dark: ["#501313", "#f7c1c1"] },
};

/** Platform tonu; `scheme` verilmezse cihazin acik/koyu ayari kullanilir. */
export function useTone(tone: Tone, scheme?: "light" | "dark"): { bg: string; ink: string } {
  const device = useColorScheme() === "dark" ? "dark" : "light";
  const [bg, ink] = TONES[tone][scheme ?? device];
  return { bg, ink };
}

import type { ReactNode } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Platform } from "@/lib/platforms";
import type { PageLook } from "@/lib/pageThemes";
import { useColors, useTone } from "@/lib/theme";

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const c = useColors();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 26, fontWeight: "700", color: c.ink, letterSpacing: -0.4 }}>{children}</Text>
      {subtitle ? <Text style={{ marginTop: 4, fontSize: 14, color: c.ink3 }}>{subtitle}</Text> : null}
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.line }, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ fontSize: 13, color: c.ink2, marginBottom: 6 }}>{children}</Text>;
}

export function Body({ children, muted, danger, style }: { children: ReactNode; muted?: boolean; danger?: boolean; style?: object }) {
  const c = useColors();
  return <Text style={[{ fontSize: 15, color: danger ? c.danger : muted ? c.ink3 : c.ink, lineHeight: 21 }, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  busy,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const c = useColors();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? c.accent : "transparent",
          borderColor: primary ? c.accent : c.lineStrong,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? c.onAccent : c.ink} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {icon}
          <Text style={{ fontSize: 16, fontWeight: "600", color: primary ? c.onAccent : c.ink }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const c = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={c.ink3}
        autoCapitalize="none"
        {...rest}
        style={[styles.input, { color: c.ink, backgroundColor: c.bg, borderColor: c.lineStrong }, style]}
      />
    </View>
  );
}

/** `look` verilirse rozet ziyaretci sayfasinin temasina gore boyanir (onizleme); yoksa cihaz temasina gore. */
export function PlatformBadge({ platform, size = 36, look }: { platform: Platform; size?: number; look?: PageLook }) {
  const deviceTone = useTone(platform.tone, look ? (look.dark ? "dark" : "light") : undefined);
  const tone = look?.monoBadge ?? deviceTone;
  const Icon = platform.icon;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }}>
      <Icon size={size * 0.55} color={tone.ink} />
    </View>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { borderColor: c.lineStrong }]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: c.accent }]}
          >
            <Text style={{ fontSize: 14, fontWeight: active ? "600" : "400", color: active ? c.onAccent : c.ink2 }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 40, gap: 0 },
  panel: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, marginBottom: 14 },
  button: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  segmented: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 2, alignSelf: "flex-start" },
  segment: { height: 34, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});

/** Ad bas harfleriyle yuvarlak avatar; hesap fotografi varsa onu gosterir. */
export function Avatar({ name, url, size = 52 }: { name: string; url?: string | null; size?: number }) {
  const c = useColors();
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toLocaleUpperCase("tr");
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: c.accentInk, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

/** Kucuk baslik + sag tarafta istege bagli eylem; ekran bolumlerini ayirir. */
export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: c.ink2, letterSpacing: 0.3, textTransform: "uppercase" }}>{title}</Text>
      {detail ? <Text style={{ fontSize: 13, color: c.ink3, marginLeft: 6 }}>{detail}</Text> : null}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

/** Alttan acilan menu. Arka plana dokununca kapanir. */
export function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Kapat" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
      <View style={{ backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: insets.bottom + 18 }}>
        <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginBottom: 14 }} />
        {children}
      </View>
    </Modal>
  );
}

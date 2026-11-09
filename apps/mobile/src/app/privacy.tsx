import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Body, Button, Panel, Screen, SectionHeader } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { Audience, InteractionPolicy, Me, Privacy, Profile } from "@/lib/types";

const AUDIENCES: { value: Audience; label: string }[] = [
  { value: "EVERYONE", label: "Herkes" },
  { value: "SIGNED_IN", label: "Giriş yapanlar" },
  { value: "VERIFIED", label: "Doğrulanmış hesaplar" },
  { value: "ONLY_ME", label: "Yalnız ben" },
];

const POLICIES: { value: InteractionPolicy; label: string }[] = [
  { value: "VERIFIED", label: "Doğrulanmış herkes" },
  { value: "APPROVAL", label: "Onayımdan sonra" },
  { value: "NOBODY", label: "Kimse" },
];

const SEE: { key: "profile" | "location" | "localTime" | "activity" | "guestbook"; label: string }[] = [
  { key: "profile", label: "Sayfamı" },
  { key: "location", label: "Konumumu" },
  { key: "localTime", label: "Yerel saatimi" },
  { key: "activity", label: "Aktivite akışımı" },
  { key: "guestbook", label: "Defterdeki mesajları" },
];

/** Kim gorebilir / kim yazabilir. Sunucu her istekte ayni kurali uygular. */
export default function PrivacyScreen() {
  const api = useApi();
  const [form, setForm] = useState<Privacy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/me").then(
      (me) => (me.profile ? setForm(me.profile.privacy) : setError("Önce Sayfa sekmesinden adresini seç.")),
      () => setError("Yüklenemedi"),
    );
  }, [api]);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      await api<Profile>("/api/me/privacy", { method: "PUT", body: form });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <Screen underHeader>
        <Body muted={!error} danger={!!error}>{error ?? "Yükleniyor…"}</Body>
      </Screen>
    );
  }

  const set = <K extends keyof Privacy>(key: K, value: Privacy[K]) => setForm({ ...form, [key]: value });

  return (
    <Screen underHeader>
      <Body muted style={{ marginBottom: 6 }}>Doğrulanmış hesap: e-postası ve telefonu doğrulanmış kullanıcı. Yazmak için her durumda doğrulama gerekir.</Body>

      <SectionHeader title="Kim görebilir" />
      {SEE.map(({ key, label }) => (
        <Choice key={key} title={label} options={AUDIENCES} value={form[key]} onChange={(v) => set(key, v)} />
      ))}

      <SectionHeader title="Kim yazabilir" />
      <Choice title="Deftere yorum" hint="Onayımdan sonra: yorumlar sen onaylayınca görünür." options={POLICIES} value={form.comments} onChange={(v) => set("comments", v)} />
      <Choice title="Bana özel mesaj" hint="Onayımdan sonra: mesajlar önce İstekler klasörüne düşer." options={POLICIES} value={form.messages} onChange={(v) => set("messages", v)} />

      <Panel>
        <ToggleRow
          label="Arama motorlarında görünsün"
          hint={form.profile === "EVERYONE" ? "Kapalıysa sayfan yalnız linki bilenlere açık kalır." : "Herkese açık olmayan sayfa arama motorlarında görünmez."}
          value={form.indexable && form.profile === "EVERYONE"}
          disabled={form.profile !== "EVERYONE"}
          onChange={(v) => set("indexable", v)}
        />
      </Panel>

      <Button label="Kaydet" onPress={save} busy={busy} />
      {error ? <Body danger style={{ marginTop: 8, textAlign: "center" }}>{error}</Body> : null}
    </Screen>
  );
}

function Choice<T extends string>(props: { title: string; hint?: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <Panel>
      <Text style={{ fontSize: 15, fontWeight: "600", color: c.ink, marginBottom: 8 }}>{props.title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={props.title}>
        {props.options.map((option) => {
          const active = option.value === props.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => props.onChange(option.value)}
              style={{
                height: 36,
                paddingHorizontal: 12,
                borderRadius: 18,
                justifyContent: "center",
                borderWidth: 1,
                borderColor: active ? c.accent : c.lineStrong,
                backgroundColor: active ? c.accent : "transparent",
              }}
            >
              <Text style={{ fontSize: 14, color: active ? c.onAccent : c.ink2, fontWeight: active ? "600" : "400" }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {props.hint ? <Text style={{ marginTop: 8, fontSize: 12, color: c.ink3 }}>{props.hint}</Text> : null}
    </Panel>
  );
}

function ToggleRow(props: { label: string; hint: string; value: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: c.ink }}>{props.label}</Text>
        <Text style={{ fontSize: 12, color: c.ink3, marginTop: 2 }}>{props.hint}</Text>
      </View>
      <Switch
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
        trackColor={{ true: c.accent, false: c.lineStrong }}
        thumbColor="#ffffff"
        accessibilityLabel={props.label}
      />
    </View>
  );
}

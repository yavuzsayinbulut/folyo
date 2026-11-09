import { IconBell, IconLogout, IconTrash } from "@tabler/icons-react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Pressable, Switch, Text, View } from "react-native";
import { AppearancePicker } from "@/components/AppearancePicker";
import { Avatar, Body, Button, Field, Label, Panel, Screen, SectionHeader, Segmented, Title } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { setUpPush } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";
import type { Profile, Visibility } from "@/lib/types";
import { useMeAndCards } from "@/lib/useMe";

export default function ProfileTab() {
  const c = useColors();
  const { signOut } = useSession();
  const { me, setMe } = useMeAndCards();
  const profile = me?.profile;

  return (
    <Screen>
      <Title>Profil</Title>
      {me ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <Avatar name={profile?.displayName ?? me.user.name} url={me.user.avatarUrl} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink }}>{profile?.displayName ?? me.user.name}</Text>
            <Text style={{ fontSize: 13, color: c.ink3 }}>{profile ? `folyo.app/${profile.username}` : me.user.email ?? ""}</Text>
          </View>
        </View>
      ) : null}

      <SectionHeader title="Sayfa bilgileri" />
      {profile && me ? (
        // Form, profil yuklendiginde kendi baslangic durumunu alir; profil degisirse (baska hesap) yeniden kurulur.
        <Panel>
          <ProfileForm key={profile.id} profile={profile} onSaved={(updated) => setMe({ ...me, profile: updated })} />
        </Panel>
      ) : (
        <Body muted>Önce Sayfa sekmesinden adresini seç.</Body>
      )}

      {profile && me ? (
        <>
          <SectionHeader title="Görünüm" />
          <Body muted style={{ fontSize: 13, marginBottom: 10 }}>Sayfanın karakterini seç; ziyaretçiler bu şablonu görür.</Body>
          <AppearancePicker profile={profile} onSaved={(updated) => setMe({ ...me, profile: updated })} />
        </>
      ) : null}

      <SectionHeader title="Bildirimler" />
      <NotificationSettings />

      <SectionHeader title="Hesap" />
      <Button label="Çıkış yap" variant="secondary" icon={<IconLogout size={18} color={c.ink} />} onPress={signOut} />
      <DeleteAccount onDeleted={signOut} />
    </Screen>
  );
}

/** Hesap silme (App Store 5.1.1(v) ve KVKK): iki adimli onay, sonra yerel oturum ve widget temizlenir. */
function DeleteAccount({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const c = useColors();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const first = await confirm(
      "Hesabını sil",
      "Sayfan, kartların, fotoğrafların, istatistiklerin, bağlı hesapların ve başka sayfalara bıraktığın mesajlar kalıcı olarak silinir.",
      "Devam et",
    );
    if (!first) return;
    if (!(await confirm("Emin misin?", "Bu işlem geri alınamaz.", "Hesabımı sil"))) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/me/account", { method: "DELETE" });
      await onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Hesap silinemedi, tekrar dene.");
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        accessibilityRole="button"
        onPress={run}
        disabled={busy}
        style={({ pressed }) => ({
          height: 48,
          borderRadius: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: busy ? 0.5 : pressed ? 0.7 : 1,
        })}
      >
        <IconTrash size={17} color={c.danger} />
        <Text style={{ fontSize: 15, fontWeight: "600", color: c.danger }}>{busy ? "Siliniyor…" : "Hesabımı sil"}</Text>
      </Pressable>
      {error ? <Body danger style={{ textAlign: "center", fontSize: 13 }}>{error}</Body> : null}
    </View>
  );
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const c = useColors();
  const api = useApi();
  const [form, setForm] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    status: profile.status ?? "",
    visibility: profile.visibility as Visibility,
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  async function save() {
    if (!form.displayName.trim()) return setMessage({ ok: false, text: "Görünen adını yaz" });
    setBusy(true);
    try {
      // Saat dilimi bu ekranda duzenlenmez; mevcut deger korunur.
      onSaved(await api<Profile>("/api/me/profile", { method: "PATCH", body: { ...form, timezone: profile.timezone } }));
      setMessage({ ok: true, text: "Kaydedildi" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Kaydedilemedi" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Field label="Görünen ad" value={form.displayName} onChangeText={set("displayName")} maxLength={60} autoCapitalize="words" />
      <Field label="Durum rozeti" value={form.status} onChangeText={set("status")} maxLength={40} placeholder="Projelere açık" autoCapitalize="sentences" />
      <Field
        label="Biyografi"
        value={form.bio}
        onChangeText={set("bio")}
        maxLength={280}
        multiline
        autoCapitalize="sentences"
        style={{ height: 90, paddingTop: 10, textAlignVertical: "top" }}
      />
      <Field label="Konum" value={form.location} onChangeText={set("location")} maxLength={60} placeholder="İstanbul" autoCapitalize="words" />
      <Label>Görünürlük</Label>
      <View style={{ marginBottom: 18 }}>
        <Segmented
          options={[
            { value: "PUBLIC", label: "Herkese açık" },
            { value: "UNLISTED", label: "Linki bilen" },
          ]}
          value={form.visibility}
          onChange={(value) => set("visibility")(value)}
        />
      </View>
      <Button label="Kaydet" onPress={save} busy={busy} />
      {message ? <Text style={{ marginTop: 8, color: message.ok ? c.okInk : c.danger, textAlign: "center" }}>{message.text}</Text> : null}
    </>
  );
}

type Settings = { guestbook: boolean; weeklySummary: boolean };

/** Bildirim izni + cihaz kaydi ve hangi bildirimlerin gelecegi. Tercihler sunucuda tutulur (tum cihazlar icin). */
function NotificationSettings() {
  const c = useColors();
  const api = useApi();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<Settings>("/api/me/notification-settings").then(setSettings, () => setSettings(null));
    }, [api]),
  );

  async function enable() {
    setBusy(true);
    try {
      const result = await setUpPush();
      if (result.status === "registered") {
        await api("/api/me/devices", { method: "POST", body: { expoToken: result.token, platform: Platform.OS } });
        setStatus("Bildirimler bu cihazda açık.");
      } else if (result.status === "denied") {
        setStatus("Bildirim izni verilmedi. Telefon ayarlarından açabilirsin.");
      } else {
        setStatus(result.reason);
      }
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Bildirimler açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: keyof Settings, value: boolean) {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      setSettings(await api<Settings>("/api/me/notification-settings", { method: "PUT", body: next }));
    } catch {
      setSettings(settings);
    }
  }

  return (
    <Panel>
      {settings ? (
        <>
          <Row label="Ziyaretçi defterine yeni mesaj" value={settings.guestbook} onChange={(v) => toggle("guestbook", v)} />
          <Row label="Pazartesi haftalık özet" value={settings.weeklySummary} onChange={(v) => toggle("weeklySummary", v)} />
        </>
      ) : null}
      <View style={{ marginTop: 10 }}>
        <Button label="Bu cihazda bildirimleri aç" variant="secondary" icon={<IconBell size={18} color={c.ink} />} onPress={enable} busy={busy} />
      </View>
      {status ? <Body muted style={{ marginTop: 8, fontSize: 13 }}>{status}</Body> : null}
    </Panel>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={{ fontSize: 15, color: c.ink, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.lineStrong }} thumbColor="#ffffff" accessibilityLabel={label} />
    </View>
  );
}

import { IconBell, IconCamera, IconChevronRight, IconLogout, IconShieldCheck, IconShieldLock, IconTrash } from "@tabler/icons-react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Switch, Text, View } from "react-native";
import { AppearancePicker } from "@/components/AppearancePicker";
import { Avatar, Body, Button, Field, Panel, Screen, SectionHeader, Title } from "@/components/ui";
import { ApiError, useApi, useUpload } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { setUpPush } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";
import type { Profile } from "@/lib/types";
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
          <AvatarButton name={profile?.displayName ?? me.user.name} url={me.user.avatarUrl} onChange={(avatarUrl) => setMe({ ...me, user: { ...me.user, avatarUrl } })} />
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

      <SectionHeader title="Güvenlik ve gizlilik" />
      <Panel>
        <LinkRow
          icon={<IconShieldCheck size={20} color={me?.user.verified ? c.okInk : c.ink2} />}
          title="Hesap doğrulama"
          detail={me?.user.verified ? "Doğrulandı" : "Mesaj ve yorum yazmak için gerekli"}
          onPress={() => router.push("/verify")}
        />
        {profile ? (
          <LinkRow
            icon={<IconShieldLock size={20} color={c.ink2} />}
            title="Gizlilik"
            detail="Kim görebilir, kim yazabilir"
            onPress={() => router.push("/privacy")}
            last
          />
        ) : null}
      </Panel>

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
      <Button label="Kaydet" onPress={save} busy={busy} />
      {message ? <Text style={{ marginTop: 8, color: message.ok ? c.okInk : c.danger, textAlign: "center" }}>{message.text}</Text> : null}
    </>
  );
}

function LinkRow(props: { icon: React.ReactNode; title: string; detail: string; onPress: () => void; last?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.title}: ${props.detail}`}
      onPress={props.onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: props.last ? 0 : 0.5,
        borderBottomColor: c.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {props.icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: c.ink }}>{props.title}</Text>
        <Text style={{ fontSize: 13, color: c.ink3 }}>{props.detail}</Text>
      </View>
      <IconChevronRight size={18} color={c.ink3} />
    </Pressable>
  );
}

type Settings = { guestbook: boolean; weeklySummary: boolean; messages: boolean };

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
          <Row label="Yeni özel mesaj" value={settings.messages} onChange={(v) => toggle("messages", v)} />
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

/**
 * Profil fotografi: dokununca galeriden secilir ve oldugu gibi yuklenir (kalite korunur, konum bilgisi sunucuda
 * silinir). Ozel fotograf varsa kaldirma secenegi de sunulur.
 */
function AvatarButton({ name, url, onChange }: { name: string; url: string | null; onChange: (url: string | null) => void }) {
  const c = useColors();
  const api = useApi();
  const upload = useUpload();
  const [progress, setProgress] = useState<number | null>(null);

  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, exif: false });
    if (result.canceled) return;
    const picked = result.assets[0];
    setProgress(0);
    try {
      const saved = await upload<{ avatarUrl: string }>(
        "/api/me/avatar",
        { uri: picked.uri, name: picked.fileName ?? "avatar.jpg", type: picked.mimeType ?? "image/jpeg" },
        { method: "PUT", onProgress: setProgress },
      );
      onChange(saved.avatarUrl);
    } catch (e) {
      Alert.alert("Fotoğraf yüklenemedi", e instanceof ApiError ? e.message : "Tekrar dene");
    } finally {
      setProgress(null);
    }
  }

  function choose() {
    const own = !!url && url.startsWith("/api/public/assets/");
    if (!own) return pick();
    Alert.alert("Profil fotoğrafı", undefined, [
      { text: "Yeni fotoğraf seç", onPress: pick },
      {
        text: "Kaldır",
        style: "destructive",
        onPress: () => api("/api/me/avatar", { method: "DELETE" }).then(() => onChange(null), () => undefined),
      },
      { text: "Vazgeç", style: "cancel" },
    ]);
  }

  return (
    <Pressable accessibilityLabel="Profil fotoğrafını değiştir" onPress={choose} disabled={progress !== null}>
      <Avatar name={name} url={url} size={56} />
      <View style={{ position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.bg }}>
        {progress !== null ? <ActivityIndicator size="small" color={c.onAccent} /> : <IconCamera size={13} color={c.onAccent} />}
      </View>
    </Pressable>
  );
}

import { IconCircleCheckFilled } from "@tabler/icons-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Body, Button, Field, Panel, Screen } from "@/components/ui";
import { ApiError, useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { VerificationStatus } from "@/lib/types";

/** E-posta ve telefon dogrulamasi: baskalarina mesaj ve defter yazisi icin admin'in istedigi dogrulamalar gerekir. */
export default function Verify() {
  const api = useApi();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<VerificationStatus>("/api/me/verification").then(setStatus, (e) => setError(e instanceof ApiError ? e.message : "Yüklenemedi"));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  if (!status) {
    return (
      <Screen underHeader>
        <Body muted={!error} danger={!!error}>{error ?? "Yükleniyor…"}</Body>
      </Screen>
    );
  }

  const needed = [status.requireEmail && "e-posta", status.requirePhone && "telefon"].filter(Boolean).join(" ve ");
  return (
    <Screen underHeader>
      <Body muted style={{ marginBottom: 14 }}>
        {needed
          ? `Başkalarına mesaj ve deftere yazı bırakmak için ${needed} doğrulaması gerekiyor. E-postan ve telefonun hiçbir sayfada gösterilmez.`
          : "Şu an yazmak için ek doğrulama gerekmiyor."}
      </Body>
      {status.verified ? (
        <View style={{ marginBottom: 14 }}>
          <Body style={{ fontWeight: "600" }}>Hesabın doğrulandı.</Body>
        </View>
      ) : null}
      <ChannelPanel kind="email" status={status} onVerified={setStatus} />
      <ChannelPanel kind="phone" status={status} onVerified={setStatus} />
    </Screen>
  );
}

function ChannelPanel({ kind, status, onVerified }: { kind: "email" | "phone"; status: VerificationStatus; onVerified: (s: VerificationStatus) => void }) {
  const c = useColors();
  const api = useApi();
  const verified = kind === "email" ? status.emailVerified : status.phoneVerified;
  const available = kind === "email" ? status.emailAvailable : status.phoneAvailable;
  const required = kind === "email" ? status.requireEmail : status.requirePhone;
  const current = kind === "email" ? status.email : status.phone;
  const [value, setValue] = useState(kind === "email" ? (status.email ?? "") : "");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/me/verification/${kind}`, { method: "POST", body: { [kind]: value } });
      setSent(true);
      setCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kod gönderilemedi");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    setBusy(true);
    setError(null);
    try {
      onVerified(await api<VerificationStatus>(`/api/me/verification/${kind}/confirm`, { method: "POST", body: { code } }));
      setSent(false);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Doğrulanamadı");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: c.ink }}>
          {kind === "email" ? "E-posta" : "Telefon"}
          {required && !verified ? <Text style={{ fontSize: 13, fontWeight: "500", color: c.accentInk }}>  · gerekli</Text> : null}
        </Text>
        {verified ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <IconCircleCheckFilled size={16} color={c.okInk} />
            <Text style={{ fontSize: 14, color: c.okInk }}>Doğrulandı</Text>
          </View>
        ) : null}
      </View>

      {verified && !editing ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Body muted>{current}</Body>
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} hitSlop={8}>
            <Text style={{ color: c.ink3, textDecorationLine: "underline" }}>Değiştir</Text>
          </Pressable>
        </View>
      ) : !available ? (
        <Body muted>Şu an kapalı. Yönetici entegrasyonu açınca buradan doğrulayabilirsin.</Body>
      ) : !sent ? (
        <>
          <Field
            label={kind === "email" ? "E-posta adresin" : "Telefon numaran"}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setError(null);
            }}
            placeholder={kind === "email" ? "ad@ornek.com" : "0555 111 22 33"}
            keyboardType={kind === "email" ? "email-address" : "phone-pad"}
            autoCapitalize="none"
            autoComplete={kind === "email" ? "email" : "tel"}
            textContentType={kind === "email" ? "emailAddress" : "telephoneNumber"}
          />
          <Button label="Kod gönder" onPress={send} busy={busy} />
        </>
      ) : (
        <>
          <Body muted style={{ marginBottom: 10 }}>
            {value.trim()} {kind === "email" ? "adresine" : "numarasına"} 6 haneli bir kod gönderdik. Kod 10 dakika geçerli.
          </Body>
          <Field
            label="Doğrulama kodu"
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/[^0-9]/g, ""));
              setError(null);
            }}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <Button label="Doğrula" onPress={confirmCode} busy={busy} disabled={code.length !== 6} />
          <Pressable accessibilityRole="button" onPress={() => setSent(false)} style={{ marginTop: 12, alignSelf: "center" }} hitSlop={8}>
            <Text style={{ color: c.ink3, textDecorationLine: "underline" }}>Farklı {kind === "email" ? "adres" : "numara"} gir ya da yeni kod iste</Text>
          </Pressable>
        </>
      )}
      {error ? <Body danger style={{ marginTop: 8 }}>{error}</Body> : null}
    </Panel>
  );
}

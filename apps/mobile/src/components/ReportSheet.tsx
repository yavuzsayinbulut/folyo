import { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { ApiError, useApi } from "@/lib/api";
import { useColors } from "@/lib/theme";
import type { ReportReason, ReportTarget } from "@/lib/types";
import { BottomSheet, Button } from "./ui";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "SPAM", label: "Spam ya da yanıltıcı" },
  { value: "HARASSMENT", label: "Taciz ya da zorbalık" },
  { value: "HATE", label: "Nefret söylemi" },
  { value: "SEXUAL", label: "Müstehcen içerik" },
  { value: "VIOLENCE", label: "Şiddet ya da tehdit" },
  { value: "SELF_HARM", label: "Kendine zarar verme" },
  { value: "IMPERSONATION", label: "Başkasını taklit ediyor" },
  { value: "ILLEGAL", label: "Yasa dışı içerik" },
  { value: "OTHER", label: "Başka bir neden" },
];

export type ReportRequest = { target: ReportTarget; targetId: string; title: string };

/** Sikayet: neden, istege bagli aciklama, istenirse engelleme. Sikayet edenin kimligi karsi tarafa gosterilmez. */
export function ReportSheet({ request, onClose }: { request: ReportRequest | null; onClose: () => void }) {
  const c = useColors();
  const api = useApi();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [block, setBlock] = useState(false);
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason(null);
    setNote("");
    setBlock(false);
    setState("form");
    setError(null);
    onClose();
  }

  async function submit() {
    if (!request || !reason) return setError("Bir neden seç");
    setState("sending");
    setError(null);
    try {
      await api("/api/me/reports", {
        method: "POST",
        body: { targetType: request.target, targetId: request.targetId, reason, note: note.trim() || null, block },
      });
      setState("done");
    } catch (e) {
      setState("form");
      setError(e instanceof ApiError ? e.message : "Gönderilemedi, tekrar dene");
    }
  }

  return (
    <BottomSheet visible={!!request} onClose={close}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: c.ink, marginBottom: 10 }}>{request?.title}</Text>
      {state === "done" ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: c.ink }}>Teşekkürler, şikayetini aldık. Ekibimiz inceleyecek; kurallara aykırıysa içerik kaldırılır.</Text>
          {block ? <Text style={{ color: c.ink2 }}>Bu kişiyi engelledin; sana yazamaz.</Text> : null}
          <Button label="Tamam" onPress={close} />
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {REASONS.map((r) => {
            const active = reason === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => setReason(r.value)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: active ? c.accent : c.lineStrong, alignItems: "center", justifyContent: "center" }}>
                  {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
                </View>
                <Text style={{ color: c.ink, fontSize: 15 }}>{r.label}</Text>
              </Pressable>
            );
          })}
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ek bilgi (isteğe bağlı)"
            placeholderTextColor={c.ink3}
            maxLength={500}
            multiline
            style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 12, paddingVertical: 10, color: c.ink, marginTop: 6 }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 6 }}>
            <Text style={{ color: c.ink }}>Bu kişiyi de engelle</Text>
            <Switch value={block} onValueChange={setBlock} trackColor={{ true: c.accent }} />
          </View>
          {error ? <Text style={{ color: c.danger }}>{error}</Text> : null}
          <Button label={state === "sending" ? "Gönderiliyor…" : "Şikayet et"} onPress={submit} busy={state === "sending"} disabled={!reason} />
        </View>
      )}
    </BottomSheet>
  );
}

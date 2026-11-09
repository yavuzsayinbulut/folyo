import { IconCopy, IconNfc, IconShare } from "@tabler/icons-react-native";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Platform, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Body, Button, Panel, Screen, Title } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { useColors } from "@/lib/theme";
import { useMeAndCards } from "@/lib/useMe";

export default function ShareTab() {
  const c = useColors();
  const { me } = useMeAndCards();
  const [copied, setCopied] = useState(false);
  const username = me?.profile?.username;
  const url = username ? `${WEB_URL}/${username}` : null;

  return (
    <Screen>
      <Title subtitle="Okutan kişinin telefonunda sayfan açılır.">Profilini paylaş</Title>
      {!url ? (
        <Body muted>Önce Sayfa sekmesinden adresini seç.</Body>
      ) : (
        <>
          <Panel style={{ alignItems: "center", paddingVertical: 28 }}>
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: "#ffffff" }}>
              {/* QR her zaman beyaz zemin + koyu kare: koyu temada da kameralar okuyabilsin. */}
              <QRCode value={url} size={200} color="#1f1e1c" backgroundColor="#ffffff" />
            </View>
            <Text selectable style={{ marginTop: 16, fontSize: 16, fontWeight: "600", color: c.ink }}>
              folyo.app/{username}
            </Text>
          </Panel>
          <View style={{ gap: 10 }}>
            <Button
              label="Linki paylaş"
              icon={<IconShare size={18} color={c.onAccent} />}
              onPress={() => (Platform.OS === "web" && !navigator.share ? Clipboard.setStringAsync(url) : Share.share({ message: url, url }))}
            />
            <Button
              label={copied ? "Kopyalandı" : "Linki kopyala"}
              variant="secondary"
              icon={<IconCopy size={18} color={c.ink} />}
              onPress={async () => {
                await Clipboard.setStringAsync(url);
                setCopied(true);
              }}
            />
          </View>
          <Panel style={{ marginTop: 14, flexDirection: "row", gap: 12, alignItems: "center" }}>
            <IconNfc size={22} color={c.ink3} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: c.ink }}>NFC kartvizit</Text>
              <Text style={{ fontSize: 13, color: c.ink3 }}>Yakında. Fiziksel cihaz ve uygulama derlemesi gerektiriyor.</Text>
            </View>
          </Panel>
        </>
      )}
    </Screen>
  );
}

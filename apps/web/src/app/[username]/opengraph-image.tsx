import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/server-api";
import { initials } from "@/components/Avatar";

export const alt = "folyo profil kartı";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TILE_COLORS = ["#C0DD97", "#F4C0D1", "#B5D4F4", "#FAC775", "#D3D1C7", "#9FE1CB"];

/** Link mesajda paylasildiginda gorunen onizleme gorseli. */
export default async function OpenGraphImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const page = await getPublicPage(username);
  // Olmayan adres icin gorsel uretilmez: aksi halde herhangi bir metin folyo markasiyla onizlenebilir.
  if (!page) notFound();
  const name = page.displayName;
  const bio = page.bio ?? "Tüm hesaplarım tek sayfada";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#EEEDFE", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ width: 132, height: 132, borderRadius: 999, background: "#534AB7", color: "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 52 }}>
              {initials(name)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 64, color: "#26215C", fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 30, color: "#534AB7", maxWidth: 560 }}>{bio.slice(0, 80)}</div>
            </div>
          </div>
          <div style={{ fontSize: 30, color: "#3C3489" }}>{`folyo.app/${page.username}`}</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", width: 330, gap: 14, alignContent: "center" }}>
          {TILE_COLORS.map((color, i) => (
            <div key={color} style={{ width: i % 3 === 0 ? 330 : 158, height: 96, borderRadius: 20, background: color }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}

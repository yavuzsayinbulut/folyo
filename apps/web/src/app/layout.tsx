import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono, IBM_Plex_Sans, Nunito } from "next/font/google";
import "./globals.css";
import { RulesDialog } from "@/components/moderation/RulesDialog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Tema yazi tipleri: derlemede indirilir ve sitenin kendisinden sunulur (ziyaretci Google'a istek atmaz).
// Yalniz o temayi kullanan sayfalarda yuklenmesi icin onceden yukleme kapali.
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "latin-ext"], preload: false });
const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], preload: false });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin", "latin-ext"], preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.WEB_URL || "http://localhost:3100"),
  title: { default: "folyo", template: "%s · folyo" },
  description: "Tüm hesaplarını tek bir sayfada topla.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} ${plex.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        {children}
        <RulesDialog />
      </body>
    </html>
  );
}

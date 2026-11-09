import Link from "next/link";
import { IconChartBar, IconLink, IconQrcode } from "@tabler/icons-react";
import { BentoGrid } from "@/components/CardTile";
import { ClaimBox } from "@/components/ClaimBox";
import { platformFor } from "@/lib/platforms";
import type { Card } from "@/lib/types";

const DEMO: Card[] = [
  { id: "1", type: "LINK", size: "WIDE", visible: true, audience: "EVERYONE", config: { url: "https://open.spotify.com/user/demo", title: "Ne dinliyorum" } },
  { id: "2", type: "LINK", size: "SMALL", visible: true, audience: "EVERYONE", config: { url: "https://github.com/demo" } },
  { id: "3", type: "LINK", size: "SMALL", visible: true, audience: "EVERYONE", config: { url: "https://instagram.com/demo" } },
  { id: "4", type: "TEXT", size: "WIDE", visible: true, audience: "EVERYONE", config: { text: "Backend geliştiriciyim. Hafta sonları film fotoğrafı çekiyorum." } },
  { id: "5", type: "LINK", size: "SMALL", visible: true, audience: "EVERYONE", config: { url: "https://linkedin.com/in/demo" } },
  { id: "6", type: "LINK", size: "SMALL", visible: true, audience: "EVERYONE", config: { url: "https://vsco.co/demo" } },
];

const PLATFORM_URLS = [
  "https://instagram.com",
  "https://github.com",
  "https://open.spotify.com",
  "https://linkedin.com",
  "https://x.com",
  "https://vsco.co",
  "https://reddit.com",
  "https://strava.com",
  "https://youtube.com",
  "https://letterboxd.com",
];

const STEPS = [
  { icon: IconLink, title: "Adresini al", text: "folyo.app/adin senin olsun. Bio'na, kartvizitine, imzana koy." },
  { icon: IconChartBar, title: "Hesaplarını diz", text: "GitHub katkıların, Spotify'da çalan şarkı, Strava koşun: kartlar kendini günceller." },
  { icon: IconQrcode, title: "Paylaş, izle", text: "QR ile paylaş; kaç kişinin baktığını ve en çok neye tıklandığını gör." },
];

export default function Home() {
  return (
    <div className="flex-1">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="" width={30} height={30} className="rounded-lg" />
          folyo
        </Link>
        <Link href="/login" className="rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
          Giriş yap
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4">
        <section className="grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.06] tracking-tight sm:text-[3.4rem]">
              Tüm hesapların,
              <br />
              <span className="text-accent">tek bir sayfada.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-ink-2">
              Instagram, GitHub, Spotify, LinkedIn ve daha fazlasını kartlar halinde diz. Linkini bio&apos;na koy, gerisini sayfan anlatsın.
            </p>
            <div className="mt-8">
              <ClaimBox />
            </div>
          </div>
          <div aria-label="Örnek sayfa" className="relative">
            <div className="rounded-[28px] border border-line bg-surface-2 p-4 shadow-[0_24px_60px_-30px_rgba(31,30,28,0.35)] sm:p-5">
              <BentoGrid cards={DEMO} interactive={false} />
            </div>
          </div>
        </section>

        <section aria-label="Desteklenen platformlar" className="border-y border-line py-6">
          <ul className="flex flex-wrap items-center justify-center gap-3">
            {PLATFORM_URLS.map((url) => {
              const platform = platformFor(url);
              const Icon = platform.icon;
              return (
                <li
                  key={url}
                  className={`tone-${platform.tone} inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-sm`}
                  style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}
                >
                  <Icon size={18} aria-hidden="true" />
                  {platform.name}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="how" className="py-16 sm:py-20">
          <h2 id="how" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Nasıl çalışır
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-ink-3">{i + 1}. adım</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-2">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-3">
          <span>folyo · tüm hesapların tek sayfada</span>
          <nav aria-label="Alt bilgi" className="flex gap-4">
            <Link href="/kurallar" className="hover:text-ink">
              Kurallar
            </Link>
            <Link href="/gizlilik" className="hover:text-ink">
              Gizlilik
            </Link>
            <Link href="/login" className="hover:text-ink">
              Sayfanı aç
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

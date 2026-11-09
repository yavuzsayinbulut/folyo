import Link from "next/link";
import { COMMUNITY_RULES, ZERO_TOLERANCE } from "@/lib/rules";

export const metadata = { title: "Topluluk kuralları", description: "folyo'da paylaşım ve mesajlaşma kuralları." };

const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

export default function RulesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/" className="text-sm text-ink-3 hover:text-ink">
        ← folyo
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Topluluk kuralları</h1>
      <p className="mt-2 text-ink-2">Gönderi, yanıt, mesaj ve ziyaretçi defteri için geçerlidir. Paylaşmadan önce bir kez kabul edilir.</p>
      <ol className="mt-8 flex flex-col gap-5">
        {COMMUNITY_RULES.map((rule, i) => (
          <li key={rule.title} className="flex gap-4">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-medium text-accent-ink">{i + 1}</span>
            <div>
              <h2 className="font-medium">{rule.title}</h2>
              <p className="text-ink-2">{rule.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="mt-10 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-medium">Şikayet ve engelleme</h2>
        <p className="mt-1 text-ink-2">{ZERO_TOLERANCE}</p>
        <p className="mt-2 text-ink-2">
          Her gönderinin, yanıtın, mesajın, defter yazısının ve sayfanın yanında <strong>Şikayet et</strong> seçeneği vardır; şikayet edenin
          kimliği karşı tarafa gösterilmez. Rahatsız eden kişiyi engelleyebilirsin: sana yazamaz, gönderilerine yanıt veremez.
        </p>
        {SUPPORT && (
          <p className="mt-2 text-ink-2">
            İletişim:{" "}
            <a href={`mailto:${SUPPORT}`} className="underline underline-offset-2">
              {SUPPORT}
            </a>
          </p>
        )}
      </section>
    </main>
  );
}

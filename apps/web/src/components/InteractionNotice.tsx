import Link from "next/link";
import type { Interaction } from "@/lib/types";

/**
 * Ziyaretci yazamiyorsa nedenini ve (varsa) cozumunu gosterir. Sunucu ayni kurali ayrica uygular;
 * bu yalniz yonlendirmedir.
 */
export function InteractionNotice({
  interaction,
  username,
  action,
  next: nextPath,
}: {
  interaction: Interaction;
  username: string;
  action: string;
  /** Giris/dogrulama sonrasi donulecek adres; verilmezse sayfanin kendisi. */
  next?: string;
}) {
  const next = encodeURIComponent(nextPath ?? `/${username}`);
  const box = "block rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-ink-2";
  switch (interaction) {
    case "SIGN_IN":
      return (
        <Link href={`/login?next=${next}`} className={`${box} hover:text-ink`}>
          {action} için giriş yap
        </Link>
      );
    case "VERIFY":
      return (
        <Link href={`/hesap/dogrulama?next=${next}`} className={`${box} hover:text-ink`}>
          {action} için hesabını doğrula. Bu, sahte hesaplarla rahatsız edilmeyi önler.
        </Link>
      );
    case "BLOCKED":
      return <p className={box}>Bu sayfaya yazamazsın.</p>;
    case "CLOSED":
      return <p className={box}>Sayfa sahibi bunu kapattı.</p>;
    default:
      return null;
  }
}

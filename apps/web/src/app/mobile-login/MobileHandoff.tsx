"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconDeviceMobile } from "@tabler/icons-react";
import { api, ApiError, fetchMe } from "@/lib/client-api";
import type { Me } from "@/lib/types";

/**
 * Mobil uygulama bu sayfayi uygulama ici tarayicida acar. Kullanici web oturumuyla onay verir; sayfa uygulamanin
 * PKCE challenge'i icin tek kullanimlik kod alip uygulamaya geri yonlendirir. Kod, uygulamadaki verifier olmadan
 * token'a cevrilemez. Hangi uygulama adreslerine yonlendirilebilecegini sunucu denetler.
 */
export function MobileHandoff() {
  const router = useRouter();
  const params = useSearchParams();
  const challenge = params.get("challenge");
  const redirect = params.get("redirect");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMe().then(
      (result) => {
        if (!result) {
          router.replace(`/login?next=${encodeURIComponent(`/mobile-login?${params.toString()}`)}`);
          return;
        }
        setMe(result);
      },
      () => setError("Sunucuya ulaşılamadı. Sayfayı yenileyip tekrar dene."),
    );
  }, [router, params]);

  if (!challenge || !redirect) {
    return <p className="text-danger">Geçersiz giriş isteği. Uygulamadan tekrar dene.</p>;
  }
  if (!me) return error ? <p role="alert" className="text-danger">{error}</p> : <p className="text-ink-3">Yükleniyor…</p>;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const { code } = await api<{ code: string }>("/api/me/mobile/codes", {
        method: "POST",
        body: { codeChallenge: challenge, redirectUri: redirect },
      });
      const target = new URL(redirect!);
      target.searchParams.set("code", code);
      window.location.href = target.toString();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Giriş yapılamadı");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <IconDeviceMobile size={28} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Uygulamaya giriş</h1>
      <p className="mt-2 text-ink-2">
        folyo uygulaması <span className="font-medium text-ink">{me.user.name}</span> hesabıyla giriş yapmak istiyor.
      </p>
      <button onClick={approve} disabled={busy} className="mt-8 h-11 w-full rounded-xl bg-accent font-medium text-on-accent disabled:opacity-60">
        Devam et
      </button>
      <p className="mt-3 text-sm text-ink-3">Bu isteği sen başlatmadıysan bu sayfayı kapat.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

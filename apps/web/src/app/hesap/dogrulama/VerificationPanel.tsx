"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconCircleCheckFilled, IconMail, IconPhone } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { VerificationStatus } from "@/lib/types";
import { safeNext } from "@/lib/useAvailability";

/** E-posta ve telefon dogrulamasi. Mesaj ve defter yazisi icin admin'in istedigi dogrulamalar gerekir. */
export function VerificationPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api<VerificationStatus>("/api/me/verification").then(setStatus, (e) => {
      if (e instanceof ApiError && e.status === 401) {
        const here = `/hesap/dogrulama${next ? `?next=${encodeURIComponent(next)}` : ""}`;
        router.replace(`/login?next=${encodeURIComponent(here)}`);
      } else {
        setFailed(true);
      }
    });
  }, [next, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <p role="alert" className="text-danger">
        Sunucuya ulaşılamadı. Sayfayı yenileyip tekrar dene.
      </p>
    );
  }
  if (!status) return <p className="text-ink-3">Yükleniyor…</p>;

  const needed = [status.requireEmail && "e-posta", status.requirePhone && "telefon"].filter(Boolean).join(" ve ");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Hesabını doğrula</h1>
      <p className="mt-2 text-ink-2">
        {needed
          ? `Başkalarına mesaj ve deftere yazı bırakmak için ${needed} doğrulaması gerekiyor. Böylece sahte hesaplar kimseyi rahatsız edemez.`
          : "Şu an yazmak için ek doğrulama gerekmiyor; yine de hesabını doğrulayabilirsin."}{" "}
        E-postan ve telefonun hiçbir sayfada gösterilmez.
      </p>

      {status.verified && (
        <div role="status" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ok-soft px-4 py-3 text-ok-ink">
          <span className="font-medium">Hesabın doğrulandı.</span>
          {next && (
            <Link href={next} className="inline-flex h-9 items-center rounded-xl bg-accent px-3 text-sm font-medium text-on-accent">
              Devam et
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-4">
        <Channel
          kind="email"
          required={status.requireEmail}
          verified={status.emailVerified}
          current={status.email}
          available={status.emailAvailable}
          onVerified={setStatus}
        />
        <Channel
          kind="phone"
          required={status.requirePhone}
          verified={status.phoneVerified}
          current={status.phone}
          available={status.phoneAvailable}
          onVerified={setStatus}
        />
      </div>
    </div>
  );
}

const TEXT = {
  email: {
    title: "E-posta",
    icon: IconMail,
    label: "E-posta adresin",
    placeholder: "ad@ornek.com",
    type: "email",
    autoComplete: "email",
    sentTo: "adresine",
  },
  phone: {
    title: "Telefon",
    icon: IconPhone,
    label: "Telefon numaran",
    placeholder: "0555 111 22 33",
    type: "tel",
    autoComplete: "tel",
    sentTo: "numarasına",
  },
} as const;

function Channel(props: {
  kind: "email" | "phone";
  required: boolean;
  verified: boolean;
  current: string | null;
  available: boolean;
  onVerified: (status: VerificationStatus) => void;
}) {
  const t = TEXT[props.kind];
  const Icon = t.icon;
  const [value, setValue] = useState(props.kind === "email" ? (props.current ?? "") : "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return setError(`${t.label} boş olamaz`);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/me/verification/${props.kind}`, { method: "POST", body: { [props.kind]: value } });
      setSentTo(value.trim());
      setCode("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kod gönderilemedi, tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      props.onVerified(await api<VerificationStatus>(`/api/me/verification/${props.kind}/confirm`, { method: "POST", body: { code } }));
      setSentTo(null);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Doğrulanamadı, tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  const input = "h-11 w-full rounded-xl border border-line-strong bg-bg px-3 outline-none focus:border-accent";

  return (
    <section aria-labelledby={`${props.kind}-title`} className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${props.kind}-title`} className="flex items-center gap-2 font-medium">
          <Icon size={18} className="text-ink-2" aria-hidden="true" />
          {t.title}
          {props.required && !props.verified && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">gerekli</span>}
        </h2>
        {props.verified && (
          <span className="inline-flex items-center gap-1 text-sm text-ok-ink">
            <IconCircleCheckFilled size={16} aria-hidden="true" /> Doğrulandı
          </span>
        )}
      </div>

      {props.verified && !editing ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
          <span>{props.current}</span>
          <button onClick={() => setEditing(true)} className="text-ink-3 underline underline-offset-2 hover:text-ink">
            Değiştir
          </button>
        </div>
      ) : !props.available ? (
        <p className="mt-2 text-sm text-ink-3">
          {props.kind === "phone" ? "Telefon" : "E-posta"} doğrulaması şu an kapalı. Yönetici entegrasyonu açınca buradan doğrulayabilirsin.
        </p>
      ) : sentTo === null ? (
        <form onSubmit={send} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`${props.kind}-value`}>
            {t.label}
          </label>
          <input
            id={`${props.kind}-value`}
            type={t.type}
            autoComplete={t.autoComplete}
            inputMode={props.kind === "phone" ? "tel" : "email"}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={t.placeholder}
            className={input}
          />
          <button disabled={busy} className="h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">
            Kod gönder
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="mt-3">
          <p className="text-sm text-ink-2">
            <strong className="font-medium">{sentTo}</strong> {t.sentTo} 6 haneli bir kod gönderdik. Kod 10 dakika geçerli.
          </p>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor={`${props.kind}-code`}>
              Doğrulama kodu
            </label>
            <input
              id={`${props.kind}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/[^0-9 ]/g, ""));
                setError(null);
              }}
              placeholder="123456"
              className={`${input} max-w-40 text-center font-mono tracking-[0.3em]`}
            />
            <button disabled={busy || code.replace(/\s/g, "").length !== 6} className="h-11 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50">
              Doğrula
            </button>
          </div>
          <button type="button" onClick={() => setSentTo(null)} className="mt-3 text-sm text-ink-3 underline underline-offset-2 hover:text-ink">
            Farklı {props.kind === "phone" ? "numara" : "adres"} gir ya da yeni kod iste
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

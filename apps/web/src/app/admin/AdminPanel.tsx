"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconDatabase, IconMail, IconMessage2, IconShieldCheck } from "@tabler/icons-react";
import { api, ApiError } from "@/lib/client-api";
import type { AdminSettings, EmailProvider, SmsProvider, StorageProvider } from "@/lib/types";
import { ModerationPanel } from "./ModerationPanel";

const field = "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm outline-none focus:border-accent";
const SECRET_PLACEHOLDER = "Kayıtlı — değiştirmek için yaz";

/**
 * Admin kararlari: dogrulama kurallari ve SMS / e-posta entegrasyonlari. Parolalar ve token'lar sunucuda sifreli
 * saklanir ve buraya hic geri gelmez; bos birakilan gizli alan mevcut degeri korur.
 */
export function AdminPanel() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [state, setState] = useState<"loading" | "forbidden" | "failed" | "ready">("loading");

  const load = useCallback(() => {
    api<AdminSettings>("/api/admin/settings").then(
      (s) => {
        setSettings(s);
        setState("ready");
      },
      (e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?next=%2Fadmin");
        else setState(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
      },
    );
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <p className="text-ink-3">Yükleniyor…</p>;
  if (state === "forbidden") {
    return (
      <div role="alert">
        <h1 className="text-2xl font-semibold tracking-tight">Bu alan yöneticiler için</h1>
        <p className="mt-2 text-ink-2">Hesabın yönetici değil. Yönetici e-postası sunucu ayarlarında (FOLYO_ADMIN_EMAILS) tanımlanır ve doğrulanmış olmalıdır.</p>
        <Link href="/edit" className="mt-4 inline-block text-sm underline underline-offset-2">Editöre dön</Link>
      </div>
    );
  }
  if (state === "failed" || !settings) {
    return (
      <p role="alert" className="text-danger">
        Ayarlar yüklenemedi. Sayfayı yenileyip tekrar dene.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Yönetim</h1>
        <Link href="/edit" className="text-sm text-ink-3 hover:text-ink">← Editör</Link>
      </div>
      <p className="mt-2 text-ink-2">Şikayetler ve moderasyon, doğrulama kuralları, kullanıcılara kod gönderen entegrasyonlar ve fotoğraf/video deposu. Değişiklikler hemen geçerli olur.</p>

      {settings.warnings.length > 0 && (
        <ul role="status" className="mt-6 flex flex-col gap-2">
          {settings.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-ink">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
              {warning}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <ModerationPanel settings={settings} onSaved={setSettings} />
        <PolicySection settings={settings} onSaved={setSettings} />
        <SmsSection settings={settings} onSaved={setSettings} />
        <EmailSection settings={settings} onSaved={setSettings} />
        <StorageSection settings={settings} onSaved={setSettings} />
      </div>
    </div>
  );
}

function useSave(onSaved: (s: AdminSettings) => void) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(path: string, body: unknown, method: "PUT" | "POST" = "PUT", okText = "Kaydedildi") {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<AdminSettings | undefined>(path, { method, body });
      if (result) onSaved(result);
      setMessage({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "İşlem yapılamadı" });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-ok-ink" : "text-danger"}`}>
      {message.text}
    </span>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof IconMail; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <Icon size={18} className="text-ink-2" aria-hidden="true" /> {title}
      </h2>
      <p className="mt-1 text-sm text-ink-3">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PolicySection({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [policy, setPolicy] = useState(settings.policy);
  const [countries, setCountries] = useState((settings.policy.phoneCountries ?? []).join(", "));
  const [limit, setLimit] = useState(settings.policy.smsDailyLimit == null ? "" : String(settings.policy.smsDailyLimit));
  const { busy, message, run } = useSave(onSaved);
  const save = () =>
    run("/api/admin/settings/policy", {
      ...policy,
      phoneCountries: countries
        .split(/[\s,]+/)
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => (c.startsWith("+") ? c : `+${c}`)),
      smsDailyLimit: limit === "" ? null : Number(limit),
    });
  return (
    <Section icon={IconShieldCheck} title="Doğrulama kuralları" description="Mesaj göndermek ve deftere yazmak için hangi doğrulamalar gerekir. Kullanıcıların 'doğrulanmışlar' kitlesi de buna göre belirlenir.">
      <div className="flex flex-col gap-3">
        {(
          [
            ["requireEmail", "E-posta doğrulaması zorunlu", "Google/GitHub'ın doğruladığı e-posta da sayılır."],
            ["requirePhone", "Telefon doğrulaması zorunlu", "SMS entegrasyonu açık olmalı. Bir numara yalnız bir hesapta doğrulanabilir."],
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={policy[key]} onChange={(e) => setPolicy({ ...policy, [key]: e.target.checked })} className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              {label}
              <span className="block text-xs text-ink-3">{hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          İzinli telefon ülke kodları
          <input className={field} value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="+90, +49" autoComplete="off" />
          <span className="text-xs text-ink-3">Yalnız bu kodlarla başlayan numaralara SMS gider (pahalı ülkelere kötüye kullanımı önler).</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Günlük SMS üst sınırı
          <input className={field} inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))} placeholder="500" />
          <span className="text-xs text-ink-3">Tüm kullanıcılar için toplam; aşılınca kod gönderimi ertesi güne kadar durur.</span>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button disabled={busy} onClick={save} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">
          Kaydet
        </button>
        <Message message={message} />
      </div>
    </Section>
  );
}

function ProviderChoice<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm ${value === option.value ? "border-accent bg-accent-soft/60" : "border-line-strong hover:border-ink-3"}`}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
          <span className="font-medium">{option.label}</span>
          <span className="block text-xs text-ink-3">{option.hint}</span>
        </label>
      ))}
    </div>
  );
}

function SmsSection({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const [provider, setProvider] = useState<SmsProvider>(settings.sms.provider);
  const [twilio, setTwilio] = useState({ accountSid: settings.sms.twilio?.accountSid ?? "", from: settings.sms.twilio?.from ?? "", authToken: "" });
  const [netgsm, setNetgsm] = useState({ usercode: settings.sms.netgsm?.usercode ?? "", header: settings.sms.netgsm?.header ?? "", password: "" });
  const [testPhone, setTestPhone] = useState("");
  const save = useSave(onSaved);
  const test = useSave(onSaved);

  const options: { value: SmsProvider; label: string; hint: string }[] = [
    { value: "OFF", label: "Kapalı", hint: "Telefon doğrulaması yapılamaz." },
    ...(settings.allowLog ? [{ value: "LOG" as SmsProvider, label: "Geliştirme (log)", hint: "Kod gönderilmez, sunucu loguna yazılır." }] : []),
    { value: "TWILIO", label: "Twilio", hint: "Global; hesap SID, auth token, gönderen numara." },
    { value: "NETGSM", label: "Netgsm", hint: "Türkiye; kullanıcı kodu, API parolası, onaylı başlık." },
  ];

  async function submit() {
    const ok = await save.run("/api/admin/settings/sms", {
      provider,
      twilio: provider === "TWILIO" ? twilio : null,
      netgsm: provider === "NETGSM" ? netgsm : null,
    });
    if (ok) {
      setTwilio((t) => ({ ...t, authToken: "" }));
      setNetgsm((n) => ({ ...n, password: "" }));
    }
  }

  return (
    <Section icon={IconMessage2} title="SMS entegrasyonu" description="Telefon doğrulama kodlarını gönderen servis.">
      <ProviderChoice name="SMS sağlayıcısı" value={provider} options={options} onChange={setProvider} />
      {provider === "TWILIO" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Hesap SID<input className={field} value={twilio.accountSid} onChange={(e) => setTwilio({ ...twilio, accountSid: e.target.value })} placeholder="AC…" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Gönderen numara<input className={field} value={twilio.from} onChange={(e) => setTwilio({ ...twilio, from: e.target.value })} placeholder="+1…" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Auth token<input className={field} type="password" value={twilio.authToken} onChange={(e) => setTwilio({ ...twilio, authToken: e.target.value })} placeholder={settings.sms.twilio?.authTokenSet ? SECRET_PLACEHOLDER : ""} autoComplete="new-password" /></label>
        </div>
      )}
      {provider === "NETGSM" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">Kullanıcı kodu<input className={field} value={netgsm.usercode} onChange={(e) => setNetgsm({ ...netgsm, usercode: e.target.value })} autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Gönderici başlığı<input className={field} value={netgsm.header} onChange={(e) => setNetgsm({ ...netgsm, header: e.target.value })} placeholder="Onaylı başlık" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">API parolası<input className={field} type="password" value={netgsm.password} onChange={(e) => setNetgsm({ ...netgsm, password: e.target.value })} placeholder={settings.sms.netgsm?.passwordSet ? SECRET_PLACEHOLDER : ""} autoComplete="new-password" /></label>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button disabled={save.busy} onClick={submit} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">Kaydet</button>
        <Message message={save.message} />
      </div>
      {settings.sms.provider !== "OFF" && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm">Kayıtlı entegrasyonla deneme SMS&apos;i gönder</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input className={field} type="tel" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0555 111 22 33" aria-label="Deneme numarası" />
            <button disabled={test.busy || !testPhone.trim()} onClick={() => test.run("/api/admin/settings/sms/test", { phone: testPhone }, "POST", "Gönderildi")} className="h-10 shrink-0 rounded-xl border border-line-strong px-4 text-sm hover:bg-surface-2 disabled:opacity-50">Deneme gönder</button>
          </div>
          <div className="mt-2"><Message message={test.message} /></div>
        </div>
      )}
    </Section>
  );
}

function EmailSection({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const smtp = settings.email.smtp;
  const [provider, setProvider] = useState<EmailProvider>(settings.email.provider);
  const [form, setForm] = useState({ host: smtp?.host ?? "", port: String(smtp?.port ?? 587), username: smtp?.username ?? "", from: smtp?.from ?? "", startTls: smtp?.startTls ?? true, password: "" });
  const [testEmail, setTestEmail] = useState("");
  const save = useSave(onSaved);
  const test = useSave(onSaved);

  const options: { value: EmailProvider; label: string; hint: string }[] = [
    { value: "OFF", label: "Kapalı", hint: "Yalnız Google/GitHub'ın doğruladığı e-postalar geçerli." },
    ...(settings.allowLog ? [{ value: "LOG" as EmailProvider, label: "Geliştirme (log)", hint: "Kod gönderilmez, sunucu loguna yazılır." }] : []),
    { value: "SMTP", label: "SMTP", hint: "Kendi e-posta sunucun ya da bir e-posta servisi." },
  ];

  async function submit() {
    const ok = await save.run("/api/admin/settings/email", {
      provider,
      smtp: provider === "SMTP" ? { ...form, port: Number(form.port) || 587 } : null,
    });
    if (ok) setForm((f) => ({ ...f, password: "" }));
  }

  return (
    <Section icon={IconMail} title="E-posta entegrasyonu" description="E-posta doğrulama kodlarını gönderen servis.">
      <ProviderChoice name="E-posta sağlayıcısı" value={provider} options={options} onChange={setProvider} />
      {provider === "SMTP" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className="flex flex-col gap-1 text-sm">Sunucu<input className={field} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.ornek.com" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Port<input className={field} inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="flex flex-col gap-1 text-sm">Kullanıcı adı<input className={field} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-1">Parola<input className={field} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={smtp?.passwordSet ? SECRET_PLACEHOLDER : ""} autoComplete="new-password" /></label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Gönderen adresi<input className={field} type="email" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} placeholder="no-reply@ornek.com" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.startTls} onChange={(e) => setForm({ ...form, startTls: e.target.checked })} className="size-4 accent-[var(--accent)]" /> STARTTLS kullan (önerilir)</label>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button disabled={save.busy} onClick={submit} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">Kaydet</button>
        <Message message={save.message} />
      </div>
      {settings.email.provider !== "OFF" && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm">Kayıtlı entegrasyonla deneme e-postası gönder</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input className={field} type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="ad@ornek.com" aria-label="Deneme adresi" />
            <button disabled={test.busy || !testEmail.trim()} onClick={() => test.run("/api/admin/settings/email/test", { email: testEmail }, "POST", "Gönderildi")} className="h-10 shrink-0 rounded-xl border border-line-strong px-4 text-sm hover:bg-surface-2 disabled:opacity-50">Deneme gönder</button>
          </div>
          <div className="mt-2"><Message message={test.message} /></div>
        </div>
      )}
    </Section>
  );
}

function StorageSection({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const s3 = settings.storage.s3;
  const [provider, setProvider] = useState<StorageProvider>(settings.storage.provider);
  const [form, setForm] = useState({
    endpoint: s3?.endpoint ?? "",
    region: s3?.region ?? "",
    bucket: s3?.bucket ?? "",
    accessKey: s3?.accessKey ?? "",
    secretKey: "",
    pathStyle: s3?.pathStyle ?? true,
  });
  const save = useSave(onSaved);
  const test = useSave(onSaved);

  const options: { value: StorageProvider; label: string; hint: string }[] = [
    { value: "LOCAL", label: "Sunucu diski", hint: "Dosyalar API sunucusundaki medya klasöründe durur." },
    { value: "S3", label: "S3 uyumlu depo", hint: "AWS S3, Cloudflare R2, MinIO, Backblaze B2…" },
  ];

  async function submit() {
    const ok = await save.run("/api/admin/settings/storage", {
      provider,
      s3: provider === "S3" ? { ...form, secretKey: form.secretKey || null } : null,
    });
    if (ok) setForm((f) => ({ ...f, secretKey: "" }));
  }

  return (
    <Section
      icon={IconDatabase}
      title="Fotoğraf ve video deposu"
      description="Yeni yüklemelerin nereye yazılacağı. Kayıtlar veritabanında, dosyalar depoda tutulur; eski dosyalar yüklendikleri depoda kalır ve okunmaya devam eder."
    >
      <ProviderChoice name="Depo" value={provider} options={options} onChange={setProvider} />
      {provider === "S3" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">Uç nokta (endpoint)<input className={field} value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://<hesap>.r2.cloudflarestorage.com — AWS için boş bırak" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Bölge<input className={field} value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="auto / eu-central-1" autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Kova (bucket)<input className={field} value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Erişim anahtarı<input className={field} value={form.accessKey} onChange={(e) => setForm({ ...form, accessKey: e.target.value })} autoComplete="off" /></label>
          <label className="flex flex-col gap-1 text-sm">Gizli anahtar<input className={field} type="password" value={form.secretKey} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} placeholder={s3?.secretKeySet ? SECRET_PLACEHOLDER : ""} autoComplete="new-password" /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.pathStyle} onChange={(e) => setForm({ ...form, pathStyle: e.target.checked })} className="size-4 accent-[var(--accent)]" /> Yol tarzı adres (MinIO ve çoğu S3 uyumlu servis için)</label>
          <p className="text-xs text-ink-3 sm:col-span-2">Kova herkese kapalı kalmalı: dosyalar yalnız API üzerinden, izin kontrolüyle sunulur.</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={save.busy} onClick={submit} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-60">Kaydet</button>
        <button disabled={test.busy} onClick={() => test.run("/api/admin/settings/storage/test", undefined, "POST", "Depo çalışıyor")} className="h-10 rounded-xl border border-line-strong px-4 text-sm hover:bg-surface-2 disabled:opacity-50">
          Kayıtlı depoyu dene
        </button>
        <Message message={save.message ?? test.message} />
      </div>
    </Section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconEyeOff, IconFlag, IconUserOff } from "@tabler/icons-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { REASONS } from "@/components/moderation/ReportDialog";
import { api, ApiError } from "@/lib/client-api";
import { relativeTime } from "@/lib/time";
import type { AdminSettings, ReportGroup, Suspension } from "@/lib/types";

const field = "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm outline-none focus:border-accent";
const TYPE: Record<ReportGroup["targetType"], string> = { POST: "Gönderi", MESSAGE: "Mesaj", PROFILE: "Sayfa", GUESTBOOK: "Defter" };
const reasonLabel = (r: string) => REASONS.find((x) => x.value === r)?.label ?? r;

/**
 * Moderasyon: sikayet kuyrugu (icerige gore gruplu), karar (kaldir / uygun bul, istenirse yazari askiya al),
 * yasakli ifadeler ve esikler, askiya alinan hesaplar.
 */
export function ModerationPanel({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <ReportQueue />
      <FilterSettings settings={settings} onSaved={onSaved} />
      <Suspensions />
    </div>
  );
}

function ReportQueue() {
  const [confirm, confirmDialog] = useConfirm();
  const [view, setView] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [groups, setGroups] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suspend, setSuspend] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    api<ReportGroup[]>(`/api/admin/reports?status=${view}`).then(setGroups, () => setError("Şikayetler yüklenemedi"));
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(group: ReportGroup, action: "REMOVE" | "DISMISS") {
    const key = `${group.targetType}:${group.targetId}`;
    const suspendAuthor = !!suspend[key];
    if (action === "REMOVE" || suspendAuthor) {
      const ok = await confirm({
        title: action === "REMOVE" ? "İçerik kaldırılsın mı?" : "Yazar askıya alınsın mı?",
        body: [
          action === "REMOVE" ? "İçerik herkesten kaldırılır; geri alınamaz." : null,
          suspendAuthor ? `${group.author?.name ?? "Yazar"} paylaşım ve mesaj gönderemez (askı panelden kaldırılabilir).` : null,
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: action === "REMOVE" ? "Kaldır" : "Askıya al",
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await api("/api/admin/reports/resolve", {
        method: "POST",
        body: { targetType: group.targetType, targetId: group.targetId, action, suspendAuthor, reason: null },
      });
      setGroups((list) => list && list.filter((g) => g !== group));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Karar kaydedilemedi");
    }
  }

  return (
    <section aria-labelledby="reports-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <IconFlag size={18} className="text-ink-2" aria-hidden="true" />
        <h2 id="reports-title" className="font-medium">
          Şikayetler
        </h2>
        <div className="ml-auto inline-flex rounded-xl border border-line-strong p-0.5 text-sm">
          {(["OPEN", "RESOLVED"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`h-8 rounded-[10px] px-3 ${view === v ? "bg-accent text-on-accent" : "text-ink-2"}`}>
              {v === "OPEN" ? "Bekleyen" : "Son kararlar"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-3">Aynı içeriğe gelen şikayetler tek satırda. Şikayet edenlerin kimliği yazara gösterilmez.</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!groups ? (
        <p className="mt-4 text-sm text-ink-3">Yükleniyor…</p>
      ) : groups.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-3">
          {view === "OPEN" ? "Bekleyen şikayet yok." : "Son 30 günde karar yok."}
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {groups.map((group) => {
            const key = `${group.targetType}:${group.targetId}`;
            return (
              <li key={key} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium">{TYPE[group.targetType]}</span>
                  {group.author ? (
                    <span>
                      {group.author.username ? (
                        <Link href={`/${group.author.username}`} target="_blank" className="font-medium hover:underline">
                          {group.author.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{group.author.name}</span>
                      )}
                      {group.author.suspended && <span className="ml-1 text-xs text-danger">(askıda)</span>}
                    </span>
                  ) : (
                    <span className="text-ink-3">Silinmiş hesap</span>
                  )}
                  <span className="text-ink-3">· {group.count} şikayet · son {relativeTime(group.lastAt)}</span>
                  {group.hidden && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-xs text-danger">
                      <IconEyeOff size={13} aria-hidden="true" /> otomatik gizlendi
                    </span>
                  )}
                  {view === "RESOLVED" && (
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs">{group.status === "REMOVED" ? "Kaldırıldı" : "Uygun bulundu"}</span>
                  )}
                  {group.link && view === "OPEN" && (
                    <Link href={group.link} target="_blank" className="ml-auto text-xs underline underline-offset-2">
                      Yerinde gör
                    </Link>
                  )}
                </div>
                {group.snapshot && <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-2 px-3 py-2 text-sm">{group.snapshot}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(group.reasons).map(([reason, count]) => (
                    <span key={reason} className="rounded-full border border-line-strong px-2 py-0.5 text-xs">
                      {reasonLabel(reason)} {count > 1 ? `×${count}` : ""}
                    </span>
                  ))}
                </div>
                {group.reports.some((r) => r.note) && (
                  <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-2">
                    {group.reports
                      .filter((r) => r.note)
                      .map((r, i) => (
                        <li key={i}>“{r.note}”</li>
                      ))}
                  </ul>
                )}
                {view === "OPEN" && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {group.targetType !== "PROFILE" && (
                      <button onClick={() => decide(group, "REMOVE")} className="h-9 rounded-xl bg-danger px-3 text-sm font-medium text-white">
                        İçeriği kaldır
                      </button>
                    )}
                    <button onClick={() => decide(group, "DISMISS")} className="h-9 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-2">
                      {group.hidden ? "Uygun · geri aç" : "Uygun"}
                    </button>
                    {group.author && !group.author.suspended && (
                      <label className="ml-auto inline-flex items-center gap-2 text-sm text-ink-2">
                        <input type="checkbox" checked={!!suspend[key]} onChange={(e) => setSuspend({ ...suspend, [key]: e.target.checked })} className="size-4 accent-[var(--accent)]" />
                        Yazarı askıya al
                      </label>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {confirmDialog}
    </section>
  );
}

function FilterSettings({ settings, onSaved }: { settings: AdminSettings; onSaved: (s: AdminSettings) => void }) {
  const policy = settings.moderation;
  const [words, setWords] = useState((policy.blockedWords ?? []).join("\n"));
  const [threshold, setThreshold] = useState(String(policy.autoHideThreshold ?? 3));
  const [daily, setDaily] = useState(String(policy.dailyReportLimit ?? 20));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMessage(null);
    try {
      onSaved(
        await api<AdminSettings>("/api/admin/settings/moderation", {
          method: "PUT",
          body: {
            blockedWords: words.split("\n").map((w) => w.trim()).filter(Boolean),
            autoHideThreshold: Number(threshold) || 3,
            dailyReportLimit: Number(daily) || 20,
          },
        }),
      );
      setMessage({ ok: true, text: "Kaydedildi" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Kaydedilemedi" });
    }
  }

  return (
    <section aria-labelledby="filter-title" className="rounded-2xl border border-line bg-surface p-5">
      <h2 id="filter-title" className="font-medium">
        Filtre ve eşikler
      </h2>
      <p className="mt-1 text-sm text-ink-3">Yasaklı ifadeler gönderi, yanıt, mesaj ve defterde kabul edilmez (büyük/küçük harf, aksan ve rakamla yazım yakalanır; kelime olarak eşleşir).</p>
      <label className="mt-4 flex flex-col gap-1 text-sm">
        Yasaklı ifadeler (her satıra bir tane)
        <textarea value={words} onChange={(e) => setWords(e.target.value)} rows={5} className="rounded-xl border border-line-strong bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Otomatik gizleme eşiği
          <input className={field} inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))} />
          <span className="text-xs text-ink-3">Bu kadar farklı kişi şikayet edince gönderi/defter yazısı karar verilene kadar gizlenir.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kişi başı günlük şikayet
          <input className={field} inputMode="numeric" value={daily} onChange={(e) => setDaily(e.target.value.replace(/\D/g, ""))} />
          <span className="text-xs text-ink-3">Şikayet düğmesinin kötüye kullanımını önler.</span>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} className="h-10 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
          Kaydet
        </button>
        {message && <span className={`text-sm ${message.ok ? "text-ok-ink" : "text-danger"}`}>{message.text}</span>}
      </div>
    </section>
  );
}

function Suspensions() {
  const [list, setList] = useState<Suspension[] | null>(null);
  const load = useCallback(() => {
    api<Suspension[]>("/api/admin/suspensions").then(setList, () => setList([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function lift(s: Suspension) {
    await api(`/api/admin/users/${s.userId}/suspension`, { method: "DELETE" }).then(load, () => undefined);
  }

  return (
    <section aria-labelledby="suspensions-title" className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <IconUserOff size={18} className="text-ink-2" aria-hidden="true" />
        <h2 id="suspensions-title" className="font-medium">
          Askıya alınan hesaplar
        </h2>
      </div>
      {!list ? (
        <p className="mt-3 text-sm text-ink-3">Yükleniyor…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">Askıda hesap yok.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {list.map((s) => (
            <li key={s.userId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{s.name}</span>
              {s.username && <span className="text-ink-3">@{s.username}</span>}
              <span className="text-ink-3">· {relativeTime(s.at)}</span>
              {s.reason && <span className="text-ink-2">· {s.reason}</span>}
              <button onClick={() => lift(s)} className="ml-auto h-8 rounded-lg border border-line-strong px-2.5 hover:bg-surface-2">
                Askıyı kaldır
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

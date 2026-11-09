"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconAlignLeft,
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLink,
  IconPlus,
  IconTrash,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { api, ApiError, upload } from "@/lib/client-api";
import { useConfirm } from "../ConfirmDialog";
import { displayAddress, platformFor, platformForType } from "@/lib/platforms";
import type { Card, CardSize, CardType, ConnectionInfo, MediaItem } from "@/lib/types";

const SIZES: CardSize[] = ["SMALL", "WIDE", "LARGE"];
const SIZE_LABEL: Record<CardSize, string> = { SMALL: "1×1", WIDE: "2×1", LARGE: "2×2" };
const iconButton = "inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * Kart listesi. Guncellemeler hep onceki listeye uygulanir (functional update): art arda yapilan islemler
 * birbirinin sonucunu ezmez; ornegin iki kart hizlica silinince ilki geri gelmez.
 */
export function CardManager({ cards, onChange }: { cards: Card[]; onChange: Dispatch<SetStateAction<Card[] | null>> }) {
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const [confirm, confirmDialog] = useConfirm();

  const loadConnections = () => api<ConnectionInfo[]>("/api/me/connections").then(setConnections, () => setConnections([]));
  useEffect(() => {
    loadConnections();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "İşlem yapılamadı");
      // Sunucudaki gercek duruma don.
      api<Card[]>("/api/me/cards").then(onChange, () => undefined);
    }
  }

  const update = (fn: (list: Card[]) => Card[]) => onChange((prev) => (prev ? fn(prev) : prev));
  const replace = (updated: Card) => update((list) => list.map((c) => (c.id === updated.id ? updated : c)));

  // Fare: 6 px hareket edince surukleme baslar (tiklamalar bozulmaz). Dokunmatik: kisa basili tutma. Klavye: bosluk + oklar.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Yeni sira hemen gosterilir, sunucuya tum liste tek istekte gider; hata olursa sunucudaki sira geri yuklenir. */
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(cards, cards.findIndex((c) => c.id === active.id), cards.findIndex((c) => c.id === over.id));
    run(async () => {
      onChange(next);
      onChange(await api<Card[]>("/api/me/cards/order", { method: "PUT", body: { cardIds: next.map((c) => c.id) } }));
    });
  };

  const patch = (card: Card, body: Partial<Pick<Card, "size" | "visible" | "audience">>) =>
    run(async () => replace(await api<Card>(`/api/me/cards/${card.id}`, { method: "PATCH", body })));

  const remove = async (card: Card) => {
    const photos = card.type === "GALLERY" ? (card.media?.length ?? 0) : 0;
    const ok = await confirm({
      title: "Kart silinsin mi?",
      body: photos > 0 ? `“${describe(card).title}” ve içindeki ${photos} fotoğraf kalıcı olarak silinecek.` : `“${describe(card).title}” sayfandan kaldırılacak.`,
      confirmLabel: "Sil",
      danger: true,
    });
    if (!ok) return;
    await run(async () => {
      await api(`/api/me/cards/${card.id}`, { method: "DELETE" });
      update((list) => list.filter((c) => c.id !== card.id));
    });
  };

  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-medium mb-4">Kartlar</h2>
      {cards.length > 0 && (
        <DndContext id="cards" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="mb-5 flex flex-col divide-y divide-line rounded-xl border border-line">
              {cards.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  onResize={() => patch(card, { size: SIZES[(SIZES.indexOf(card.size) + 1) % SIZES.length] })}
                  onToggle={() => patch(card, { visible: !card.visible })}
                  onAudience={(audience) => patch(card, { audience })}
                  onDelete={() => remove(card)}
                  onMediaChange={(fn) => update((list) => list.map((c) => (c.id === card.id ? { ...c, media: fn(c.media ?? []) } : c)))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {cards.length === 0 && (
        <p className="mb-4 rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
          Henüz kartın yok. Aşağıdan bir link, metin ya da canlı hesap kartı ekleyerek başla.
        </p>
      )}
      <AddCard
        connections={connections}
        onConnectionsChange={loadConnections}
        onAdded={(card) => update((list) => [...list, card])}
        confirm={confirm}
      />
      {confirmDialog}
    </section>
  );
}

function describe(card: Card): { icon: Icon; tone: string; title: string; subtitle: string } {
  switch (card.type) {
    case "LINK": {
      const p = platformFor(card.config.url);
      return { icon: p.icon, tone: p.tone, title: card.config.title || p.name, subtitle: displayAddress(card.config.url) };
    }
    case "TEXT":
      return { icon: IconAlignLeft, tone: "gray", title: card.config.text ?? "", subtitle: "Metin" };
    case "GALLERY": {
      const p = platformForType(card.type);
      return { icon: p.icon, tone: p.tone, title: card.config.title || "Galeri", subtitle: `${card.media?.length ?? 0} fotoğraf` };
    }
    default: {
      const p = platformForType(card.type);
      const subtitle = card.config.username ? `@${card.config.username} · canlı` : "Canlı · bağlı hesap";
      return { icon: p.icon, tone: p.tone, title: p.name, subtitle };
    }
  }
}

function CardRow(props: {
  card: Card;
  onResize: () => void;
  onToggle: () => void;
  onAudience: (audience: Card["audience"]) => void;
  onDelete: () => void;
  onMediaChange: (fn: (media: MediaItem[]) => MediaItem[]) => void;
}) {
  const { card } = props;
  const { icon: Icon, tone, title, subtitle } = describe(card);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative px-3 py-2 bg-surface ${isDragging ? "z-10 rounded-xl shadow-lg ring-1 ring-accent" : ""}`}
    >
      <div className={`flex items-center gap-2 ${card.visible ? "" : "opacity-55"}`}>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`${title} kartını taşı`}
          className="-ml-1 inline-flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded-md text-ink-3 hover:text-ink active:cursor-grabbing"
        >
          <IconGripVertical size={16} aria-hidden="true" />
        </button>
        <span className={`tone-${tone} inline-flex size-8 shrink-0 items-center justify-center rounded-lg`} style={{ background: "var(--tone-bg)", color: "var(--tone-ink)" }}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-ink-3">{subtitle}</p>
        </div>
        <button
          onClick={props.onResize}
          title="Boyutu değiştir"
          aria-label={`${title} kartının boyutu ${SIZE_LABEL[card.size]}, değiştir`}
          className="h-7 rounded-full border border-accent/40 bg-accent-soft px-2.5 text-xs text-accent-ink"
        >
          {SIZE_LABEL[card.size]}
        </button>
        {card.visible && (
          <select
            value={card.audience}
            onChange={(e) => props.onAudience(e.target.value as Card["audience"])}
            aria-label={`${title} kartını kim görebilir`}
            title="Kim görebilir"
            className={`h-7 max-w-[7.5rem] rounded-full border px-2 text-xs outline-none focus:border-accent ${card.audience === "EVERYONE" ? "border-line-strong text-ink-2" : "border-accent/40 bg-accent-soft text-accent-ink"}`}
          >
            <option value="EVERYONE">Herkes</option>
            <option value="SIGNED_IN">Giriş yapanlar</option>
            <option value="VERIFIED">Doğrulanmışlar</option>
          </select>
        )}
        <button onClick={props.onToggle} aria-label={card.visible ? `${title} kartını gizle` : `${title} kartını göster`} title={card.visible ? "Gizle" : "Göster"} className={iconButton}>
          {card.visible ? <IconEye size={16} aria-hidden="true" /> : <IconEyeOff size={16} aria-hidden="true" />}
        </button>
        <button onClick={props.onDelete} aria-label={`${title} kartını sil`} title="Sil" className={`${iconButton} hover:text-danger`}>
          <IconTrash size={16} aria-hidden="true" />
        </button>
      </div>
      {card.type === "GALLERY" && <GalleryEditor card={card} onChange={props.onMediaChange} />}
    </li>
  );
}

/** Fotograflar sirayla yuklenir; biri basarisiz olursa digerleri devam eder ve hata gosterilir. */
function GalleryEditor({ card, onChange }: { card: Card; onChange: (fn: (media: MediaItem[]) => MediaItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const media = card.media ?? [];

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files);
    for (const [i, file] of list.entries()) {
      setBusy(`Yükleniyor ${i + 1}/${list.length}`);
      try {
        const item = await upload<MediaItem>(`/api/me/cards/${card.id}/media`, file);
        onChange((current) => [...current, item]);
      } catch (e) {
        setError(`${file.name}: ${e instanceof ApiError ? e.message : "yüklenemedi"}`);
      }
    }
    setBusy(null);
    if (input.current) input.current.value = "";
  }

  async function remove(item: MediaItem) {
    if (!(await confirm({ title: "Fotoğraf silinsin mi?", body: "Fotoğraf galeriden kalıcı olarak kaldırılacak.", confirmLabel: "Sil", danger: true }))) return;
    try {
      await api(`/api/me/media/${item.id}`, { method: "DELETE" });
      onChange((current) => current.filter((m) => m.id !== item.id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Silinemedi");
    }
  }

  return (
    <div className="mt-2 ml-10">
      <div className="flex flex-wrap gap-1.5">
        {media.map((item) => (
          <div key={item.id} className="group relative size-14 overflow-hidden rounded-lg bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" className="size-full object-cover" />
            <button onClick={() => remove(item)} aria-label="Fotoğrafı sil" className="absolute right-0.5 top-0.5 inline-flex size-5 items-center justify-center rounded-full bg-black/60 text-white [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100">
              <IconX size={12} />
            </button>
          </div>
        ))}
        <label className="inline-flex size-14 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-3 hover:text-ink">
          <IconPlus size={18} aria-hidden="true" />
          <span className="sr-only">Fotoğraf ekle</span>
          <input ref={input} type="file" accept="image/jpeg,image/png" multiple className="sr-only" onChange={(e) => add(e.target.files)} disabled={busy !== null} />
        </label>
      </div>
      {(busy || error) && (
        <p role={error ? "alert" : "status"} className={`mt-1 text-xs ${error ? "text-danger" : "text-ink-3"}`}>
          {error ?? busy}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-3">JPEG veya PNG. Konum (GPS) dahil tüm fotoğraf bilgileri yüklerken silinir.</p>
      {confirmDialog}
    </div>
  );
}

type Choice = { type: CardType; label: string; icon: Icon };

const CHOICES: Choice[] = [
  { type: "LINK", label: "Link", icon: IconLink },
  { type: "TEXT", label: "Metin", icon: IconAlignLeft },
  { type: "GITHUB", label: "GitHub", icon: platformForType("GITHUB").icon },
  { type: "SPOTIFY", label: "Spotify", icon: platformForType("SPOTIFY").icon },
  { type: "LASTFM", label: "Last.fm", icon: platformForType("LASTFM").icon },
  { type: "STRAVA", label: "Strava", icon: platformForType("STRAVA").icon },
  { type: "REDDIT", label: "Reddit", icon: platformForType("REDDIT").icon },
  { type: "GALLERY", label: "Galeri", icon: platformForType("GALLERY").icon },
];

const USERNAME_HINT: Partial<Record<CardType, string>> = {
  GITHUB: "GitHub kullanıcı adın",
  LASTFM: "Last.fm kullanıcı adın",
  REDDIT: "Reddit kullanıcı adın",
};

function AddCard({
  connections,
  onConnectionsChange,
  onAdded,
  confirm,
}: {
  connections: ConnectionInfo[];
  onConnectionsChange: () => void;
  onAdded: (card: Card) => void;
  confirm: ReturnType<typeof useConfirm>[0];
}) {
  const [type, setType] = useState<CardType>("LINK");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const connection = type === "SPOTIFY" || type === "STRAVA" ? connections.find((c) => c.provider === type.toLowerCase()) : undefined;
  const needsConnection = type === "SPOTIFY" || type === "STRAVA";

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (type === "LINK" && !url.trim()) return setError("Bir link yaz");
    if (type === "TEXT" && !text.trim()) return setError("Kart metnini yaz");
    if (USERNAME_HINT[type] && !username.trim()) return setError("Kullanıcı adını yaz");
    const config =
      type === "LINK" ? { url, title } : type === "TEXT" ? { text } : type === "GALLERY" ? { title } : USERNAME_HINT[type] ? { username } : {};
    setSaving(true);
    try {
      onAdded(await api<Card>("/api/me/cards", { method: "POST", body: { type, config } }));
      setUrl("");
      setTitle("");
      setText("");
      setUsername("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Kart eklenemedi");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    const ok = await confirm({
      title: `${providerName} bağlantısı kaldırılsın mı?`,
      body: `${providerName} kartın canlı veri göstermeyi bırakır ve bu hesaptan gelen aktiviteler sayfandan silinir.`,
      confirmLabel: "Bağlantıyı kaldır",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/me/connections/${type.toLowerCase()}`, { method: "DELETE" });
      onConnectionsChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bağlantı kaldırılamadı");
    }
  }

  const detected = type === "LINK" && url.trim() ? platformFor(url.includes("://") ? url : `https://${url}`) : null;
  const input = "h-10 w-full rounded-xl border border-line-strong bg-bg px-3 outline-none focus:border-accent";
  const providerName = type === "SPOTIFY" ? "Spotify" : "Strava";

  return (
    <form onSubmit={add} className="rounded-xl bg-surface-2 p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {CHOICES.map(({ type: value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setType(value);
              setError(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm ${type === value ? "bg-accent text-on-accent" : "border border-line-strong text-ink-2"}`}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {type === "LINK" && (
        <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr]">
          <input className={input} value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} placeholder="instagram.com/adin" aria-label="Link" />
          <input className={input} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={detected?.name ?? "Başlık (isteğe bağlı)"} aria-label="Başlık" />
        </div>
      )}
      {type === "TEXT" && (
        <textarea
          className="min-h-20 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 outline-none focus:border-accent"
          value={text}
          maxLength={280}
          onChange={(e) => { setText(e.target.value); setError(null); }}
          placeholder="Kendinden kısaca bahset"
          aria-label="Metin"
        />
      )}
      {USERNAME_HINT[type] && (
        <input className={input} value={username} onChange={(e) => { setUsername(e.target.value); setError(null); }} placeholder={USERNAME_HINT[type]} aria-label="Kullanıcı adı" autoCapitalize="none" spellCheck={false} />
      )}
      {type === "GALLERY" && (
        <input className={input} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Galeri başlığı (isteğe bağlı)" aria-label="Galeri başlığı" />
      )}
      {needsConnection && (
        <div className="rounded-xl border border-line bg-bg px-3 py-2.5 text-sm">
          {!connection || !connection.configured ? (
            <span className="text-ink-3">{providerName} bağlantısı sunucuda henüz yapılandırılmamış.</span>
          ) : connection.connected ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ok-ink">Bağlı: {connection.externalUsername ?? providerName}</span>
              <button type="button" onClick={disconnect} className="text-ink-3 underline-offset-2 hover:underline">
                Bağlantıyı kaldır
              </button>
            </span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {connection.status === "REVOKED" && <span className="text-danger">İzin geri alınmış.</span>}
              {/* Tam sayfa gecis: saglayicinin izin sayfasina gidip editore geri doner. */}
              <a href={`/api/me/connections/${connection.provider}/start`} className="font-medium text-accent">
                {providerName} hesabını bağla
              </a>
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={saving || (needsConnection && !connection?.connected)}
          className="h-9 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50"
        >
          Kart ekle
        </button>
        {detected && detected.key !== "web" && <span className="text-sm text-ink-3">{detected.name} olarak tanındı</span>}
        {error && (
          <span role="alert" className="text-sm text-danger">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

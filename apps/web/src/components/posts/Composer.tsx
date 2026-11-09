"use client";

/* eslint-disable @next/next/no-img-element -- secilen dosyanin yerel onizlemesi (blob:) */
import { useEffect, useId, useRef, useState } from "react";
import { IconPhotoPlus, IconVideo, IconX } from "@tabler/icons-react";
import { api, ApiError, upload } from "@/lib/client-api";
import type { Asset, Post, PostAudience } from "@/lib/types";

const MAX_BODY = 500;
const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type Attachment = {
  key: string;
  kind: "PHOTO" | "VIDEO";
  preview: string;
  progress: number;
  asset: Asset | null;
  error: string | null;
  abort: AbortController;
};

const AUDIENCES: { value: PostAudience; label: string }[] = [
  { value: "EVERYONE", label: "Herkes" },
  { value: "SIGNED_IN", label: "Giriş yapanlar" },
  { value: "VERIFIED", label: "Doğrulanmışlar" },
];

/**
 * Gonderi ya da yanit yazma kutusu. Dosyalar secilir secilmez yuklenmeye baslar (orijinal kalite, sikistirma yok);
 * paylas'a basildiginda yalniz kimlikleri gonderilir.
 */
export function Composer({
  replyToId,
  onPosted,
  placeholder = "Neler oluyor?",
  autoFocus = false,
}: {
  replyToId?: string;
  onPosted: (post: Post) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<PostAudience>("EVERYONE");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const attachmentsRef = useRef(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  // Sayfadan cikilinca yerel onizlemeler serbest birakilir, yarim kalan yuklemeler durdurulur.
  useEffect(
    () => () =>
      attachmentsRef.current.forEach((a) => {
        URL.revokeObjectURL(a.preview);
        if (!a.asset) a.abort.abort();
      }),
    [],
  );

  const length = [...body].length;
  const hasVideo = attachments.some((a) => a.kind === "VIDEO");
  const uploading = attachments.some((a) => !a.asset && !a.error);
  const canPost = !posting && !uploading && (body.trim().length > 0 || attachments.some((a) => a.asset)) && length <= MAX_BODY;

  function update(key: string, change: Partial<Attachment>) {
    setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...change } : a)));
  }

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const chosen = Array.from(files);
    const videos = chosen.filter((f) => f.type.startsWith("video/"));
    const photos = chosen.filter((f) => f.type.startsWith("image/"));
    if (videos.length > 0 && (videos.length > 1 || photos.length > 0 || attachments.length > 0)) {
      return setError("Video tek başına paylaşılır: en fazla 1 video ya da 4 fotoğraf");
    }
    if (hasVideo && photos.length > 0) return setError("Video tek başına paylaşılır");
    if (attachments.length + photos.length > MAX_PHOTOS) return setError(`En fazla ${MAX_PHOTOS} fotoğraf ekleyebilirsin`);
    for (const file of chosen) {
      const video = file.type.startsWith("video/");
      if (!video && !file.type.startsWith("image/")) {
        setError("Yalnız fotoğraf ya da video eklenebilir");
        continue;
      }
      if (file.size > (video ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES)) {
        setError(video ? "Video en fazla 200 MB olabilir" : "Fotoğraf en fazla 25 MB olabilir");
        continue;
      }
      const attachment: Attachment = {
        key: `${file.name}-${file.size}-${Math.random()}`,
        kind: video ? "VIDEO" : "PHOTO",
        preview: URL.createObjectURL(file),
        progress: 0,
        asset: null,
        error: null,
        abort: new AbortController(),
      };
      setAttachments((list) => [...list, attachment]);
      upload<Asset>(video ? "/api/me/assets/videos" : "/api/me/assets/photos", file, {
        onProgress: (p) => update(attachment.key, { progress: p }),
        signal: attachment.abort.signal,
      }).then(
        (asset) => update(attachment.key, { asset, progress: 1 }),
        (e) => update(attachment.key, { error: e instanceof ApiError ? e.message : "Yüklenemedi" }),
      );
    }
  }

  function remove(key: string) {
    setAttachments((list) => {
      const item = list.find((a) => a.key === key);
      if (item) {
        URL.revokeObjectURL(item.preview);
        if (!item.asset) item.abort.abort();
      }
      return list.filter((a) => a.key !== key);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const post = await api<Post>("/api/me/posts", {
        method: "POST",
        body: {
          body: body.trim() || null,
          mediaIds: attachments.filter((a) => a.asset).map((a) => a.asset!.id),
          audience: replyToId ? undefined : audience,
          replyToId,
        },
      });
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setAttachments([]);
      setBody("");
      onPosted(post);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Paylaşılamadı, tekrar dene");
    } finally {
      setPosting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
      <label htmlFor={`${id}-body`} className="sr-only">
        {replyToId ? "Yanıtın" : "Gönderin"}
      </label>
      <textarea
        id={`${id}-body`}
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => {
          setBody(e.target.value);
          setError(null);
        }}
        placeholder={placeholder}
        rows={replyToId ? 2 : 3}
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-3"
      />

      {attachments.length > 0 && (
        <ul className={`mt-2 grid gap-2 ${attachments.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-4"}`}>
          {attachments.map((a) => (
            <li key={a.key} className="relative overflow-hidden rounded-xl bg-surface-2" style={{ aspectRatio: attachments.length === 1 ? "16 / 9" : "1" }}>
              {a.kind === "VIDEO" ? (
                <video src={a.preview} muted playsInline className="absolute inset-0 size-full object-cover" />
              ) : (
                <img src={a.preview} alt="" className="absolute inset-0 size-full object-cover" />
              )}
              {!a.asset && !a.error && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" role="progressbar" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Yükleniyor">
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(a.progress * 100)}%` }} />
                </div>
              )}
              {a.error && <p className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-xs text-white">{a.error}</p>}
              <button
                type="button"
                onClick={() => remove(a.key)}
                aria-label="Kaldır"
                className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <IconX size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          multiple
          className="hidden"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={hasVideo || attachments.length >= MAX_PHOTOS}
          aria-label="Fotoğraf ya da video ekle"
          className="inline-flex size-9 items-center justify-center rounded-xl text-accent hover:bg-accent-soft disabled:opacity-40"
        >
          <IconPhotoPlus size={20} aria-hidden="true" />
        </button>
        {hasVideo && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-3">
            <IconVideo size={14} aria-hidden="true" /> Video sıkıştırılmadan paylaşılır
          </span>
        )}
        {!replyToId && (
          <>
            <label htmlFor={`${id}-audience`} className="sr-only">
              Kim görebilir
            </label>
            <select
              id={`${id}-audience`}
              value={audience}
              onChange={(e) => setAudience(e.target.value as PostAudience)}
              className="h-9 rounded-xl border border-line-strong bg-bg px-2 text-sm"
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </>
        )}
        <span className={`ml-auto text-xs tabular-nums ${length > MAX_BODY ? "text-danger" : "text-ink-3"}`}>
          {length}/{MAX_BODY}
        </span>
        <button disabled={!canPost} className="h-9 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-50">
          {posting ? "Paylaşılıyor…" : uploading ? "Yükleniyor…" : replyToId ? "Yanıtla" : "Paylaş"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type ConfirmRequest = {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Verilirse onay dugmesi ancak bu metin aynen yazilinca acilir (geri donusu olmayan islemler icin). */
  typeToConfirm?: string;
};

/**
 * Geri donusu zor islemlerden once sorulan soru. `confirm(...)` kullanicinin cevabini Promise olarak doner;
 * donen `dialog` ogesi bilesenin icinde bir kez render edilir.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback(
    (next: ConfirmRequest) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setRequest(next);
      }),
    [],
  );

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  }, []);

  const dialog = request ? <ConfirmDialog key={request.title} request={request} onClose={close} /> : null;
  return [confirm, dialog] as const;
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [typed, setTyped] = useState("");
  const locked = request.typeToConfirm !== undefined && typed.trim() !== request.typeToConfirm;

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose(false);
      }}
      className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/45"
    >
      <form
        method="dialog"
        className="p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked) onClose(true);
        }}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {request.title}
        </h2>
        {request.body && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{request.body}</p>}
        {request.typeToConfirm !== undefined && (
          <label className="mt-4 flex flex-col gap-1.5 text-sm">
            <span>
              Onaylamak için <strong className="font-semibold">{request.typeToConfirm}</strong> yaz
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-10 rounded-xl border border-line-strong bg-bg px-3 outline-none focus:border-accent"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => onClose(false)} className="h-10 rounded-xl px-4 text-sm hover:bg-surface-2">
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={locked}
            className={`h-10 rounded-xl px-4 text-sm font-medium disabled:opacity-40 ${request.danger ? "bg-danger text-bg" : "bg-accent text-on-accent"}`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}

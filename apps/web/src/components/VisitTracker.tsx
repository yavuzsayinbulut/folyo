"use client";

import { useEffect, useRef } from "react";

function beacon(url: string) {
  // sendBeacon sayfa kapanirken bile gider ve yaniti beklemez; yoksa keepalive fetch.
  if (!navigator.sendBeacon?.(url)) {
    fetch(url, { method: "POST", keepalive: true, credentials: "same-origin" }).catch(() => {});
  }
}

/**
 * Sayfa goruntulenmesini ve kart tiklamalarini sayar. Tiklama, data-card-id tasiyan herhangi bir linkten gelir
 * (kart, platform ikonu, galeri fotografi). Sayma kurallari (sahip, bot, tekillik) sunucudadir.
 */
export function VisitTracker({ username }: { username: string }) {
  const sent = useRef(false);

  useEffect(() => {
    // StrictMode'da efekt iki kez calisir; ref ayni kaldigi icin tek goruntulenme gider.
    if (!sent.current) {
      sent.current = true;
      beacon(`/api/public/profiles/${encodeURIComponent(username)}/view`);
    }
    const onClick = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-card-id]");
      if (target?.dataset.cardId) beacon(`/api/public/cards/${target.dataset.cardId}/click`);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, [username]);

  return null;
}

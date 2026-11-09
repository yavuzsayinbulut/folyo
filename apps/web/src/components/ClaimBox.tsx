"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { useAvailability } from "@/lib/useAvailability";

export function ClaimBox() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const availability = useAvailability(username);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = username.trim().toLowerCase();
    if (!value) return setError("Önce bir kullanıcı adı yaz");
    if (availability.kind === "unavailable") return setError(availability.reason);
    // Giris yoksa /edit, login sayfasina yonlendirir ve donuste adi hazir getirir.
    router.push(`/edit?username=${encodeURIComponent(value)}`);
  }

  const hint =
    error ??
    (availability.kind === "available"
      ? `folyo.app/${username.trim().toLowerCase()} boşta`
      : availability.kind === "unavailable"
        ? availability.reason
        : null);
  const hintColor = error || availability.kind === "unavailable" ? "text-danger" : "text-ok-ink";

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 focus-within:border-accent">
        <label className="flex flex-1 items-center pl-3 min-w-0">
          <span className="text-ink-3">folyo.app/</span>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            placeholder="adin"
            aria-label="Kullanıcı adı"
            autoCapitalize="none"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent outline-none py-2"
          />
        </label>
        <button className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 text-on-accent font-medium">
          Sayfanı aç <IconArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p className={`mt-2 h-5 pl-2 text-sm ${hintColor}`}>{hint}</p>
    </form>
  );
}

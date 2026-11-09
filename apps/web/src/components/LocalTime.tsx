"use client";

import { useEffect, useState } from "react";

/** Sayfa sahibinin yerel saati; ziyaretcinin tarayicisinda hesaplanir ve dakikada bir guncellenir. */
export function LocalTime({ timezone }: { timezone: string }) {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const format = () =>
      setTime(new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date()));
    format();
    const id = setInterval(format, 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  if (!time) return null;
  return <span suppressHydrationWarning>{time}</span>;
}

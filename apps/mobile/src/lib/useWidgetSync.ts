import { useEffect } from "react";
import { AppState } from "react-native";
import VisitsWidget from "@/widgets/VisitsWidget";
import type { VisitsWidgetProps } from "@/widgets/types";
import { useApi } from "./api";

export type WidgetSummary = {
  username: string;
  displayName: string;
  weekVisitors: number;
  previousWeekVisitors: number;
  last7Days: number[];
  latestMessage: { authorName: string; body: string } | null;
};

/** Sunucu ozetini widget'in gosterecegi hazir degerlere cevirir (widget kendi icinde hesap yapamaz). */
export function toWidgetProps(summary: WidgetSummary): VisitsWidgetProps {
  const max = Math.max(1, ...summary.last7Days);
  const previous = summary.previousWeekVisitors;
  const change = previous === 0 ? null : Math.round(((summary.weekVisitors - previous) / previous) * 100);
  const message = summary.latestMessage ? `${summary.latestMessage.authorName}: ${summary.latestMessage.body}` : "";
  return {
    username: summary.username,
    visitors: new Intl.NumberFormat("tr-TR").format(summary.weekVisitors),
    delta: change === null ? "geçen haftayla kıyas yok" : change === 0 ? "geçen haftayla aynı" : `${change > 0 ? "↑" : "↓"} %${Math.abs(change)} geçen haftaya göre`,
    deltaTrend: change === null || change === 0 ? "flat" : change > 0 ? "up" : "down",
    bars: summary.last7Days.map((v) => Math.max(3, Math.round((v / max) * 56))),
    message: message.length > 70 ? `${message.slice(0, 69)}…` : message,
  };
}

/** Uygulama acildiginda ve on plana her geldiginde ana ekran widget'ini tazeler. */
export function useWidgetSync() {
  const api = useApi();

  useEffect(() => {
    const refresh = () =>
      api<WidgetSummary>("/api/me/widget")
        .then((summary) => VisitsWidget.updateSnapshot(toWidgetProps(summary)))
        .catch(() => undefined);
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [api]);
}

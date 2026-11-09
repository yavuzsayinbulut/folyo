import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useApi } from "./api";
import type { Card, Me } from "./types";

/** Ekran her one geldiginde kullanici ve kartlar tazelenir (baska ekranda ya da web'de yapilan degisiklikler gorunur). */
export function useMeAndCards() {
  const api = useApi();
  const [me, setMe] = useState<Me | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api<Me>("/api/me");
      setMe(result);
      setCards(result.profile ? await api<Card[]>("/api/me/cards") : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return { me, setMe, cards, setCards, error, reload };
}

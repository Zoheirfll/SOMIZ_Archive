import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

// Intervalle du polling du compteur (voir docs/fonctionnel/notifications.md).
export const NOTIFICATIONS_POLL_MS = 45000;

/**
 * Notifications in-app : compteur de non-lues interrogé périodiquement
 * (pause quand l'onglet est caché, rafraîchissement immédiat au retour) et
 * liste chargée à la demande. Tous les rafraîchissements sont silencieux
 * (pas d'état `loading` qui démonte le panneau) pour ne pas perdre le scroll.
 */
export default function useNotifications(enabled = true) {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const fetchCount = useCallback(async () => {
    try {
      const res = await api.get("/notifications/compteur/");
      const n = Number(res.data?.non_lues);
      if (mounted.current) setCount(Number.isFinite(n) ? n : 0);
    } catch {
      // Silencieux : un échec ponctuel du polling ne doit pas gêner l'utilisateur.
    }
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const res = await api.get("/notifications/");
      const rows = res.data?.results ?? res.data ?? [];
      if (mounted.current) {
        setItems(Array.isArray(rows) ? rows.slice(0, 20) : []);
        setLoaded(true);
      }
    } catch {
      // idem
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchCount();
    const tick = () => {
      if (document.visibilityState !== "hidden") fetchCount();
    };
    const id = setInterval(tick, NOTIFICATIONS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, fetchCount]);

  const markRead = useCallback(async (id) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: now } : n)));
    try {
      await api.post(`/notifications/${id}/lue/`);
    } finally {
      fetchCount();
    }
  }, [fetchCount]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setCount(0);
    try {
      await api.post("/notifications/tout-lire/");
    } finally {
      fetchCount();
    }
  }, [fetchCount]);

  return { count, items, loaded, fetchItems, fetchCount, markRead, markAllRead };
}

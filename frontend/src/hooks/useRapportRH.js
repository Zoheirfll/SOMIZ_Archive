// frontend/src/hooks/useRapportRH.js
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";

// Une page du reporting RH. `refresh(partiel)` recharge SANS démonter la page
// (pas de passage par loading=true) : scroll et sélection conservés.
export default function useRapportRH(page, initialParams) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [params, setParams] = useState(initialParams);
  const initial = useRef(initialParams);

  const charger = useCallback(async (p, silencieux) => {
    if (!silencieux) setLoading(true);
    setError("");
    try {
      const res = await api.get(`/reporting/rh/${page}/`, { params: p });
      setData(res.data);
    } catch {
      setError("Impossible de charger ce rapport.");
    } finally {
      if (!silencieux) setLoading(false);
    }
  }, [page]);

  useEffect(() => { charger(initial.current, false); }, [charger]);

  const refresh = (partiel) => {
    const next = { ...params, ...partiel };
    setParams(next);
    charger(next, true);
  };

  return { data, loading, error, params, refresh };
}

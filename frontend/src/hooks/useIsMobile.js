import { useEffect, useState } from "react";

/**
 * Hook responsive pour les mises en page inline-style (pas de media queries
 * CSS possibles dans style={{}}). Utilisé pour les changements structurels
 * (drawer mobile, empilement vertical, réduction de padding) plutôt que du
 * pur cosmétique — voir CLAUDE.md, section mobile.
 *
 * Seuil unique 768px pour toute l'app, cohérent avec le viewport meta déjà
 * en place dans public/index.html.
 */
export const MOBILE_BREAKPOINT = 768;

export default function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const getMatch = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState(getMatch);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Safari legacy fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [breakpoint]);

  return isMobile;
}

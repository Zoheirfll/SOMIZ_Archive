// frontend/src/components/MenuLien.jsx
import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";

// Menu du clic droit sur une ligne / carte qui mène à une page (2026-11-01).
// Un <tr>/<div> ne peut pas être un lien natif : `useLienLigne` demande ici
// l'ouverture de ce petit menu à la place du menu du navigateur. Monté une
// seule fois (App.js). Voir hooks/useLienLigne.js.
const EVENEMENT = "somiz:menu-lien";

export const ouvrirMenuLien = (x, y, url) =>
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: { x, y, url } }));

// Aides pour les zones de dessin (graphiques) qui ne peuvent pas être des <a> :
// Ctrl/Cmd/molette → nouvel onglet ; clic droit → le menu ci-dessous.
export const ouvreAilleurs = (e) => !!e && (e.ctrlKey || e.metaKey || e.shiftKey);
export const menuClicDroit = (e, url) => {
  if (!e || !url) return;
  e.preventDefault?.();
  ouvrirMenuLien(e.clientX, e.clientY, url);
};

export default function MenuLien() {
  const theme = useTheme();
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    const ouvrir = (e) => setMenu(e.detail);
    const fermer = () => setMenu(null);
    const echap = (e) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener(EVENEMENT, ouvrir);
    window.addEventListener("click", fermer);
    window.addEventListener("scroll", fermer, true);
    window.addEventListener("resize", fermer);
    window.addEventListener("keydown", echap);
    return () => {
      window.removeEventListener(EVENEMENT, ouvrir);
      window.removeEventListener("click", fermer);
      window.removeEventListener("scroll", fermer, true);
      window.removeEventListener("resize", fermer);
      window.removeEventListener("keydown", echap);
    };
  }, []);

  if (!menu) return null;
  const absolue = new URL(menu.url, window.location.origin).href;
  const item = {
    display: "block", width: "100%", textAlign: "left", background: "none", border: "none",
    padding: "8px 14px", fontSize: 13, color: theme.text, cursor: "pointer", fontFamily: theme.fontFamily,
  };
  return (
    <div
      role="menu"
      style={{
        position: "fixed", top: Math.min(menu.y, window.innerHeight - 90), left: Math.min(menu.x, window.innerWidth - 230),
        zIndex: 3000, minWidth: 210, background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 10, boxShadow: theme.shadowXl, padding: "4px 0",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button role="menuitem" style={item} onClick={() => window.open(menu.url, "_blank", "noopener")}>
        Ouvrir dans un nouvel onglet
      </button>
      <button role="menuitem" style={item} onClick={() => navigator.clipboard?.writeText(absolue)}>
        Copier le lien
      </button>
    </div>
  );
}

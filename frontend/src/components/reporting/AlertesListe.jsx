// frontend/src/components/reporting/AlertesListe.jsx
import { useTheme } from "../../context/ThemeContext";
import LienNav from "../LienNav";

export default function AlertesListe({ alertes }) {
  const theme = useTheme();
  if (!alertes || alertes.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune alerte.</div>;
  }
  const couleurs = {
    danger: { fond: theme.dangerBg, bord: theme.dangerBorder, texte: theme.danger },
    attention: { fond: theme.accentBg, bord: theme.accentBorder, texte: theme.warning },
    info: { fond: theme.bg, bord: theme.border, texte: theme.textSecondary },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {alertes.map((a) => {
        const c = couleurs[a.niveau] || couleurs.info;
        return (
          <LienNav
            key={a.texte}
            to={a.lien}
            style={{ display: "block", textAlign: "left", background: c.fond, border: `1px solid ${c.bord}`, color: c.texte, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: theme.fontFamily }}
          >
            {a.texte} →
          </LienNav>
        );
      })}
    </div>
  );
}

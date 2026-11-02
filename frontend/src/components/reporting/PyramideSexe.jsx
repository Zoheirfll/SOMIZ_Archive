// frontend/src/components/reporting/PyramideSexe.jsx
import { useTheme } from "../../context/ThemeContext";

// Pyramide des âges : hommes à gauche, femmes à droite (lignes {tranche, hommes, femmes}).
export default function PyramideSexe({ lignes }) {
  const theme = useTheme();
  const max = Math.max(1, ...lignes.flatMap((l) => [l.hommes, l.femmes]));
  const barre = (n, couleur, cote) => (
    <div style={{ flex: 1, display: "flex", justifyContent: cote === "gauche" ? "flex-end" : "flex-start", alignItems: "center", gap: 6 }}>
      {cote === "gauche" && <span style={{ fontSize: 11, color: theme.textSecondary }}>{n}</span>}
      <div style={{ width: `${(n / max) * 100}%`, minWidth: n ? 3 : 0, height: 16, background: couleur, borderRadius: 4 }} />
      {cote === "droite" && <span style={{ fontSize: 11, color: theme.textSecondary }}>{n}</span>}
    </div>
  );
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        <span style={{ color: theme.sexeHommeColor }}>Hommes</span>
        <span style={{ color: theme.sexeFemmeColor }}>Femmes</span>
      </div>
      {[...lignes].reverse().map((l) => (
        <div key={l.tranche} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {barre(l.hommes, theme.sexeHommeColor, "gauche")}
          <span style={{ width: 52, textAlign: "center", fontSize: 12, color: theme.text }}>{l.tranche}</span>
          {barre(l.femmes, theme.sexeFemmeColor, "droite")}
        </div>
      ))}
    </div>
  );
}

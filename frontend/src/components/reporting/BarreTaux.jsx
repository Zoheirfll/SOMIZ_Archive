// frontend/src/components/reporting/BarreTaux.jsx
import { useTheme } from "../../context/ThemeContext";

export default function BarreTaux({ libelle, sous, taux, onClick }) {
  const theme = useTheme();
  const couleur = taux >= 80 ? theme.primary : taux >= 50 ? theme.accent : theme.danger;
  return (
    <div onClick={onClick} style={{ marginBottom: 12, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: theme.text }}>
          {libelle}
          {sous && <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>({sous})</span>}
        </span>
        <span style={{ color: theme.textSecondary, fontWeight: 700 }}>{taux}%</span>
      </div>
      <div style={{ background: theme.borderLight, borderRadius: 6, height: 8, overflow: "hidden", border: `1px solid ${theme.border}` }}>
        <div style={{ height: "100%", width: `${Math.max(taux, taux > 0 ? 2 : 0)}%`, background: couleur, borderRadius: 6, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

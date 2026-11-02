// frontend/src/components/reporting/KpiGrid.jsx
import { useTheme } from "../../context/ThemeContext";

const formater = (valeur, unite) => {
  if (valeur === null || valeur === undefined) return "—";
  return unite ? `${valeur} ${unite}` : `${valeur}`;
};

export default function KpiGrid({ kpis }) {
  const theme = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
      {kpis.map((k, i) => {
        const hasVar = k.variation_pct !== null && k.variation_pct !== undefined;
        return (
          <div
            key={k.code}
            className={`card-lift anim-slide-up delay-${Math.min(i + 1, 5)}`}
            style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: "18px 20px", boxShadow: theme.shadowMd }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8 }}>
              <span>{k.libelle}</span>
              <span
                title={k.definition}
                aria-label={`Définition : ${k.libelle}`}
                style={{ cursor: "help", color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: "50%", width: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, textTransform: "none" }}
              >
                i
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ color: theme.primary, fontSize: 28, fontWeight: 800 }}>{formater(k.valeur, k.unite)}</span>
              {k.cible !== null && k.cible !== undefined && (
                <span
                  title={k.atteint === false ? "Objectif non atteint" : "Objectif atteint"}
                  style={{ fontSize: 11, fontWeight: 700, color: k.atteint === false ? theme.danger : theme.primary }}
                >
                  cible {k.sens === "au_plus" ? "≤" : "≥"} {k.cible}
                </span>
              )}
              {hasVar && (
                <span style={{ color: k.variation_pct >= 0 ? theme.primary : theme.danger, fontSize: 13, fontWeight: 700 }}>
                  {k.variation_pct >= 0 ? "+" : ""}{k.variation_pct}%
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

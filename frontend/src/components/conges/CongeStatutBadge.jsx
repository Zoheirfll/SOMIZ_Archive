import { useTheme } from "../../context/ThemeContext";
import { libelleStatutConge } from "../../utils/conges";

// Mêmes statuts que StatutBadge des attestations + Annulée et Interrompue.
export default function CongeStatutBadge({ statut }) {
  const theme = useTheme();
  const META = {
    recue: { bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textSecondary },
    prete: { bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    recuperee: { bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    rejetee: { bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
    annulee: { bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
    interrompue: { bg: theme.badgeBg, color: theme.warning, dot: theme.warning },
  };
  const meta = META[statut] || { bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textMuted };
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "4px 12px 4px 8px", fontSize: 11, fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
      {libelleStatutConge(statut)}
    </span>
  );
}

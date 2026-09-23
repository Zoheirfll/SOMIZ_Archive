import { useTheme } from "../../context/ThemeContext";

export default function StatutBadge({ statut }) {
  const theme = useTheme();
  const STATUT_META = {
    recue: { label: "Reçue", bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textSecondary },
    prete: { label: "Prête", bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    recuperee: { label: "Récupérée", bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    rejetee: { label: "Rejetée", bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
  };
  const meta = STATUT_META[statut] || { label: statut, bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textMuted };
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "4px 12px 4px 8px", fontSize: 11, fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}

import { useTheme } from "../../context/ThemeContext";

export default function StatutConsultationBadge({ statut }) {
  const theme = useTheme();
  const META = {
    en_cours: { label: "En cours de validation", bg: theme.accentBg, color: theme.warning, dot: theme.accent },
    validee: { label: "Validée", bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    expiree: { label: "Expirée", bg: theme.badgeBg, color: theme.textSecondary, dot: theme.textMuted },
    rejetee: { label: "Rejetée", bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
    revoquee: { label: "Révoquée", bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
  };
  const meta = META[statut] || { label: statut, bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textMuted };
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

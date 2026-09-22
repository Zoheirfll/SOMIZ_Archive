import { useTheme } from "../../context/ThemeContext";

export default function StatutBadge({ statut }) {
  const theme = useTheme();
  const STATUT_META = {
    recue: { label: "Reçue", bg: theme.badgeBg, color: theme.badgeColor },
    imprimee: { label: "Imprimée", bg: theme.accentBg, color: theme.accent },
    signee: { label: "Signée", bg: theme.accentBg, color: theme.accent },
    prete: { label: "Prête", bg: theme.primaryBg, color: theme.primary },
    recuperee: { label: "Récupérée", bg: theme.primaryBg, color: theme.primary },
    rejetee: { label: "Rejetée", bg: theme.dangerBg, color: theme.danger },
  };
  const meta = STATUT_META[statut] || { label: statut, bg: theme.badgeBg, color: theme.badgeColor };
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "3px 10px", fontSize: 11, fontWeight: 700, display: "inline-block",
      }}
    >
      {meta.label}
    </span>
  );
}

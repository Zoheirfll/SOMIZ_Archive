import { useTheme } from "../../context/ThemeContext";

export const IMPORTANCES = [
  { value: "haute", label: "Haute" },
  { value: "moyenne", label: "Moyenne" },
  { value: "faible", label: "Faible" },
];

export default function ImportanceBadge({ importance }) {
  const theme = useTheme();
  const META = {
    haute: { label: "Haute", bg: theme.dangerBg, color: theme.danger },
    moyenne: { label: "Moyenne", bg: theme.badgeBg, color: theme.warning },
    faible: { label: "Faible", bg: theme.badgeBg, color: theme.textSecondary },
  };
  const meta = META[importance] || META.moyenne;
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

import { useTheme } from "../../context/ThemeContext";

// Tooltip Recharts stylé aux tokens du thème (surface/border), réutilisé par
// tous les graphiques de /statistiques.
const ChartTooltip = ({ active, payload, label }) => {
  const theme = useTheme();
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: "8px 12px",
        boxShadow: theme.shadowLg,
        fontFamily: theme.fontFamily,
        fontSize: 12,
      }}
    >
      {label !== undefined && (
        <div style={{ color: theme.textSecondary, fontWeight: 700, marginBottom: 4 }}>{label}</div>
      )}
      {payload.map((p) => (
        <div key={p.dataKey || p.name} style={{ display: "flex", alignItems: "center", gap: 6, color: theme.text }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.payload?.fill, display: "inline-block" }} />
          <span>{p.name}:</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default ChartTooltip;

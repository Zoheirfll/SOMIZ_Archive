import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useTheme } from "../../context/ThemeContext";
import ChartTooltip from "./ChartTooltip";
import { menuClicDroit, ouvreAilleurs } from "../MenuLien";

// Histogramme (barres) pour les pyramides âge/ancienneté — orientation
// horizontale (tranches en ordonnée) avec tooltip et dégradé de couleur.
const StatHistogram = ({ data, xKey, dataKey, color, height = 220, onBarClick, urlDe }) => {
  const theme = useTheme();
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Aucune donnée pour cette période.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: theme.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis dataKey={xKey} type="category" tick={{ fill: theme.textSecondary, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: theme.borderLight }} />
        <Bar
          dataKey={dataKey} name="Effectif" radius={[0, 6, 6, 0]} maxBarSize={22} isAnimationActive={true}
          onClick={onBarClick ? (entry, _i, e) => (urlDe && ouvreAilleurs(e) ? window.open(urlDe(entry), "_blank", "noopener") : onBarClick(entry)) : undefined}
          onContextMenu={urlDe ? (entry, _i, e) => menuClicDroit(e, urlDe(entry)) : undefined}
          style={{ cursor: onBarClick ? "pointer" : "default" }}
        >
          {data.map((entry) => (
            <Cell key={entry[xKey]} fill={color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default StatHistogram;

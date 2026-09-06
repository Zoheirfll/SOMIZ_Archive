import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";
import { useTheme } from "../../context/ThemeContext";
import ChartTooltip from "./ChartTooltip";

// Radar comparant le taux de complétude (%) entre unités (Direction/Département).
const StatRadarChart = ({ data, height = 280 }) => {
  const theme = useTheme();
  if (!data || data.length < 3) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Pas assez d'unités pour un radar (minimum 3).
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={theme.border} />
        <PolarAngleAxis dataKey="nom" tick={{ fill: theme.textSecondary, fontSize: 11 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: theme.textMuted, fontSize: 10 }} />
        <Radar name="Taux de complétude" dataKey="taux" stroke={theme.primary} fill={theme.primary} fillOpacity={0.35} />
        <Tooltip content={<ChartTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

export default StatRadarChart;

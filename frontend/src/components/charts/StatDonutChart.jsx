import { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { useTheme } from "../../context/ThemeContext";
import ChartTooltip from "./ChartTooltip";
import { colorAt } from "./chartColors";

// Un champ de recherche apparaît au-dessus de la légende dès qu'il y a de
// quoi filtrer — inutile pour un donut à une seule catégorie (ex. "Par
// Direction" avec 1 seule direction).
const SEARCH_THRESHOLD = 1;

// Légende maison, scrollable et à hauteur fixe (= hauteur du donut) — une
// vraie légende Recharts grandit avec le nombre d'entrées et de longs
// libellés (ex. "Par Fonction", 10+ catégories), ce qui déforme la carte par
// rapport à ses voisines dans la grille. Ici la carte garde toujours la même
// hauteur, quel que soit le nombre de catégories.
const DonutLegend = ({ data, theme, height, onSliceClick, matches }) => (
  <div
    style={{
      maxHeight: height, overflowY: "auto", fontSize: 12, color: theme.textSecondary,
      paddingRight: 4, flex: "0 0 45%",
    }}
  >
    {data.map((entry, index) => (
      matches(entry) && (
        <div
          key={entry.id || entry.nom}
          onClick={onSliceClick ? () => onSliceClick(entry) : undefined}
          title={`${entry.nom} (${entry.count})`}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "3px 0",
            cursor: onSliceClick ? "pointer" : "default",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: colorAt(theme, index), flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.nom}
          </span>
        </div>
      )
    ))}
  </div>
);

// Camembert (donut) pour une répartition {nom, count}[], avec total au centre.
const StatDonutChart = ({ data, onSliceClick, height = 240 }) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");

  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Aucune donnée.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const showSearch = data.length > SEARCH_THRESHOLD;
  const term = search.trim().toLowerCase();
  const matches = (entry) => !term || entry.nom.toLowerCase().includes(term);
  const nbMatches = data.filter(matches).length;

  return (
    <div>
      {showSearch && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 10,
            border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 10px",
            fontSize: 12, fontFamily: theme.fontFamily, color: theme.text, background: theme.bg,
          }}
        />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ position: "relative", flex: "1 1 55%", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="nom"
                innerRadius="58%"
                outerRadius="85%"
                paddingAngle={2}
                onClick={onSliceClick ? (entry) => onSliceClick(entry) : undefined}
                style={{ cursor: onSliceClick ? "pointer" : "default" }}
                isAnimationActive={true}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.id || entry.nom}
                    fill={colorAt(theme, index)}
                    fillOpacity={matches(entry) ? 1 : 0.15}
                    stroke={theme.surface}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              textAlign: "center", pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: theme.text }}>{total}</div>
            <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Total</div>
          </div>
        </div>
        {nbMatches === 0 ? (
          <div style={{ flex: "0 0 45%", color: theme.textMuted, fontSize: 12, textAlign: "center" }}>
            Aucun résultat.
          </div>
        ) : (
          <DonutLegend data={data} theme={theme} height={height} onSliceClick={onSliceClick} matches={matches} />
        )}
      </div>
    </div>
  );
};

export default StatDonutChart;

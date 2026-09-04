import { useTheme } from "../context/ThemeContext";

const StatBarChart = ({ data, xKey, series, orientation = "vertical", height = 200 }) => {
  const theme = useTheme();
  if (!data || data.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
        Aucune donnée pour cette période.
      </div>
    );
  }

  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));

  if (orientation === "horizontal") {
    return (
      <div>
        {data.map((d) => (
          <div key={d[xKey]} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 70, fontSize: 12, color: theme.textSecondary, flexShrink: 0 }}>{d[xKey]}</div>
            <div style={{ flex: 1, background: theme.borderLight, borderRadius: 6, height: 16, overflow: "hidden", border: `1px solid ${theme.border}` }}>
              <div
                data-testid="stat-bar"
                style={{
                  height: "100%",
                  width: `${(d[series[0].key] / max) * 100}%`,
                  background: series[0].color,
                  borderRadius: 6,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <div style={{ width: 30, fontSize: 12, color: theme.text, fontWeight: 700, textAlign: "right" }}>{d[series[0].key]}</div>
          </div>
        ))}
      </div>
    );
  }

  const barWidth = Math.max(16, Math.min(36, 480 / (data.length * series.length)));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height, borderBottom: `1px solid ${theme.border}`, padding: "0 4px" }}>
        {data.map((d) => (
          <div key={d[xKey]} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: height - 20 }}>
              {series.map((s) => (
                <div
                  key={s.key}
                  data-testid="stat-bar"
                  title={`${s.label}: ${d[s.key] || 0}`}
                  style={{
                    width: barWidth,
                    height: `${((d[s.key] || 0) / max) * 100}%`,
                    background: s.color,
                    borderRadius: "4px 4px 0 0",
                    minHeight: (d[s.key] || 0) > 0 ? 2 : 0,
                    transition: "height 0.6s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 6 }}>{d[xKey]}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "center" }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.textSecondary }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StatBarChart;

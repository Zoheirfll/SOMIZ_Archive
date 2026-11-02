// frontend/src/components/reporting/Carte.jsx
import { useTheme } from "../../context/ThemeContext";

export default function Carte({ titre, action, children, style }) {
  const theme = useTheme();
  return (
    <section
      className="anim-fade-in"
      style={{
        background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16,
        padding: 24, boxShadow: theme.shadowMd, marginBottom: 20, minWidth: 0, ...style,
      }}
    >
      {(titre || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {titre && <h2 style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>{titre}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

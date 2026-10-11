import { useTheme } from "../../context/ThemeContext";

// Pied de tableau : nombre total de lignes et navigation par page. Les boutons
// n'apparaissent que s'il y a plusieurs pages.
export default function Pagination({ page, numPages, count, onChange }) {
  const theme = useTheme();
  const bouton = (actif) => ({
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.surface, color: actif ? theme.textSecondary : theme.textMuted,
    fontWeight: 700, fontSize: 12, cursor: actif ? "pointer" : "not-allowed",
    opacity: actif ? 1 : 0.5, fontFamily: theme.fontFamily,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, fontSize: 12, color: theme.textSecondary }}>
      <span>{count} ligne{count > 1 ? "s" : ""}</span>
      {numPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} style={bouton(page > 1)}>
            Précédent
          </button>
          <span>Page {page} sur {numPages}</span>
          <button type="button" disabled={page >= numPages} onClick={() => onChange(page + 1)} style={bouton(page < numPages)}>
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}

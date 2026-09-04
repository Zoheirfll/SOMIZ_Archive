import { useTheme } from "../../context/ThemeContext";

export const getScopeLabelStyle = (theme) => ({
  color: theme.textSecondary,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  display: "block",
  marginBottom: 6,
});

// Une section "niveau" du périmètre organisationnel (Directions, Pôles,
// Départements... — voir CLAUDE.md section Scoping) : liste à cocher avec
// boutons Tout/Aucun. Partagée entre Users.jsx (formulaire de création,
// section "Périmètre d'accès (optionnel)") et UserPerimetre.jsx (édition du
// périmètre d'un compte existant) — même rendu strictement identique dans
// les deux, extrait ici pour ne pas le dupliquer.
const ScopeLevel = ({
  level,
  label,
  items,
  scopeForm,
  onToggle,
  onSelectAll,
  onClear,
  isChecked,
}) => {
  const theme = useTheme();
  const scopeLabelStyle = getScopeLabelStyle(theme);
  return (
  <div style={{ marginBottom: 16 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <label style={{ ...scopeLabelStyle, marginBottom: 0 }}>{label}</label>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => onSelectAll(level, items)}
          style={{
            background: "none",
            border: "none",
            color: theme.primary,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Tout
        </button>
        <button
          type="button"
          onClick={() => onClear(level)}
          style={{
            background: "none",
            border: "none",
            color: theme.textMuted,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          Aucun
        </button>
      </div>
    </div>
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        maxHeight: 160,
        overflowY: "auto",
        padding: "8px 12px",
        background: theme.bg,
      }}
    >
      {items.length === 0 ? (
        <div style={{ color: theme.textMuted, fontSize: 12, padding: "4px 0" }}>
          Aucun élément.
        </div>
      ) : (
        items.map((item) => (
          <label
            key={item.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: `4px 0 4px ${item.parent_nom ? 20 : 0}px`,
              fontSize: 13,
              color: theme.text,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={isChecked ? isChecked(item) : scopeForm[level].includes(item.id)}
              onChange={() => onToggle(item.id)}
            />
            {item.parent_nom && (
              <span style={{ color: theme.textMuted, fontSize: 12 }}>↳</span>
            )}
            {!item.parent_nom && item.is_categorie && <span title="Catégorie">📁</span>}
            <span style={item.is_categorie ? { fontWeight: 700 } : undefined}>
              {item.nom}
            </span>
          </label>
        ))
      )}
    </div>
  </div>
  );
};

export default ScopeLevel;

import { useTheme } from "../../context/ThemeContext";
import { TrashIcon, PencilIcon } from "../icons";
import Skeleton from "../Skeleton";

// Tableau générique réutilisé par tous les onglets référentiels de
// Parametres.jsx — colonnes/rendu passés en props, aucune logique métier ici.
const RefTable = ({
  items,
  columns,
  onEdit,
  onDelete,
  onRenameSystem,
  loading,
  isAdmin,
  sortConfig,
  onSort,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const theme = useTheme();
  const selectableItems = items.filter((i) => !i.system);
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((i) => selectedIds?.has(i.id));
  return (
    <div
      style={{
        background: theme.surface,
        border: `1px solid ${theme.primaryBorder}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: theme.shadow,
      }}
    >
      {loading ? (
        <div style={{ padding: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "12px 0",
              }}
            >
              <Skeleton width={32} height={32} radius={16} />
              <Skeleton width="40%" height={14} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 40,
          }}
        >
          Aucun élément. Cliquez sur "Ajouter" pour commencer.
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: theme.primaryBg }}>
                {isAdmin && onToggleSelectAll && (
                  <th
                    style={{
                      padding: "11px 12px",
                      borderBottom: `2px solid ${theme.primaryBorder}`,
                      width: 36,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => onToggleSelectAll(selectableItems)}
                      aria-label="Tout sélectionner"
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={
                      c.sortable === false || !onSort
                        ? undefined
                        : () => onSort(c.key)
                    }
                    style={{
                      padding: "11px 16px",
                      textAlign: "left",
                      color: theme.primary,
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: `2px solid ${theme.primaryBorder}`,
                      cursor:
                        c.sortable === false || !onSort ? "default" : "pointer",
                      userSelect: "none",
                    }}
                  >
                    {c.label}
                    {onSort &&
                      c.sortable !== false &&
                      sortConfig?.key === c.key && (
                        <span style={{ marginLeft: 4 }}>
                          {sortConfig.dir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                  </th>
                ))}
                {isAdmin && (
                  <th
                    style={{
                      padding: "11px 16px",
                      borderBottom: `2px solid ${theme.primaryBorder}`,
                      color: theme.primary,
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      width: 120,
                    }}
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  className="table-row-hover"
                  style={{
                    borderBottom: `1px solid ${theme.primaryBorder}`,
                    background: item.system
                      ? theme.borderLight
                      : item.is_categorie
                        ? theme.accentBg
                        : item.parent_nom
                          ? theme.surfaceHover
                          : idx % 2 === 0
                            ? theme.surface
                            : theme.surfaceHover,
                  }}
                >
                  {isAdmin && onToggleSelect && (
                    <td style={{ padding: "11px 12px" }}>
                      {!item.system && (
                        <input
                          type="checkbox"
                          checked={!!selectedIds?.has(item.id)}
                          onChange={() => onToggleSelect(item.id)}
                          aria-label={`Sélectionner ${item.nom}`}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{
                        padding: "11px 16px",
                        color: c.primary ? theme.primary : theme.text,
                        fontSize: 13,
                        fontFamily: c.mono ? "monospace" : "inherit",
                        fontWeight: c.bold ? 600 : 400,
                      }}
                    >
                      {c.render ? c.render(item) : item[c.key] || "—"}
                    </td>
                  ))}
                  {isAdmin && (
                    <td style={{ padding: "11px 16px" }}>
                      {item.system ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            title="Champ système — structure verrouillée pour préserver le fonctionnement de l'application"
                            style={{
                              color: theme.textMuted,
                              fontSize: 11,
                              fontStyle: "italic",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            🔒 Système
                          </span>
                          {onRenameSystem && (
                            <button
                              onClick={() => onRenameSystem(item)}
                              title="Renommer le libellé affiché (n'affecte pas la structure)"
                              aria-label="Renommer"
                              style={{
                                background: theme.primaryBg,
                                border: `1px solid ${theme.primaryBorder}`,
                                color: theme.primary,
                                borderRadius: 6,
                                padding: "4px 8px",
                                display: "flex",
                                cursor: "pointer",
                              }}
                            >
                              <PencilIcon size={12} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => onEdit(item)}
                            title="Modifier"
                            aria-label="Modifier"
                            style={{
                              background: theme.primaryBg,
                              border: `1px solid ${theme.primaryBorder}`,
                              color: theme.primary,
                              borderRadius: 6,
                              padding: "4px 10px",
                              display: "flex",
                              cursor: "pointer",
                            }}
                          >
                            <PencilIcon size={13} />
                          </button>
                          <button
                            onClick={() => onDelete(item)}
                            title="Supprimer"
                            aria-label="Supprimer"
                            style={{
                              background: theme.dangerBg,
                              border: `1px solid ${theme.dangerBorder}`,
                              color: theme.danger,
                              borderRadius: 6,
                              padding: "4px 10px",
                              display: "flex",
                              cursor: "pointer",
                            }}
                          >
                            <TrashIcon size={13} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RefTable;

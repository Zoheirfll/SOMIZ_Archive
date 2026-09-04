import { useTheme } from "../../context/ThemeContext";
import Skeleton from "../Skeleton";
import EmployeeAvatar from "../EmployeeAvatar";
import { employeeSlug } from "../../utils/employeeSlug";
import { IconService, IconUsers } from "./icons";

// Filtres + tableau des employés (colonnes configurables, tri, pagination,
// actions en masse) — extrait de Employees.jsx pour garder la page
// principale sous les 1000 lignes. Aucun état local : entièrement piloté
// par les props de la page parente (recherche, tri, pagination, sélection).
const EmployeesTable = ({
  employees,
  loading,
  selected,
  setSelected,
  someSelected,
  allSelected,
  statut,
  setStatut,
  ordering,
  setOrdering,
  page,
  setPage,
  totalPages,
  totalCount,
  search,
  searchInput,
  setSearchInput,
  colsMenuOpen,
  setColsMenuOpen,
  orgFilter,
  setOrgFilter,
  selectedService,
  vue,
  deleting,
  customFields,
  isColumnVisible,
  dossierComplet,
  typeManquant,
  typeManquantLabel,
  isMobile,
  user,
  setAllColumns,
  toggleColumn,
  toggleSelect,
  toggleSelectAll,
  clearCompletudeFilter,
  goToAllEmployees,
  handleBulkAction,
  handleExportAll,
  handleTableSearchSubmit,
  navigate,
  PAGE_SIZE,
  COLUMN_OPTIONS,
  setArchiveMotif,
  setArchiveModalOpen,
}) => {
  const theme = useTheme();
  return (
    <div className="anim-fade-in">
      {/* Bannière filtre service actif */}
      {selectedService && (
        <div
          style={{
            background: theme.serviceColor + "0D",
            border: `1px solid ${theme.serviceColor}25`,
            borderRadius: 12,
            padding: "12px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: theme.serviceColor, display: "flex" }}>
              <IconService size={16} />
            </div>
            <span
              style={{
                color: theme.serviceColor,
                fontWeight: 600,
                fontSize: 13,
                fontFamily: theme.fontFamily,
              }}
            >
              Filtré par service : <strong>{selectedService.nom}</strong>
            </span>
          </div>
          <button
            onClick={goToAllEmployees}
            style={{
              background: "none",
              border: `1px solid ${theme.serviceColor}30`,
              color: theme.serviceColor,
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retirer le filtre
          </button>
        </div>
      )}

      {/* Bannière filtre Pôle/Cellule (arrivée depuis l'Organigramme) */}
      {orgFilter && (
        <div
          style={{
            background: "#b4530915",
            border: "1px solid #FDE68A",
            borderRadius: 12,
            padding: "12px 20px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              color: "#b45309",
              fontWeight: 600,
              fontSize: 13,
              fontFamily: theme.fontFamily,
            }}
          >
            Filtré par {orgFilter.type === "pole" ? "pôle" : orgFilter.type === "section" ? "section" : "cellule"} :{" "}
            <strong>{orgFilter.nom}</strong>
          </span>
          <button
            onClick={() => setOrgFilter(null)}
            style={{
              background: "none",
              border: "1px solid #FDE68A",
              color: "#b45309",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Retirer le filtre
          </button>
        </div>
      )}

      {/* Filtres */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          boxShadow: theme.shadow,
        }}
      >
        <form
          onSubmit={handleTableSearchSubmit}
          style={{ flex: isMobile ? "1 1 100%" : 1, display: "flex", gap: 8 }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: theme.textMuted,
                pointerEvents: "none",
                display: "flex",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Rechercher par nom, prénom, matricule..."
              className="input-focus"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: `1.5px solid ${theme.border}`,
                borderRadius: 10,
                padding: "10px 14px 10px 40px",
                color: theme.text,
                fontSize: 14,
                outline: "none",
                background: theme.bg,
                fontFamily: theme.fontFamily,
              }}
            />
          </div>
          <button
            type="submit"
            className="btn-lift"
            style={{
              background: theme.primary,
              border: "none",
              borderRadius: 10,
              padding: "10px 20px",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
              whiteSpace: "nowrap",
            }}
          >
            Rechercher
          </button>
        </form>
        {vue === "archives" && (
          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value)}
            className="input-focus"
            style={{
              border: `1.5px solid ${theme.border}`,
              borderRadius: 10,
              padding: "10px 14px",
              color: theme.text,
              fontSize: 14,
              outline: "none",
              background: theme.bg,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
            }}
          >
            <option value="">Tous (Inactif/Archivé/Démobilisé)</option>
            <option value="inactif">Inactif</option>
            <option value="archive">Archivé</option>
            <option value="demobilise">Démobilisé</option>
          </select>
        )}
        {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
          <button
            type="button"
            onClick={handleExportAll}
            className="btn-lift"
            style={{
              border: `1.5px solid ${theme.border}`,
              borderRadius: 10,
              padding: "10px 16px",
              color: theme.text,
              fontSize: 13,
              fontWeight: 600,
              background: theme.surface,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
              whiteSpace: "nowrap",
            }}
          >
            Exporter
          </button>
        )}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setColsMenuOpen((o) => !o)}
            className="btn-lift"
            style={{
              border: `1.5px solid ${theme.border}`,
              borderRadius: 10,
              padding: "10px 16px",
              color: theme.text,
              fontSize: 13,
              fontWeight: 600,
              background: theme.surface,
              cursor: "pointer",
              fontFamily: theme.fontFamily,
              whiteSpace: "nowrap",
            }}
          >
            Colonnes {colsMenuOpen ? "▲" : "▼"}
          </button>
          {colsMenuOpen && (
            <>
              <div
                onClick={() => setColsMenuOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
              />
              <div
                className="anim-scale-in"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: theme.surface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  boxShadow: theme.shadowMd,
                  padding: 10,
                  zIndex: 11,
                  minWidth: 200,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "2px 8px 8px",
                  }}
                >
                  <span
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Colonnes affichées
                  </span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setAllColumns(true)}
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
                      onClick={() => setAllColumns(false)}
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
                    maxHeight: 220,
                    overflowY: "auto",
                    padding: "4px 8px",
                    background: theme.bg,
                  }}
                >
                  {COLUMN_OPTIONS.map((c) => (
                    <label
                      key={c.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 4px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 13,
                        color: theme.text,
                        fontFamily: theme.fontFamily,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isColumnVisible(c.key)}
                        onChange={() => toggleColumn(c.key)}
                        style={{
                          cursor: "pointer",
                          accentColor: theme.primary,
                        }}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chip filtre complétude (arrivée depuis le dashboard) */}
      {(dossierComplet !== null || typeManquant) && (
        <div
          className="anim-slide-down"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: theme.primaryBg,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 20,
            padding: "6px 8px 6px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: theme.primary,
            fontWeight: 600,
            fontFamily: theme.fontFamily,
          }}
        >
          {typeManquant
            ? `Manque : ${typeManquantLabel || "…"}`
            : dossierComplet === "true"
              ? "Dossiers complets"
              : "Dossiers incomplets"}
          <button
            type="button"
            onClick={clearCompletudeFilter}
            style={{
              background: "none",
              border: "none",
              color: theme.primary,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: "2px 4px",
            }}
            aria-label="Effacer le filtre"
          >
            ✕
          </button>
        </div>
      )}

      {/* Barre actions bulk */}
      {someSelected && ["ADMIN", "SUPERADMIN"].includes(user?.role) && (
        <div
          className="anim-slide-down"
          style={{
            background: theme.primaryBg,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: "12px 20px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxShadow: theme.shadow,
          }}
        >
          <span
            style={{
              color: theme.primary,
              fontWeight: 600,
              fontSize: 14,
              fontFamily: theme.fontFamily,
            }}
          >
            {selected.size} employé(s) sélectionné(s)
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setSelected(new Set())}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: theme.fontFamily,
              }}
            >
              Désélectionner
            </button>
            {vue === "archives" ? (
              <button
                onClick={() => handleBulkAction("restaurer")}
                disabled={deleting}
                style={{
                  background: theme.primaryBg,
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.primary,
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                Restaurer ({selected.size})
              </button>
            ) : (
              <button
                onClick={() => {
                  setArchiveMotif("");
                  setArchiveModalOpen(true);
                }}
                disabled={deleting}
                style={{
                  background: "#FFFBEB",
                  border: `1px solid #FDE68A`,
                  color: "#92400E",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                Archiver ({selected.size})
              </button>
            )}
            {vue === "archives" && (
              <button
                onClick={() => handleBulkAction("delete")}
                disabled={deleting}
                style={{
                  background: theme.danger,
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: theme.fontFamily,
                }}
              >
                Supprimer définitivement ({selected.size})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: theme.shadowMd,
        }}
      >
        {loading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: "14px 0",
                }}
              >
                <Skeleton width={36} height={36} radius={18} />
                <div style={{ flex: 1 }}>
                  <Skeleton
                    width="30%"
                    height={13}
                    style={{ marginBottom: 6 }}
                  />
                  <Skeleton width="50%" height={11} />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div
            style={{ padding: 80, textAlign: "center", color: theme.textMuted }}
          >
            <div style={{ marginBottom: 16, opacity: 0.35 }}>
              <IconUsers size={56} color={theme.textMuted} />
            </div>
            <div
              style={{
                fontFamily: theme.fontFamily,
                fontWeight: 700,
                fontSize: 16,
                color: theme.text,
                marginBottom: 6,
              }}
            >
              Aucun employé trouvé
            </div>
            <div style={{ fontFamily: theme.fontFamily, fontSize: 13 }}>
              {search
                ? "Essayez un autre terme de recherche."
                : "Ce service ne contient pas encore d'employés."}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: theme.fontFamily,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: theme.bg,
                    borderBottom: `2px solid ${theme.border}`,
                  }}
                >
                  {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                    <th style={{ padding: "13px 16px", width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        style={{
                          cursor: "pointer",
                          width: 15,
                          height: 15,
                          accentColor: theme.primary,
                        }}
                      />
                    </th>
                  )}
                  {[
                    { id: "avatar", label: "", key: null, col: null },
                    {
                      id: "matricule",
                      label: "Matricule",
                      key: "matricule",
                      col: null,
                    },
                    {
                      id: "numero_contrat",
                      label: "N° Contrat",
                      key: null,
                      col: "numero_contrat",
                    },
                    { id: "nom", label: "Nom & Prénom", key: "nom", col: null },
                    {
                      id: "date_naissance",
                      label: "Date de naissance",
                      key: "date_naissance",
                      col: "date_naissance",
                    },
                    {
                      id: "date_embauche",
                      label: "Date de recrutement",
                      key: "date_embauche",
                      col: "date_embauche",
                    },
                    {
                      id: "direction",
                      label: "Direction",
                      key: "direction__nom",
                      col: "direction",
                    },
                    {
                      id: "departement",
                      label: "Département",
                      key: "departement__nom",
                      col: "departement",
                    },
                    {
                      id: "service",
                      label: "Service",
                      key: "service__nom",
                      col: "service",
                    },
                    {
                      id: "poste",
                      label: "Fonction",
                      key: "poste__nom",
                      col: "poste",
                    },
                    {
                      id: "type_contrat",
                      label: "Type de contrat",
                      key: "type_contrat__nom",
                      col: "type_contrat",
                    },
                    {
                      id: "categorie",
                      label: "Catégorie",
                      key: null,
                      col: "categorie",
                    },
                    {
                      id: "statut",
                      label: "Statut",
                      key: "statut",
                      col: "statut",
                    },
                    {
                      id: "motif_archivage",
                      label: "Motif",
                      key: null,
                      col: "motif_archivage",
                    },
                    ...customFields.map((c) => ({
                      id: `custom_${c.code}`,
                      label: c.nom,
                      key: null,
                      col: `custom_${c.code}`,
                    })),
                    {
                      id: "dossier",
                      label: "Dossier",
                      key: null,
                      col: "dossier",
                    },
                    { id: "actions", label: "", key: null, col: null },
                  ]
                    .filter((h) => !h.col || isColumnVisible(h.col))
                    .map((h) => (
                      <th
                        key={h.id}
                        onClick={() => {
                          if (!h.key) return;
                          setOrdering((prev) =>
                            prev === h.key ? `-${h.key}` : h.key,
                          );
                        }}
                        style={{
                          padding: "13px 16px",
                          textAlign: "left",
                          color: theme.textSecondary,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                          cursor: h.key ? "pointer" : "default",
                          userSelect: "none",
                        }}
                      >
                        {h.label}
                        {h.key && (
                          <span
                            style={{
                              marginLeft: 4,
                              opacity:
                                ordering === h.key || ordering === `-${h.key}`
                                  ? 1
                                  : 0.3,
                              fontSize: 10,
                            }}
                          >
                            {ordering === `-${h.key}` ? "↓" : "↑"}
                          </span>
                        )}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => (
                  <tr
                    key={emp.id}
                    className="table-row-hover"
                    style={{
                      borderBottom: `1px solid ${theme.borderLight}`,
                      background: selected.has(emp.id)
                        ? theme.primaryBg
                        : idx % 2 === 0
                          ? theme.surface
                          : theme.surfaceHover,
                    }}
                  >
                    {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                      <td
                        style={{ padding: "13px 16px" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(emp.id);
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(emp.id)}
                          onChange={() => toggleSelect(emp.id)}
                          style={{
                            cursor: "pointer",
                            width: 15,
                            height: 15,
                            accentColor: theme.primary,
                          }}
                        />
                      </td>
                    )}
                    <td
                      onClick={() =>
                        navigate(`/employees/${employeeSlug(emp)}`)
                      }
                      style={{ padding: "13px 16px", cursor: "pointer" }}
                    >
                      <EmployeeAvatar
                        employee={emp}
                        size={48}
                        fontSize={16}
                        shape="square"
                      />
                    </td>
                    <td
                      onClick={() =>
                        navigate(`/employees/${employeeSlug(emp)}`)
                      }
                      style={{ padding: "13px 16px", cursor: "pointer" }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: 13,
                          color: theme.primary,
                          background: theme.primaryBg,
                          border: `1px solid ${theme.primaryBorder}`,
                          borderRadius: 6,
                          padding: "3px 8px",
                        }}
                      >
                        {emp.matricule}
                      </span>
                    </td>
                    {isColumnVisible("numero_contrat") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {emp.numero_contrat_actif ? (
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              fontSize: 12,
                              color: theme.departementColor,
                              background: theme.departementAccent || "#eff6ff",
                              border: "1px solid #bfdbfe",
                              borderRadius: 6,
                              padding: "3px 8px",
                            }}
                          >
                            {emp.numero_contrat_actif}
                          </span>
                        ) : (
                          <span
                            style={{ color: theme.textMuted, fontSize: 12 }}
                          >
                            —
                          </span>
                        )}
                      </td>
                    )}
                    <td
                      onClick={() =>
                        navigate(`/employees/${employeeSlug(emp)}`)
                      }
                      style={{
                        padding: "13px 16px",
                        color: theme.text,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                        fontSize: 14,
                      }}
                    >
                      {emp.nom} {emp.prenom}
                    </td>
                    {isColumnVisible("date_naissance") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {emp.date_naissance || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("date_embauche") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          whiteSpace: "nowrap",
                          cursor: "pointer",
                        }}
                      >
                        {emp.date_embauche || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("direction") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.direction_nom || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("departement") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.departement_nom || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("service") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.service_nom ||
                          (emp.cellule_nom ? (
                            `Cellule : ${emp.cellule_nom}`
                          ) : (
                            <span style={{ color: theme.textMuted }}>—</span>
                          ))}
                      </td>
                    )}
                    {isColumnVisible("poste") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.poste_nom || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("statut") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{ padding: "13px 16px", cursor: "pointer" }}
                      >
                        <span
                          style={{
                            background:
                              emp.statut === "actif"
                                ? theme.primaryBg
                                : emp.statut === "archive"
                                  ? "#F8FAFC"
                                  : theme.dangerBg,
                            color:
                              emp.statut === "actif"
                                ? theme.primary
                                : emp.statut === "archive"
                                  ? "#64748B"
                                  : theme.danger,
                            border: `1px solid ${emp.statut === "actif" ? theme.primaryBorder : emp.statut === "archive" ? theme.border : theme.dangerBorder}`,
                            borderRadius: 20,
                            padding: "3px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {emp.statut}
                        </span>
                      </td>
                    )}
                    {isColumnVisible("motif_archivage") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{
                          padding: "13px 16px",
                          color: theme.textSecondary,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {emp.motif_archivage_nom || (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    )}
                    {customFields
                      .filter((c) => isColumnVisible(`custom_${c.code}`))
                      .map((c) => (
                        <td
                          key={c.code}
                          onClick={() =>
                            navigate(`/employees/${employeeSlug(emp)}`)
                          }
                          style={{
                            padding: "13px 16px",
                            color: theme.textSecondary,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          {emp.champs_personnalises?.[c.code] || (
                            <span style={{ color: theme.textMuted }}>—</span>
                          )}
                        </td>
                      ))}
                    {isColumnVisible("dossier") && (
                      <td
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        style={{ padding: "13px 16px", cursor: "pointer" }}
                      >
                        <span
                          style={{
                            background: emp.dossier_complet
                              ? theme.primaryBg
                              : "#FFFBEB",
                            color: emp.dossier_complet
                              ? theme.primary
                              : "#92400E",
                            border: `1px solid ${emp.dossier_complet ? theme.primaryBorder : "#FDE68A"}`,
                            borderRadius: 20,
                            padding: "3px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {emp.dossier_complet
                            ? "✓ Complet"
                            : `${emp.taux_completude}%`}
                        </span>
                      </td>
                    )}
                    <td
                      style={{ padding: "13px 16px" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          navigate(`/employees/${employeeSlug(emp)}`)
                        }
                        className="btn-lift"
                        style={{
                          background: theme.primary,
                          border: "none",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: theme.fontFamily,
                        }}
                      >
                        Voir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 20px",
              borderTop: `1px solid ${theme.border}`,
              background: theme.bg,
              fontFamily: theme.fontFamily,
            }}
          >
            <div style={{ color: theme.textSecondary, fontSize: 13 }}>
              {(page - 1) * PAGE_SIZE + 1} —{" "}
              {Math.min(page * PAGE_SIZE, totalCount)} sur {totalCount}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[
                { label: "«", action: () => setPage(1), disabled: page === 1 },
                {
                  label: "‹ Précédent",
                  action: () => setPage((p) => Math.max(1, p - 1)),
                  disabled: page === 1,
                },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.action}
                  disabled={b.disabled}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                    cursor: b.disabled ? "not-allowed" : "pointer",
                    opacity: b.disabled ? 0.4 : 1,
                  }}
                >
                  {b.label}
                </button>
              ))}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 ||
                    p === totalPages ||
                    (p >= page - 2 && p <= page + 2),
                )
                .map((p, idx, arr) => (
                  <span key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && (
                      <span
                        style={{ color: theme.textMuted, padding: "0 4px" }}
                      >
                        …
                      </span>
                    )}
                    <button
                      onClick={() => setPage(p)}
                      style={{
                        background: p === page ? theme.primary : theme.surface,
                        border: `1.5px solid ${p === page ? theme.primary : theme.border}`,
                        color: p === page ? "#fff" : theme.textSecondary,
                        borderRadius: 8,
                        padding: "6px 11px",
                        fontSize: 13,
                        fontWeight: p === page ? 700 : 400,
                        cursor: "pointer",
                        minWidth: 36,
                      }}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              {[
                {
                  label: "Suivant ›",
                  action: () => setPage((p) => Math.min(totalPages, p + 1)),
                  disabled: page === totalPages,
                },
                {
                  label: "»",
                  action: () => setPage(totalPages),
                  disabled: page === totalPages,
                },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={b.action}
                  disabled={b.disabled}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    color: theme.textSecondary,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 13,
                    cursor: b.disabled ? "not-allowed" : "pointer",
                    opacity: b.disabled ? 0.4 : 1,
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                Aller à
              </span>
              <input
                type="number"
                min="1"
                max={totalPages}
                defaultValue={page}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = parseInt(e.target.value);
                    if (v >= 1 && v <= totalPages) setPage(v);
                  }
                }}
                className="input-focus"
                style={{
                  width: 56,
                  border: `1.5px solid ${theme.border}`,
                  borderRadius: 8,
                  padding: "6px 8px",
                  fontSize: 13,
                  color: theme.text,
                  background: theme.surface,
                  outline: "none",
                  textAlign: "center",
                  fontFamily: theme.fontFamily,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeesTable;

import { useTheme } from "../../context/ThemeContext";

// Onglet "Contrats" de la fiche employé (liste + formulaire d'ajout) —
// extrait de EmployeeDetail.jsx pour garder la page principale sous les
// 1000 lignes. Aucun état local : le formulaire d'ajout (newContrat/
// showNewContratForm) reste contrôlé par la page parente, partagé avec
// handleCreateContrat.
const ContratsTab = ({
  activeTab,
  employee,
  contrats,
  navigate,
  typesContrat,
  showNewContratForm,
  setShowNewContratForm,
  newContrat,
  setNewContrat,
  savingContrat,
  handleCreateContrat,
  user,
  isMobile,
}) => {
  const theme = useTheme();
  return activeTab === "contrats" && (
          <div
            className="tab-content"
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: theme.primaryBg,
              }}
            >
              <span
                style={{
                  color: theme.primary,
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Contrats de {employee.prenom} {employee.nom}
              </span>
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                <button
                  onClick={() => {
                    if (!showNewContratForm) {
                      setNewContrat({
                        numero_contrat: "",
                        type_contrat: "",
                        date_debut: employee?.date_embauche || "",
                        date_fin: "",
                        statut: "actif",
                        notes: "",
                      });
                    }
                    setShowNewContratForm(!showNewContratForm);
                  }}
                  style={{
                    background: theme.accent,
                    border: "none",
                    color: theme.text,
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Nouveau contrat
                </button>
              )}
            </div>

            {/* Formulaire nouveau contrat */}
            {showNewContratForm && (
              <form
                onSubmit={handleCreateContrat}
                style={{
                  padding: 20,
                  borderBottom: `1px solid ${theme.border}`,
                  background: "#FAFFFE",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                    gap: 12,
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <label
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      N° Contrat *
                    </label>
                    <input
                      required
                      value={newContrat.numero_contrat}
                      onChange={(e) =>
                        setNewContrat({
                          ...newContrat,
                          numero_contrat: e.target.value,
                        })
                      }
                      placeholder=""
                      className="input-focus"
                      style={{
                        width: "100%",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: theme.text,
                        background: theme.surface,
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      Type de contrat
                    </label>
                    <select
                      value={newContrat.type_contrat}
                      onChange={(e) =>
                        setNewContrat({
                          ...newContrat,
                          type_contrat: e.target.value,
                        })
                      }
                      className="input-focus"
                      style={{
                        width: "100%",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: theme.text,
                        background: theme.surface,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="">— Sélectionner —</option>
                      {typesContrat.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nom}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      Statut
                    </label>
                    <select
                      value={newContrat.statut}
                      onChange={(e) =>
                        setNewContrat({ ...newContrat, statut: e.target.value })
                      }
                      className="input-focus"
                      style={{
                        width: "100%",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: theme.text,
                        background: theme.surface,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="actif">Actif</option>
                      <option value="archive">Archivé</option>
                      <option value="demobilise">Démobilisé</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      Date début
                    </label>
                    <input
                      type="date"
                      value={newContrat.date_debut}
                      onChange={(e) =>
                        setNewContrat({
                          ...newContrat,
                          date_debut: e.target.value,
                        })
                      }
                      className="input-focus"
                      style={{
                        width: "100%",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: theme.text,
                        background: theme.surface,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        textTransform: "uppercase",
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      Date fin
                    </label>
                    <input
                      type="date"
                      value={newContrat.date_fin}
                      onChange={(e) =>
                        setNewContrat({
                          ...newContrat,
                          date_fin: e.target.value,
                        })
                      }
                      className="input-focus"
                      style={{
                        width: "100%",
                        border: `1px solid ${theme.border}`,
                        borderRadius: 6,
                        padding: "8px 10px",
                        fontSize: 13,
                        color: theme.text,
                        background: theme.surface,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Notes
                  </label>
                  <textarea
                    value={newContrat.notes}
                    onChange={(e) =>
                      setNewContrat({ ...newContrat, notes: e.target.value })
                    }
                    rows={2}
                    className="input-focus"
                    style={{
                      width: "100%",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: "8px 10px",
                      fontSize: 13,
                      color: theme.text,
                      background: theme.surface,
                      outline: "none",
                      boxSizing: "border-box",
                      resize: "vertical",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={savingContrat}
                    style={{
                      background: savingContrat
                        ? `${theme.primary}88`
                        : theme.primary,
                      border: "none",
                      color: "#fff",
                      borderRadius: 6,
                      padding: "8px 20px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: savingContrat ? "not-allowed" : "pointer",
                    }}
                  >
                    {savingContrat ? "Création..." : "Créer le contrat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewContratForm(false)}
                    style={{
                      background: "transparent",
                      border: `1px solid ${theme.border}`,
                      color: theme.textSecondary,
                      borderRadius: 6,
                      padding: "8px 16px",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}

            {/* Liste des contrats */}
            {contrats.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: "center",
                  color: theme.textMuted,
                  fontSize: 13,
                }}
              >
                Aucun contrat enregistré
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: theme.bg }}>
                    {[
                      "N° Contrat",
                      "Type",
                      "Date début",
                      "Date fin",
                      "Statut",
                      "Documents",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          textAlign: "left",
                          fontSize: 11,
                          color: theme.textMuted,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontWeight: 600,
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contrats.map((c) => {
                    const statutColors = {
                      actif:      { bg: theme.primaryBg, border: theme.border, color: theme.primary,  label: "Actif" },
                      archive:    { bg: "#F5F5F5",       border: "#BDBDBD",           color: "#616161",      label: "Archivé" },
                      demobilise: { bg: theme.dangerBg,  border: theme.dangerBorder,  color: theme.danger,   label: "Démobilisé" },
                    };
                    const sc = statutColors[c.statut] || statutColors.actif;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => navigate(`/contrats/${c.id}`)}
                        style={{
                          cursor: "pointer",
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = theme.primaryBg)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <td
                          style={{
                            padding: "12px 16px",
                            fontFamily: "monospace",
                            fontSize: 13,
                            color: theme.primary,
                            fontWeight: 700,
                          }}
                        >
                          {c.numero_contrat}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontSize: 13,
                            color: theme.text,
                          }}
                        >
                          {c.type_contrat_nom || "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontSize: 13,
                            color: theme.text,
                          }}
                        >
                          {c.date_debut || "—"}
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontSize: 13,
                            color: theme.text,
                          }}
                        >
                          {c.date_fin || "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span
                            style={{
                              background: sc.bg,
                              border: `1px solid ${sc.border}`,
                              color: sc.color,
                              borderRadius: 5,
                              padding: "3px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {sc.label}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "12px 16px",
                            fontSize: 13,
                            color: theme.textSecondary,
                          }}
                        >
                          {c.nb_documents} doc(s)
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ color: theme.primary, fontSize: 12 }}>
                            Voir →
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
};

export default ContratsTab;

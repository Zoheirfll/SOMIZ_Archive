import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";

// Onglet "Carrière" de la fiche employé (timelines Fonction/Catégorie/
// Échelle/Contrats + modale de gestion manuelle de l'historique) — extrait
// de EmployeeDetail.jsx pour garder la page principale sous les 1000
// lignes. managingAxe/newPeriode restent contrôlés par la page parente
// (partagés avec le fetch qui les référence).
const CarriereTab = ({
  activeTab,
  employee,
  user,
  navigate,
  id,
  confirm,
  contrats,
  historiqueFonctions,
  historiqueCategories,
  historiqueEchelles,
  managingAxe,
  setManagingAxe,
  newPeriode,
  setNewPeriode,
  postes,
  categories,
  echelles,
  fetchHistorique,
}) => {
  const theme = useTheme();
  return (
  <>
    {activeTab === "carriere" && (
          <div
            className="tab-content"
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: 24,
            }}
          >
            {[
              {
                axe: "fonctions",
                title: "Fonction",
                data: historiqueFonctions,
                labelKey: "poste_nom",
                currentValue: employee.poste_nom,
              },
              {
                axe: "categories",
                title: "Catégorie",
                data: historiqueCategories,
                labelKey: "categorie_nom",
                currentValue: employee.categorie_nom,
              },
              {
                axe: "echelles",
                title: "Échelle",
                data: historiqueEchelles,
                labelKey: "echelle_nom",
                currentValue: null,
              },
            ].map((axe) => (
              <div key={axe.title} style={{ marginBottom: 28 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: theme.textSecondary,
                    marginBottom: 10,
                    borderLeft: `4px solid ${theme.primary}`,
                    paddingLeft: 8,
                  }}
                >
                  {axe.title}
                </div>
                {(() => {
                  const hasOpenPeriod = axe.data.some((p) => !p.date_fin);
                  if (hasOpenPeriod || !axe.currentValue) return null;
                  // Aucune période "en cours" (soit aucun historique du tout,
                  // soit uniquement des périodes déjà closes) — on affiche
                  // quand même la valeur actuelle connue de l'employé, avec
                  // comme date de départ soit la fin de la dernière période
                  // enregistrée, soit sa date de recrutement s'il n'y a
                  // aucun historique.
                  const dernierDateFin = axe.data.length
                    ? [...axe.data].sort(
                        (a, b) => new Date(b.date_fin || 0) - new Date(a.date_fin || 0),
                      )[0].date_fin
                    : null;
                  return (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 8,
                        marginBottom: 6,
                        background: theme.primaryBg,
                        border: `1px solid ${theme.primaryBorder}`,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>{axe.currentValue}</span>
                      <span style={{ fontSize: 12, color: theme.textSecondary }}>
                        {dernierDateFin || employee.date_embauche || "?"} → en cours
                      </span>
                    </div>
                  );
                })()}
                {axe.data.length === 0 && !axe.currentValue ? (
                  <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                    Aucun historique renseigné.
                  </div>
                ) : (
                  [...axe.data]
                    .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
                    .map((periode) => (
                      <div
                        key={periode.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: 8,
                          marginBottom: 6,
                          background: periode.date_fin ? theme.surface : theme.primaryBg,
                          border: `1px solid ${periode.date_fin ? theme.border : theme.primaryBorder}`,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>
                          {periode[axe.labelKey]}
                        </span>
                        <span style={{ fontSize: 12, color: theme.textSecondary }}>
                          {periode.date_debut} → {periode.date_fin || "en cours"}
                        </span>
                      </div>
                    ))
                )}
              </div>
            ))}

            {user?.role === "ADMIN" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                {[
                  { axe: "fonctions", label: "Gérer l'historique Fonction" },
                  { axe: "categories", label: "Gérer l'historique Catégorie" },
                  { axe: "echelles", label: "Gérer l'historique Échelle" },
                ].map((a) => (
                  <button
                    key={a.axe}
                    onClick={() => setManagingAxe(a.axe)}
                    className="btn-lift"
                    style={{
                      background: theme.surface,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: theme.textSecondary,
                  marginBottom: 10,
                  borderLeft: `4px solid ${theme.primary}`,
                  paddingLeft: 8,
                }}
              >
                Contrats
              </div>
              {contrats.length === 0 ? (
                <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                  Aucun contrat.
                </div>
              ) : (
                [...contrats]
                  .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
                  .map((c) => (
                    <div
                      key={c.id}
                      onClick={() => navigate(`/contrats/${c.id}`)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        borderRadius: 8,
                        marginBottom: 6,
                        background: theme.surface,
                        border: `1px solid ${theme.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>
                        {c.numero_contrat} — {c.type_contrat_nom || "—"}
                      </span>
                      <span style={{ fontSize: 12, color: theme.textSecondary }}>
                        {c.date_debut || "—"} → {c.date_fin || "en cours"}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
    )}

        {managingAxe && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={() => setManagingAxe(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: theme.surface,
                borderRadius: 12,
                padding: 24,
                width: 480,
                maxHeight: "80vh",
                overflowY: "auto",
              }}
            >
              <h3 style={{ margin: "0 0 16px", color: theme.text }}>
                Historique —{" "}
                {managingAxe === "fonctions"
                  ? "Fonction"
                  : managingAxe === "categories"
                  ? "Catégorie"
                  : "Échelle"}
              </h3>

              {(managingAxe === "fonctions"
                ? historiqueFonctions
                : managingAxe === "categories"
                ? historiqueCategories
                : historiqueEchelles
              ).map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <span style={{ fontSize: 13, color: theme.text }}>
                    {p.poste_nom || p.categorie_nom || p.echelle_nom} ({p.date_debut} →{" "}
                    {p.date_fin || "en cours"})
                  </span>
                  <button
                    onClick={async () => {
                      if (!(await confirm("Supprimer cette période ?"))) return;
                      await api.delete(`/historique/${managingAxe}/${p.id}/`);
                      fetchHistorique(true);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: theme.danger,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              ))}

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  Ajouter une période
                </div>
                <select
                  aria-label="Valeur"
                  value={newPeriode.valeur}
                  onChange={(e) =>
                    setNewPeriode({ ...newPeriode, valeur: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <option value="">-- Sélectionner --</option>
                  {(managingAxe === "fonctions"
                    ? postes
                    : managingAxe === "categories"
                    ? categories
                    : echelles
                  ).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nom}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Date début"
                  type="date"
                  value={newPeriode.date_debut}
                  onChange={(e) =>
                    setNewPeriode({ ...newPeriode, date_debut: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    marginBottom: 8,
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                  }}
                />
                <input
                  aria-label="Date fin"
                  type="date"
                  value={newPeriode.date_fin}
                  onChange={(e) =>
                    setNewPeriode({ ...newPeriode, date_fin: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: 8,
                    marginBottom: 12,
                    borderRadius: 6,
                    border: `1px solid ${theme.border}`,
                  }}
                />
                <button
                  onClick={async () => {
                    const fieldName =
                      managingAxe === "fonctions"
                        ? "poste"
                        : managingAxe === "categories"
                        ? "categorie"
                        : "echelle";
                    await api.post(`/employees/${id}/historique/${managingAxe}/`, {
                      [fieldName]: newPeriode.valeur,
                      date_debut: newPeriode.date_debut,
                      date_fin: newPeriode.date_fin || null,
                    });
                    setNewPeriode({ valeur: "", date_debut: "", date_fin: "" });
                    fetchHistorique(true);
                  }}
                  disabled={!newPeriode.valeur || !newPeriode.date_debut}
                  className="btn-lift"
                  style={{
                    background: theme.primary,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontWeight: 600,
                    cursor: "pointer",
                    width: "100%",
                  }}
                >
                  Ajouter une période
                </button>
              </div>

              <button
                onClick={() => setManagingAxe(null)}
                style={{
                  marginTop: 16,
                  background: "none",
                  border: "none",
                  color: theme.textSecondary,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        )}

        {/* Documents + Viewer */}
  </>
  );
};

export default CarriereTab;

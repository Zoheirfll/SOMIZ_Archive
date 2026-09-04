import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import InfoNotice from "../components/InfoNotice";
import { FIELD_NOTICES } from "../config/notices";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";
import useOrgScopeForm from "../hooks/useOrgScopeForm";
import ScopeLevel from "../components/userScope/ScopeLevel";

const getCardStyle = (theme) => ({
  background: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 16,
  padding: 24,
  marginBottom: 20,
  boxShadow: theme.shadowMd,
});

const UserPerimetre = () => {
  const theme = useTheme();
  const cardStyle = getCardStyle(theme);
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [targetUser, setTargetUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [savingScope, setSavingScope] = useState(false);

  const {
    directions,
    typesDocuments,
    champsPersonnels,
    scopeForm,
    setScopeForm,
    visiblePoles,
    visibleDepartements,
    visibleServices,
    visibleCellules,
    visibleSections,
    toggleDirection,
    togglePole,
    toggleDepartement,
    toggleService,
    toggleCellule,
    toggleSection,
    toggleTypeDocument,
    isTypeDocChecked,
    toggleChampPersonnel,
    selectAllInLevel,
    clearLevel,
  } = useOrgScopeForm();

  const [employeeGrants, setEmployeeGrants] = useState([]);
  const [grantSearch, setGrantSearch] = useState("");
  const [grantSearchResults, setGrantSearchResults] = useState([]);
  const [grantSearchLoading, setGrantSearchLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get(`/admin-users/${id}/`)
      .then((res) => {
        const u = res.data;
        setTargetUser(u);
        setScopeForm({
          directions: u.scope_directions || [],
          poles: u.scope_poles || [],
          departements: u.scope_departements || [],
          services: u.scope_services || [],
          cellules: u.scope_cellules || [],
          sections: u.scope_sections || [],
          types_documents: u.scope_types_documents || [],
          champs_personnels: u.scope_champs_personnels || [],
        });
      })
      .catch(() => setMessage({ type: "error", text: "Impossible de charger cet utilisateur." }))
      .finally(() => setLoading(false));

    api.get(`/admin-users/${id}/employee-grants/`)
      .then((res) => {
        const byEmployee = new Map();
        (res.data.grants || []).forEach((row) => {
          if (!byEmployee.has(row.employee)) {
            byEmployee.set(row.employee, {
              employee: row.employee,
              employee_nom: row.employee_nom,
              employee_prenom: row.employee_prenom,
              employee_matricule: row.employee_matricule,
              type_docs: [],
              champs_personnels: [],
            });
          }
          if (row.type_doc) byEmployee.get(row.employee).type_docs.push(row.type_doc);
          if (row.champ_personnel) byEmployee.get(row.employee).champs_personnels.push(row.champ_personnel);
        });
        setEmployeeGrants(Array.from(byEmployee.values()));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (grantSearch.trim().length < 2) {
      setGrantSearchResults([]);
      return;
    }
    setGrantSearchLoading(true);
    const timeout = setTimeout(() => {
      api.get(`/employees/search/?q=${encodeURIComponent(grantSearch.trim())}`)
        .then((res) => setGrantSearchResults(res.data || []))
        .catch(() => setGrantSearchResults([]))
        .finally(() => setGrantSearchLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [grantSearch]);

  const addEmployeeGrant = (employee) => {
    setEmployeeGrants((prev) => {
      if (prev.some((g) => g.employee === employee.id)) return prev;
      return [
        ...prev,
        {
          employee: employee.id,
          employee_nom: employee.nom,
          employee_prenom: employee.prenom,
          employee_matricule: employee.matricule,
          type_docs: [],
          champs_personnels: [],
        },
      ];
    });
    setGrantSearch("");
    setGrantSearchResults([]);
  };

  const removeEmployeeGrant = (employeeId) => {
    setEmployeeGrants((prev) => prev.filter((g) => g.employee !== employeeId));
  };

  const setGrantFullDossier = (employeeId) => {
    setEmployeeGrants((prev) =>
      prev.map((g) => (g.employee === employeeId ? { ...g, type_docs: [] } : g))
    );
  };

  const toggleGrantTypeDoc = (employeeId, typeDocId) => {
    setEmployeeGrants((prev) =>
      prev.map((g) => {
        if (g.employee !== employeeId) return g;
        const next = g.type_docs.includes(typeDocId)
          ? g.type_docs.filter((idv) => idv !== typeDocId)
          : [...g.type_docs, typeDocId];
        return { ...g, type_docs: next };
      })
    );
  };

  const toggleGrantChampPersonnel = (employeeId, champId) => {
    setEmployeeGrants((prev) =>
      prev.map((g) => {
        if (g.employee !== employeeId) return g;
        const next = g.champs_personnels.includes(champId)
          ? g.champs_personnels.filter((idv) => idv !== champId)
          : [...g.champs_personnels, champId];
        return { ...g, champs_personnels: next };
      })
    );
  };

  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await Promise.all([
        api.patch(`/admin-users/${id}/`, {
          scope_directions: scopeForm.directions,
          scope_poles: scopeForm.poles,
          scope_departements: scopeForm.departements,
          scope_services: scopeForm.services,
          scope_cellules: scopeForm.cellules,
          scope_sections: scopeForm.sections,
          scope_types_documents: scopeForm.types_documents,
          scope_champs_personnels: scopeForm.champs_personnels,
        }),
        api.put(`/admin-users/${id}/employee-grants/`, {
          grants: employeeGrants.flatMap((g) => [
            ...(g.type_docs.length === 0
              ? [{ employee: g.employee, type_doc: null }]
              : g.type_docs.map((typeDocId) => ({ employee: g.employee, type_doc: typeDocId }))),
            ...g.champs_personnels.map((champId) => ({ employee: g.employee, champ_personnel: champId })),
          ]),
        }),
      ]);
      navigate("/users", { state: { message: { type: "success", text: "Périmètre mis à jour." } } });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur lors de la mise à jour du périmètre." });
      setSavingScope(false);
    }
  };

  if (loading) {
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton width="40%" height={20} />
        </div>
      </PageBackground>
    );
  }

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 24px" : "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <button
            onClick={() => navigate("/users")}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 10, fontFamily: "inherit" }}
          >
            ← Utilisateurs
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Périmètre d'accès
            </h1>
            <InfoNotice text={FIELD_NOTICES.users.perimetre} />
          </div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
            Compte : <strong style={{ color: "#fff" }}>{targetUser?.username}</strong> — {targetUser?.prenom} {targetUser?.nom}
          </div>
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1200, margin: "0 auto" }}>
        {message && (
          <div style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Périmètre organisationnel</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
            Cocher une direction filtre les départements affichés à ceux qu'elle contient ; cocher un département filtre les services de la même façon. Aucune case cochée = aucun accès sur cette dimension — cochez au moins un élément, ou utilisez "Employés spécifiques" pour un accès ponctuel.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "0 24px" }}>
            {[
              { level: "directions", label: "Directions", items: directions, onToggle: toggleDirection },
              { level: "poles", label: "Pôles", items: visiblePoles, onToggle: togglePole },
              { level: "departements", label: "Départements", items: visibleDepartements, onToggle: toggleDepartement },
              { level: "services", label: "Services", items: visibleServices, onToggle: toggleService },
              { level: "cellules", label: "Cellules", items: visibleCellules, onToggle: toggleCellule },
              { level: "sections", label: "Sections", items: visibleSections, onToggle: toggleSection },
            ].map(({ level, label, items, onToggle }) => (
              <ScopeLevel key={level} level={level} label={label} items={items} scopeForm={scopeForm} onToggle={onToggle} onSelectAll={selectAllInLevel} onClear={clearLevel} />
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Types de documents</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
            Périmètre indépendant : restreint en plus les <strong>types de documents</strong> visibles (combiné en ET avec le périmètre organisationnel ci-dessus). Aucune case cochée = aucun type visible sur cet axe.
          </div>
          <ScopeLevel level="types_documents" label="Types de documents" items={typesDocuments} scopeForm={scopeForm} onToggle={toggleTypeDocument} onSelectAll={selectAllInLevel} onClear={clearLevel} isChecked={isTypeDocChecked} />
        </div>

        <div style={cardStyle}>
          <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Champs personnels</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
            Périmètre indépendant : restreint en plus les <strong>champs personnels</strong> visibles sur la fiche employé (combiné en ET avec le périmètre organisationnel ci-dessus). La colonne Administrative n'est jamais restreinte. Aucune case cochée = aucun champ personnel visible sur cet axe.
          </div>
          <ScopeLevel level="champs_personnels" label="Champs personnels" items={champsPersonnels} scopeForm={scopeForm} onToggle={toggleChampPersonnel} onSelectAll={selectAllInLevel} onClear={clearLevel} />
        </div>

        <div style={cardStyle}>
          <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Employés spécifiques</div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }}>
            Accès ponctuel à un employé précis, en plus (union) du périmètre ci-dessus — dossier complet (documents + contrats) ou un ou plusieurs types de documents. Les champs personnels sont indépendants du dossier complet : à cocher séparément, y compris quand le dossier complet est actif — aucune case cochée = aucun champ personnel visible pour cet employé. Les éléments déjà couverts par le périmètre global apparaissent cochés automatiquement.
          </div>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type="text"
              value={grantSearch}
              onChange={(e) => setGrantSearch(e.target.value)}
              placeholder="Rechercher un employé (nom, prénom, matricule, n° contrat)…"
              className="input-focus"
              style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${theme.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", color: theme.text }}
            />
            {grantSearch.trim().length >= 2 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, marginTop: 4, maxHeight: 180, overflowY: "auto", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
                {grantSearchLoading ? (
                  <div style={{ padding: 10, fontSize: 12, color: theme.textMuted }}>Recherche…</div>
                ) : grantSearchResults.length === 0 ? (
                  <div style={{ padding: 10, fontSize: 12, color: theme.textMuted }}>Aucun résultat.</div>
                ) : (
                  grantSearchResults.map((emp) => (
                    <div
                      key={emp.id}
                      onClick={() => addEmployeeGrant(emp)}
                      style={{ padding: "8px 12px", fontSize: 13, color: theme.text, cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {emp.prenom} {emp.nom} <span style={{ color: theme.textMuted }}>({emp.matricule})</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {employeeGrants.length > 0 && (
            <div style={{ display: isMobile ? "flex" : "grid", flexDirection: isMobile ? "column" : undefined, gridTemplateColumns: isMobile ? undefined : "1fr 1fr", gap: 8 }}>
              {employeeGrants.map((g) => (
                <div key={g.employee} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 12px", background: theme.bg }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                      {g.employee_prenom} {g.employee_nom} <span style={{ color: theme.textMuted, fontWeight: 400 }}>({g.employee_matricule})</span>
                    </span>
                    <button type="button" onClick={() => removeEmployeeGrant(g.employee)} style={{ background: "none", border: "none", color: theme.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                      Retirer
                    </button>
                  </div>
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, maxHeight: 130, overflowY: "auto", padding: "6px 8px", background: theme.surface }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, fontWeight: 700, color: theme.text, cursor: "pointer" }}>
                      <input type="checkbox" checked={g.type_docs.length === 0} onChange={() => setGrantFullDossier(g.employee)} />
                      Dossier complet
                    </label>
                    <div style={{ borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />
                    {typesDocuments.filter((t) => !t.is_categorie).map((t) => {
                      const coveredByGlobalScope = scopeForm.types_documents.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: coveredByGlobalScope ? theme.textMuted : theme.text, cursor: coveredByGlobalScope ? "default" : "pointer" }}
                        >
                          <input type="checkbox" checked={coveredByGlobalScope || g.type_docs.includes(t.id)} disabled={coveredByGlobalScope} onChange={() => toggleGrantTypeDoc(g.employee, t.id)} />
                          {t.parent_nom && <span style={{ color: theme.textMuted, fontSize: 11 }}>↳</span>}
                          {t.nom}
                          {coveredByGlobalScope && <span style={{ fontStyle: "italic" }}>(périmètre global)</span>}
                        </label>
                      );
                    })}
                  </div>
                  {champsPersonnels.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", margin: "8px 0 4px" }}>
                        Champs personnels
                      </div>
                      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 8, maxHeight: 130, overflowY: "auto", padding: "6px 8px", background: theme.surface }}>
                        {champsPersonnels.map((c) => {
                          const coveredByGlobalChampScope = scopeForm.champs_personnels.includes(c.id);
                          const checked = coveredByGlobalChampScope || g.champs_personnels.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: coveredByGlobalChampScope ? theme.textMuted : theme.text, cursor: coveredByGlobalChampScope ? "default" : "pointer" }}
                            >
                              <input type="checkbox" checked={checked} disabled={coveredByGlobalChampScope} onChange={() => toggleGrantChampPersonnel(g.employee, c.id)} />
                              {c.nom}
                              {coveredByGlobalChampScope && <span style={{ fontStyle: "italic" }}>(périmètre global)</span>}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingBottom: 40 }}>
          <button
            onClick={() => navigate("/users")}
            style={{ background: theme.surface, border: `1.5px solid ${theme.border}`, color: theme.textSecondary, borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Annuler
          </button>
          <button
            onClick={handleSaveScope}
            disabled={savingScope}
            style={{ background: savingScope ? `${theme.primary}88` : theme.primary, border: "none", color: "#fff", borderRadius: 10, padding: "9px 24px", fontSize: 13, fontWeight: 700, cursor: savingScope ? "not-allowed" : "pointer", fontFamily: "inherit" }}
          >
            {savingScope ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </PageBackground>
  );
};

export default UserPerimetre;

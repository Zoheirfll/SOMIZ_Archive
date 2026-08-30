import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import "../styles/animations.css";
import PageBackground from "../components/PageBackground";
import { useConfirm } from "../components/ConfirmDialog";
import useIsMobile from "../hooks/useIsMobile";

// Regroupe chaque catégorie de type de document (ex. "ETAT CIVIL") avec ses
// sous-types juste en dessous, comme dans /parametres — sinon la liste plate
// (triée par ordre brut) décroche les sous-types de leur catégorie.
const sortTypesDocumentsHierarchy = (list) => {
  const byId = new Map(list.map((t) => [t.id, t]));
  const children = new Map();
  list.forEach((t) => {
    if (t.parent && byId.has(t.parent)) {
      if (!children.has(t.parent)) children.set(t.parent, []);
      children.get(t.parent).push(t);
    }
  });
  children.forEach((arr) => arr.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)));
  const roots = list
    .filter((t) => !t.parent || !byId.has(t.parent))
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const ordered = [];
  roots.forEach((r) => {
    ordered.push(r);
    (children.get(r.id) || []).forEach((c) => ordered.push(c));
  });
  return ordered;
};

// SVG icons
const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconKey = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

const EyeIcon = ({ open }) => open ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const Users = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === "ADMIN";
  const { confirm, ConfirmDialog } = useConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    username: "",
    nom: "",
    prenom: "",
    role: "CONSULTANT",
    password: "",
    password2: "",
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetModal, setResetModal] = useState(null);
  const [resetForm, setResetForm] = useState({
    nouveau_mot_de_passe: "",
    confirmation: "",
  });
  const [resetting, setResetting] = useState(false);
  const [showResetMdp, setShowResetMdp] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Périmètre d'accès (scoping organisation-wide — sélection multiple à
  // chaque niveau, indépendamment : un employé est visible dès qu'il
  // correspond à au moins une direction/département/service choisi).
  const [scopeModal, setScopeModal] = useState(null);
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [services, setServices] = useState([]);
  const [cellules, setCellules] = useState([]);
  const [typesDocuments, setTypesDocuments] = useState([]);
  const [scopeForm, setScopeForm] = useState({ directions: [], poles: [], departements: [], services: [], cellules: [], types_documents: [] });
  const [savingScope, setSavingScope] = useState(false);

  // Périmètre "employés spécifiques" — grants ponctuels indépendants du
  // périmètre organisationnel (voir docs/superpowers/specs/2026-08-30-perimetre-employes-specifiques-design.md).
  const [employeeGrants, setEmployeeGrants] = useState([]); // [{employee, employee_nom, employee_prenom, employee_matricule, type_docs: []}]
  const [grantSearch, setGrantSearch] = useState("");
  const [grantSearchResults, setGrantSearchResults] = useState([]);
  const [grantSearchLoading, setGrantSearchLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    // ?all=1 — un compte ADMIN doit voir l'intégralité du référentiel pour
    // pouvoir attribuer n'importe quel périmètre, indépendamment de son
    // propre périmètre (toujours non restreint pour ADMIN, mais garde le
    // même paramètre que /organigramme par cohérence).
    api.get("/ref/directions/?all=1").then((res) => setDirections(res.data.results || res.data)).catch(() => {});
    api.get("/ref/poles/?all=1").then((res) => setPoles(res.data.results || res.data)).catch(() => {});
    api.get("/ref/departements/?all=1").then((res) => setDepartements(res.data.results || res.data)).catch(() => {});
    api.get("/ref/services/?all=1").then((res) => setServices(res.data.results || res.data)).catch(() => {});
    api.get("/ref/cellules/?all=1").then((res) => setCellules(res.data.results || res.data)).catch(() => {});
    api.get("/ref/types-documents/").then((res) => {
      setTypesDocuments(sortTypesDocumentsHierarchy(res.data.results || res.data));
    }).catch(() => {});
  }, []);

  const openScopeModal = (u) => {
    setScopeModal(u);
    setScopeForm({
      directions: u.scope_directions || [],
      poles: u.scope_poles || [],
      departements: u.scope_departements || [],
      services: u.scope_services || [],
      cellules: u.scope_cellules || [],
      types_documents: u.scope_types_documents || [],
    });
    setEmployeeGrants([]);
    setGrantSearch("");
    setGrantSearchResults([]);
    api.get(`/admin-users/${u.id}/employee-grants/`)
      .then((res) => {
        // L'API renvoie une ligne par (employé, type de document) — un
        // employé en "dossier complet" a une ligne unique type_doc=null.
        // On regroupe ici en une entrée par employé, type_docs = liste des
        // types autorisés (vide = dossier complet).
        const byEmployee = new Map();
        (res.data.grants || []).forEach((row) => {
          if (!byEmployee.has(row.employee)) {
            byEmployee.set(row.employee, {
              employee: row.employee,
              employee_nom: row.employee_nom,
              employee_prenom: row.employee_prenom,
              employee_matricule: row.employee_matricule,
              type_docs: [],
            });
          }
          if (row.type_doc) byEmployee.get(row.employee).type_docs.push(row.type_doc);
        });
        setEmployeeGrants(Array.from(byEmployee.values()));
      })
      .catch(() => {});
  };

  // Listes affichées en cascade : cocher une direction ne laisse apparaître
  // que ses pôles/départements/cellules ; cocher un pôle ou un département ne
  // laisse apparaître que ses départements/services. Sans direction cochée,
  // tout est visible (pour un scoping direct à un niveau inférieur sans
  // passer par la direction).
  const visiblePoles = scopeForm.directions.length > 0
    ? poles.filter((p) => scopeForm.directions.includes(p.direction))
    : poles;

  const visibleDepartements = (() => {
    let list = departements;
    if (scopeForm.directions.length > 0) list = list.filter((d) => scopeForm.directions.includes(d.direction));
    if (scopeForm.poles.length > 0) list = list.filter((d) => scopeForm.poles.includes(d.pole));
    return list;
  })();

  const visibleServices = scopeForm.departements.length > 0
    ? services.filter((s) => scopeForm.departements.includes(s.departement))
    : scopeForm.directions.length > 0 || scopeForm.poles.length > 0
      ? services.filter((s) => visibleDepartements.some((d) => d.id === s.departement))
      : services;

  // Une Cellule est rattachée soit directement à une Direction, soit à un
  // Département — les deux filtres (Directions cochées / Départements
  // cochés) s'appliquent donc en OR, pas en cascade exclusive, sinon une
  // cellule directement sous une Direction disparaît dès qu'un Département
  // est aussi coché.
  const visibleCellules =
    scopeForm.directions.length === 0 && scopeForm.departements.length === 0
      ? cellules
      : cellules.filter((c) =>
          (c.direction && scopeForm.directions.includes(c.direction)) ||
          (c.departement && scopeForm.departements.includes(c.departement))
        );

  const toggleDirection = (id) => {
    setScopeForm((prev) => {
      const nextDirections = prev.directions.includes(id)
        ? prev.directions.filter((x) => x !== id)
        : [...prev.directions, id];
      // Retire les pôles/départements/services/cellules qui ne sont plus dans la cascade visible.
      const stillVisiblePoleIds = nextDirections.length > 0
        ? poles.filter((p) => nextDirections.includes(p.direction)).map((p) => p.id)
        : poles.map((p) => p.id);
      const nextPoles = prev.poles.filter((poleId) => stillVisiblePoleIds.includes(poleId));
      const stillVisibleDeps = nextDirections.length > 0
        ? departements.filter((d) => nextDirections.includes(d.direction)).map((d) => d.id)
        : departements.map((d) => d.id);
      const nextDepartements = prev.departements.filter((depId) => stillVisibleDeps.includes(depId));
      const stillVisibleDepSet = new Set(nextDepartements);
      const nextServices = prev.services.filter((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return svc && stillVisibleDepSet.has(svc.departement);
      });
      const nextCellules = prev.cellules.filter((celId) => {
        const cel = cellules.find((c) => c.id === celId);
        if (!cel) return false;
        if (cel.departement) return stillVisibleDeps.includes(cel.departement);
        return nextDirections.length === 0 || nextDirections.includes(cel.direction);
      });
      return { ...prev, directions: nextDirections, poles: nextPoles, departements: nextDepartements, services: nextServices, cellules: nextCellules };
    });
  };

  const togglePole = (id) => {
    setScopeForm((prev) => {
      const next = prev.poles.includes(id) ? prev.poles.filter((x) => x !== id) : [...prev.poles, id];
      return { ...prev, poles: next };
    });
  };

  const toggleDepartement = (id) => {
    setScopeForm((prev) => {
      const nextDepartements = prev.departements.includes(id)
        ? prev.departements.filter((x) => x !== id)
        : [...prev.departements, id];
      const nextServices = prev.services.filter((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return svc && nextDepartements.includes(svc.departement);
      });
      return { ...prev, departements: nextDepartements, services: nextDepartements.length > 0 ? nextServices : prev.services };
    });
  };

  const toggleService = (id) => {
    setScopeForm((prev) => {
      const next = prev.services.includes(id) ? prev.services.filter((x) => x !== id) : [...prev.services, id];
      return { ...prev, services: next };
    });
  };

  const toggleCellule = (id) => {
    setScopeForm((prev) => {
      const next = prev.cellules.includes(id) ? prev.cellules.filter((x) => x !== id) : [...prev.cellules, id];
      return { ...prev, cellules: next };
    });
  };

  // Cocher une catégorie (ex. "ETAT CIVIL") ne fait rien à elle seule pour le
  // périmètre — seuls les sous-types (feuilles) sont réellement rattachés à
  // un document, la catégorie elle-même ne l'est jamais. Cocher la case
  // "catégorie" sélectionne donc tous ses sous-types d'un coup ; son propre
  // id n'est jamais ajouté à scope_types_documents.
  const toggleTypeDocument = (id) => {
    const children = typesDocuments.filter((t) => t.parent === id);
    setScopeForm((prev) => {
      if (children.length > 0) {
        const childIds = children.map((c) => c.id);
        const allSelected = childIds.every((cid) => prev.types_documents.includes(cid));
        const next = allSelected
          ? prev.types_documents.filter((x) => !childIds.includes(x))
          : [...new Set([...prev.types_documents, ...childIds])];
        return { ...prev, types_documents: next };
      }
      const next = prev.types_documents.includes(id)
        ? prev.types_documents.filter((x) => x !== id)
        : [...prev.types_documents, id];
      return { ...prev, types_documents: next };
    });
  };

  // État "coché" d'une ligne Types de documents — pour une catégorie, reflète
  // si TOUS ses sous-types sont sélectionnés (son propre id n'est jamais
  // dans scope_types_documents, voir toggleTypeDocument).
  const isTypeDocChecked = (item) => {
    if (item.is_categorie) {
      const childIds = typesDocuments.filter((t) => t.parent === item.id).map((c) => c.id);
      return childIds.length > 0 && childIds.every((cid) => scopeForm.types_documents.includes(cid));
    }
    return scopeForm.types_documents.includes(item.id);
  };

  const selectAllInLevel = (level, items) => {
    // Pour les types de documents, ne jamais ajouter l'id d'une catégorie —
    // elle n'est jamais rattachée à un document, seuls ses sous-types comptent.
    const ids = level === "types_documents"
      ? items.filter((item) => !item.is_categorie).map((item) => item.id)
      : items.map((item) => item.id);
    setScopeForm((prev) => ({ ...prev, [level]: ids }));
  };

  const clearLevel = (level) => {
    setScopeForm((prev) => ({ ...prev, [level]: [] }));
  };

  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await Promise.all([
        api.patch(`/admin-users/${scopeModal.id}/`, {
          scope_directions: scopeForm.directions,
          scope_poles: scopeForm.poles,
          scope_departements: scopeForm.departements,
          scope_services: scopeForm.services,
          scope_cellules: scopeForm.cellules,
          scope_types_documents: scopeForm.types_documents,
        }),
        api.put(`/admin-users/${scopeModal.id}/employee-grants/`, {
          grants: employeeGrants.flatMap((g) =>
            g.type_docs.length === 0
              ? [{ employee: g.employee, type_doc: null }]
              : g.type_docs.map((typeDocId) => ({ employee: g.employee, type_doc: typeDocId }))
          ),
        }),
      ]);
      setMessage({ type: "success", text: "Périmètre mis à jour." });
      setScopeModal(null);
      fetchUsers(true);
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur lors de la mise à jour du périmètre." });
    } finally {
      setSavingScope(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

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

  // Un employé peut être limité à PLUSIEURS types de documents à la fois
  // (ex. "Contrat de travail" + "Carte chifa") — type_docs=[] signifie
  // "dossier complet" (aucune restriction), sinon la liste des types
  // autorisés pour cet employé. Le backend stocke un EmployeeAccessGrant
  // par (employé, type) — voir handleSaveScope pour l'aplatissement.
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
          ? g.type_docs.filter((id) => id !== typeDocId)
          : [...g.type_docs, typeDocId];
        return { ...g, type_docs: next };
      })
    );
  };

  const fetchUsers = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get("/admin-users/");
      setUsers(response.data.results || response.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: null });
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim()) errs.username = "Identifiant obligatoire.";
    if (!form.nom.trim()) errs.nom = "Nom obligatoire.";
    if (!form.prenom.trim()) errs.prenom = "Prénom obligatoire.";
    if (!form.password) errs.password = "Mot de passe obligatoire.";
    if (form.password.length < 10) errs.password = "Minimum 10 caractères.";
    if (form.password !== form.password2)
      errs.password2 = "Les mots de passe ne correspondent pas.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const response = await api.post("/admin-users/", {
        username: form.username,
        nom: form.nom,
        prenom: form.prenom,
        role: form.role,
        password: form.password,
      });
      const hasScope =
        form.role === "CONSULTANT" &&
        (scopeForm.directions.length > 0 ||
          scopeForm.poles.length > 0 ||
          scopeForm.departements.length > 0 ||
          scopeForm.services.length > 0 ||
          scopeForm.cellules.length > 0 ||
          scopeForm.types_documents.length > 0);
      if (hasScope && response.data.id) {
        await api.patch(`/admin-users/${response.data.id}/`, {
          scope_directions: scopeForm.directions,
          scope_poles: scopeForm.poles,
          scope_departements: scopeForm.departements,
          scope_services: scopeForm.services,
          scope_cellules: scopeForm.cellules,
          scope_types_documents: scopeForm.types_documents,
        });
      }
      setMessage({ type: "success", text: "Utilisateur créé avec succès." });
      setShowForm(false);
      setForm({ username: "", nom: "", prenom: "", role: "CONSULTANT", password: "", password2: "" });
      setScopeForm({ directions: [], poles: [], departements: [], services: [], cellules: [], types_documents: [] });
      fetchUsers(true);
    } catch (err) {
      const data = err.response?.data;
      if (data) setErrors(data);
      else setMessage({ type: "error", text: "Erreur lors de la création." });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/admin-users/${user.id}/`, { is_active: !user.is_active });
      fetchUsers(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!(await confirm(`Supprimer définitivement le compte "${targetUser.username}" ? Cette action est irréversible.`))) return;
    try {
      await api.delete(`/admin-users/${targetUser.id}/`);
      setMessage({ type: "success", text: `Compte "${targetUser.username}" supprimé.` });
      fetchUsers(true);
    } catch (err) {
      const data = err.response?.data;
      const text =
        data?.error ||
        data?.detail ||
        (Array.isArray(data) ? data[0] : null) ||
        "Erreur lors de la suppression.";
      setMessage({ type: "error", text });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleResetPassword = async () => {
    if (resetForm.nouveau_mot_de_passe !== resetForm.confirmation) {
      setMessage({ type: "error", text: "Les mots de passe ne correspondent pas." });
      return;
    }
    if (resetForm.nouveau_mot_de_passe.length < 10) {
      setMessage({ type: "error", text: "Minimum 10 caractères." });
      return;
    }
    setResetting(true);
    try {
      await api.post(`/admin-users/${resetModal.id}/reset-password/`, resetForm);
      setMessage({ type: "success", text: `Mot de passe de ${resetModal.username} réinitialisé.` });
      setResetModal(null);
      setResetForm({ nouveau_mot_de_passe: "", confirmation: "" });
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur." });
    } finally {
      setResetting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const inputStyle = {
    width: "100%",
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    padding: "10px 14px",
    color: theme.text,
    fontSize: 13,
    outline: "none",
    background: theme.bg,
    boxSizing: "border-box",
    fontFamily: theme.fontFamily,
  };

  const labelStyle = {
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 24px" : "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Gestion des utilisateurs
            </h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Gérer les accès à SOMIZ
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                if (!showForm) setScopeForm({ directions: [], poles: [], departements: [], services: [], cellules: [], types_documents: [] });
                setShowForm(!showForm);
              }}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.3)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "inherit",
                backdropFilter: "blur(4px)",
              }}
            >
              <IconPlus /> Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1000, margin: "0 auto" }}>

        {message && (
          <div style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {/* Formulaire création */}
        {showForm && (
          <div style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: 28,
            marginBottom: 24,
            boxShadow: theme.shadowMd,
          }}>
            <h2 style={{ color: theme.text, margin: "0 0 24px", fontSize: 16, fontWeight: 700 }}>
              Créer un compte utilisateur
            </h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
                {[
                  { name: "username", label: "Identifiant", placeholder: "prenom.nom" },
                  { name: "nom", label: "Nom", placeholder: "BENALI" },
                  { name: "prenom", label: "Prénom", placeholder: "Ahmed" },
                ].map((f) => (
                  <div key={f.name}>
                    <label style={labelStyle}>{f.label}</label>
                    <input
                      name={f.name}
                      value={form[f.name]}
                      onChange={handleChange}
                      placeholder={f.placeholder}
                      className="input-focus" style={inputStyle}
                    />
                    {errors[f.name] && (
                      <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>
                        {errors[f.name]}
                      </div>
                    )}
                  </div>
                ))}

                <div>
                  <label style={labelStyle}>Rôle</label>
                  <select name="role" value={form.role} onChange={handleChange} className="input-focus" style={inputStyle}>
                    <option value="CONSULTANT">Consultant (lecture seule)</option>
                    <option value="ADMIN">Administrateur</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Mot de passe</label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    placeholder="Min. 10 caractères"
                    className="input-focus" style={inputStyle}
                  />
                  {errors.password && (
                    <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>{errors.password}</div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Confirmer le mot de passe</label>
                  <input
                    type="password"
                    name="password2"
                    value={form.password2}
                    onChange={handleChange}
                    placeholder="Répétez le mot de passe"
                    className="input-focus" style={inputStyle}
                  />
                  {errors.password2 && (
                    <div style={{ color: theme.danger, fontSize: 11, marginTop: 4 }}>{errors.password2}</div>
                  )}
                </div>
              </div>

              {form.role === "CONSULTANT" && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 20, marginTop: 24 }}>
                  <div style={{ color: theme.text, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                    Périmètre d'accès (optionnel)
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 16 }}>
                    Aucune case cochée nulle part = accès non restreint. Modifiable plus tard via le bouton "Périmètre".
                  </div>

                  {[
                    { level: "directions", label: "Directions", items: directions, onToggle: toggleDirection },
                    { level: "poles", label: "Pôles", items: visiblePoles, onToggle: togglePole },
                    { level: "departements", label: "Départements", items: visibleDepartements, onToggle: toggleDepartement },
                    { level: "services", label: "Services", items: visibleServices, onToggle: toggleService },
                    { level: "cellules", label: "Cellules", items: visibleCellules, onToggle: toggleCellule },
                    { level: "types_documents", label: "Types de documents", items: typesDocuments, onToggle: toggleTypeDocument },
                  ].map(({ level, label, items, onToggle }) => (
                    <div key={level} style={{ marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => selectAllInLevel(level, items)}
                            style={{ background: "none", border: "none", color: theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                          >
                            Tout
                          </button>
                          <button
                            type="button"
                            onClick={() => clearLevel(level)}
                            style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                          >
                            Aucun
                          </button>
                        </div>
                      </div>
                      <div style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        maxHeight: 140,
                        overflowY: "auto",
                        padding: "8px 12px",
                        background: theme.bg,
                      }}>
                        {items.length === 0 ? (
                          <div style={{ color: theme.textMuted, fontSize: 12, padding: "4px 0" }}>Aucun élément.</div>
                        ) : (
                          items.map((item) => (
                            <label
                              key={item.id}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: `4px 0 4px ${item.parent_nom ? 20 : 0}px`, fontSize: 13, color: theme.text, cursor: "pointer" }}
                            >
                              <input
                                type="checkbox"
                                checked={level === "types_documents" ? isTypeDocChecked(item) : scopeForm[level].includes(item.id)}
                                onChange={() => onToggle(item.id)}
                              />
                              {item.parent_nom && <span style={{ color: theme.textMuted, fontSize: 12 }}>↳</span>}
                              {!item.parent_nom && item.is_categorie && <span title="Catégorie">📁</span>}
                              <span style={item.is_categorie ? { fontWeight: 700 } : undefined}>{item.nom}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  style={{
                    background: theme.surface,
                    border: `1.5px solid ${theme.border}`,
                    color: theme.textSecondary,
                    borderRadius: 10,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: saving ? `${theme.primary}88` : theme.primary,
                    border: "none",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "9px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {saving ? "Création..." : "Créer le compte"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste utilisateurs */}
        <div style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: theme.shadowMd,
        }}>
          {loading ? (
            <div style={{ padding: 24 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
                  <Skeleton width={32} height={32} radius={16} />
                  <Skeleton width="35%" height={14} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                  {["Identifiant", "Nom & Prénom", "Rôle", "Périmètre", "Dernière connexion", "Statut", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "13px 16px",
                        textAlign: "left",
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr
                    key={u.id}
                    className="table-row-hover"
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      background: idx % 2 === 0 ? theme.surface : "#FAFBFC",
                    }}
                  >
                    <td style={{ padding: "13px 16px", color: theme.primary, fontFamily: "monospace", fontWeight: 700, fontSize: 13 }}>
                      {u.username}
                    </td>
                    <td style={{ padding: "13px 16px", color: theme.text, fontWeight: 600, fontSize: 14 }}>
                      {u.nom} {u.prenom}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        background: u.role === "ADMIN" ? theme.dangerBg : theme.primaryBg,
                        color: u.role === "ADMIN" ? theme.danger : theme.primary,
                        border: `1px solid ${u.role === "ADMIN" ? theme.dangerBorder : theme.primaryBorder}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13, maxWidth: 220 }}>
                      {(() => {
                        if (u.role === "ADMIN") {
                          return <span style={{ color: theme.textMuted, fontStyle: "italic" }}>Accès complet</span>;
                        }
                        const dirNoms = u.scope_directions_nom || [];
                        const poleNoms = u.scope_poles_nom || [];
                        const deptNoms = u.scope_departements_nom || [];
                        const svcNoms = u.scope_services_nom || [];
                        const celNoms = u.scope_cellules_nom || [];
                        const typeNoms = u.scope_types_documents_nom || [];
                        const grantsCount = u.employee_grants_count || 0;
                        if (dirNoms.length === 0 && poleNoms.length === 0 && deptNoms.length === 0 && svcNoms.length === 0 && celNoms.length === 0 && typeNoms.length === 0 && grantsCount === 0) {
                          return <span style={{ color: theme.textMuted, fontStyle: "italic" }}>Aucun (accès complet)</span>;
                        }
                        const scopePill = (label, count, fullList, color) => (
                          <span
                            title={fullList.join(", ")}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              background: `${color}15`,
                              color,
                              border: `1px solid ${color}33`,
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "default",
                            }}
                          >
                            {label} · {count}
                          </span>
                        );
                        return (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {dirNoms.length > 0 && scopePill("Directions", dirNoms.length, dirNoms, "#166534")}
                            {poleNoms.length > 0 && scopePill("Pôles", poleNoms.length, poleNoms, "#0d9488")}
                            {deptNoms.length > 0 && scopePill("Départements", deptNoms.length, deptNoms, "#1e40af")}
                            {svcNoms.length > 0 && scopePill("Services", svcNoms.length, svcNoms, "#6d28d9")}
                            {celNoms.length > 0 && scopePill("Cellules", celNoms.length, celNoms, "#b45309")}
                            {typeNoms.length > 0 && scopePill("Types de doc.", typeNoms.length, typeNoms, "#b45309")}
                            {grantsCount > 0 && scopePill("Employés spécifiques", grantsCount, ["voir détail dans Périmètre"], "#be185d")}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13 }}>
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString("fr-FR")
                        : "Jamais"}
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        background: u.is_active ? theme.primaryBg : theme.dangerBg,
                        color: u.is_active ? theme.primary : theme.danger,
                        border: `1px solid ${u.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {u.is_active ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => toggleActive(u)}
                            style={{
                              background: u.is_active ? theme.dangerBg : theme.primaryBg,
                              border: `1px solid ${u.is_active ? theme.dangerBorder : theme.primaryBorder}`,
                              color: u.is_active ? theme.danger : theme.primary,
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            {u.is_active ? "Désactiver" : "Activer"}
                          </button>
                          <button
                            onClick={() => {
                              setResetModal(u);
                              setResetForm({ nouveau_mot_de_passe: "", confirmation: "" });
                              setShowResetMdp(false);
                              setShowResetConfirm(false);
                            }}
                            style={{
                              background: "#FFF8E1",
                              border: "1px solid #FFE082",
                              color: theme.warning,
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              fontFamily: "inherit",
                            }}
                          >
                            <IconKey /> Reset MDP
                          </button>
                          {u.role === "CONSULTANT" && (
                            <button
                              onClick={() => openScopeModal(u)}
                              style={{
                                background: theme.primaryBg,
                                border: `1px solid ${theme.primaryBorder}`,
                                color: theme.primary,
                                borderRadius: 8,
                                padding: "5px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Périmètre
                            </button>
                          )}
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteUser(u)}
                              style={{
                                background: theme.dangerBg,
                                border: `1px solid ${theme.dangerBorder}`,
                                color: theme.danger,
                                borderRadius: 8,
                                padding: "5px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              Supprimer
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Reset Mot de Passe */}
      {resetModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setResetModal(null)}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 16,
              padding: 32,
              width: 440,
              maxWidth: "90vw",
              boxShadow: "0 16px 48px rgba(15,23,42,0.2)",
              border: `1px solid ${theme.border}`,
              fontFamily: theme.fontFamily,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
              Réinitialiser le mot de passe
            </h2>
            <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 24 }}>
              Compte :{" "}
              <strong style={{ color: theme.primary }}>{resetModal.username}</strong>
              {" "}— {resetModal.prenom} {resetModal.nom}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{
                color: theme.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 6,
              }}>
                Nouveau mot de passe
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showResetMdp ? "text" : "password"}
                  value={resetForm.nouveau_mot_de_passe}
                  onChange={(e) => setResetForm({ ...resetForm, nouveau_mot_de_passe: e.target.value })}
                  className="input-focus"
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 40px 10px 14px",
                    color: theme.text,
                    fontSize: 13,
                    outline: "none",
                    background: theme.bg,
                    boxSizing: "border-box",
                    fontFamily: theme.fontFamily,
                  }}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowResetMdp(!showResetMdp)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: theme.textSecondary, padding: 0, display: "flex" }}
                >
                  <EyeIcon open={showResetMdp} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{
                color: theme.textSecondary,
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                display: "block",
                marginBottom: 6,
              }}>
                Confirmer
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showResetConfirm ? "text" : "password"}
                  value={resetForm.confirmation}
                  onChange={(e) => setResetForm({ ...resetForm, confirmation: e.target.value })}
                  className="input-focus"
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "10px 40px 10px 14px",
                    color: theme.text,
                    fontSize: 13,
                    outline: "none",
                    background: theme.bg,
                    boxSizing: "border-box",
                    fontFamily: theme.fontFamily,
                  }}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(!showResetConfirm)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: theme.textSecondary, padding: 0, display: "flex" }}
                >
                  <EyeIcon open={showResetConfirm} />
                </button>
              </div>
            </div>

            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 24 }}>
              Minimum 10 caractères. Le compte sera déverrouillé automatiquement.
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setResetModal(null)}
                style={{
                  background: theme.surface,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 10,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                style={{
                  background: resetting ? `${theme.warning}88` : theme.warning,
                  border: "none",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "9px 24px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: resetting ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {resetting ? "Réinitialisation..." : "Réinitialiser"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Périmètre d'accès */}
      {scopeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setScopeModal(null)}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 16,
              width: 520,
              maxWidth: "90vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 16px 48px rgba(15,23,42,0.2)",
              border: `1px solid ${theme.border}`,
              fontFamily: theme.fontFamily,
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <div style={{ padding: "32px 32px 0", overflowY: "auto", flex: 1 }}>
            <h2 style={{ color: theme.text, margin: "0 0 6px", fontSize: 17, fontWeight: 800 }}>
              Périmètre d'accès
            </h2>
            <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 20 }}>
              Compte :{" "}
              <strong style={{ color: theme.primary }}>{scopeModal.username}</strong>
              {" "}— {scopeModal.prenom} {scopeModal.nom}
            </div>
            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 20 }}>
              Cocher une direction filtre les départements affichés à ceux qu'elle contient ; cocher un département filtre les services de la même façon. Aucune case cochée nulle part = accès non restreint (comportement par défaut).
            </div>

            {[
              { level: "directions", label: "Directions", items: directions, onToggle: toggleDirection },
              { level: "poles", label: "Pôles", items: visiblePoles, onToggle: togglePole },
              { level: "departements", label: "Départements", items: visibleDepartements, onToggle: toggleDepartement },
              { level: "services", label: "Services", items: visibleServices, onToggle: toggleService },
              { level: "cellules", label: "Cellules", items: visibleCellules, onToggle: toggleCellule },
            ].map(({ level, label, items, onToggle }) => (
              <div key={level} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => selectAllInLevel(level, items)}
                      style={{ background: "none", border: "none", color: theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                    >
                      Tout
                    </button>
                    <button
                      type="button"
                      onClick={() => clearLevel(level)}
                      style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                    >
                      Aucun
                    </button>
                  </div>
                </div>
                <div style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  maxHeight: 140,
                  overflowY: "auto",
                  padding: "8px 12px",
                  background: theme.bg,
                }}>
                  {items.length === 0 ? (
                    <div style={{ color: theme.textMuted, fontSize: 12, padding: "4px 0" }}>Aucun élément.</div>
                  ) : (
                    items.map((item) => (
                      <label
                        key={item.id}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: theme.text, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={scopeForm[level].includes(item.id)}
                          onChange={() => onToggle(item.id)}
                        />
                        {item.nom}
                      </label>
                    ))
                  )}
                </div>
              </div>
            ))}

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16, marginTop: 4, marginBottom: 16 }}>
              <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 12 }}>
                Périmètre indépendant : restreint en plus les <strong>types de documents</strong> visibles (combiné en ET avec le périmètre organisationnel ci-dessus). Aucune case cochée = tous les types visibles.
              </div>
              {[{ level: "types_documents", label: "Types de documents", items: typesDocuments, onToggle: toggleTypeDocument }].map(({ level, label, items, onToggle }) => (
                <div key={level}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>{label}</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => selectAllInLevel(level, items)}
                        style={{ background: "none", border: "none", color: theme.primary, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                      >
                        Tout
                      </button>
                      <button
                        type="button"
                        onClick={() => clearLevel(level)}
                        style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}
                      >
                        Aucun
                      </button>
                    </div>
                  </div>
                  <div style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    maxHeight: 140,
                    overflowY: "auto",
                    padding: "8px 12px",
                    background: theme.bg,
                  }}>
                    {items.length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: 12, padding: "4px 0" }}>Aucun élément.</div>
                    ) : (
                      items.map((item) => (
                        <label
                          key={item.id}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: `4px 0 4px ${item.parent_nom ? 20 : 0}px`, fontSize: 13, color: theme.text, cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={isTypeDocChecked(item)}
                            onChange={() => onToggle(item.id)}
                          />
                          {item.parent_nom && <span style={{ color: theme.textMuted, fontSize: 12 }}>↳</span>}
                          {!item.parent_nom && item.is_categorie && <span title="Catégorie">📁</span>}
                          <span style={item.is_categorie ? { fontWeight: 700 } : undefined}>{item.nom}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Employés spécifiques</label>
              <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                Accès ponctuel à un employé précis, en plus (union) du périmètre ci-dessus — dossier complet ou un ou plusieurs types de documents. Les types déjà couverts par le périmètre global "Types de documents" apparaissent cochés automatiquement.
              </div>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  type="text"
                  value={grantSearch}
                  onChange={(e) => setGrantSearch(e.target.value)}
                  placeholder="Rechercher un employé (nom, prénom, matricule, n° contrat)…"
                  className="input-focus"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1.5px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    color: theme.text,
                  }}
                />
                {grantSearch.trim().length >= 2 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    marginTop: 4,
                    maxHeight: 180,
                    overflowY: "auto",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                  }}>
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
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {employeeGrants.map((g) => (
                    <div
                      key={g.employee}
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: theme.bg,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                          {g.employee_prenom} {g.employee_nom} <span style={{ color: theme.textMuted, fontWeight: 400 }}>({g.employee_matricule})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEmployeeGrant(g.employee)}
                          style={{ background: "none", border: "none", color: theme.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                        >
                          Retirer
                        </button>
                      </div>
                      <div style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        maxHeight: 130,
                        overflowY: "auto",
                        padding: "6px 8px",
                        background: theme.surface,
                      }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, fontWeight: 700, color: theme.text, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={g.type_docs.length === 0}
                            onChange={() => setGrantFullDossier(g.employee)}
                          />
                          Dossier complet
                        </label>
                        <div style={{ borderTop: `1px solid ${theme.border}`, margin: "4px 0" }} />
                        {typesDocuments.filter((t) => !t.is_categorie).map((t) => {
                          // Un type déjà couvert par le périmètre global "Types
                          // de documents" (section ci-dessus) n'a pas besoin
                          // d'être re-coché ici — on l'affiche coché et non
                          // modifiable pour que l'admin voie tout de suite
                          // qu'il est déjà accessible, sans double-saisie.
                          const coveredByGlobalScope =
                            scopeForm.types_documents.length === 0 || scopeForm.types_documents.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12,
                                color: coveredByGlobalScope ? theme.textMuted : theme.text,
                                cursor: coveredByGlobalScope ? "default" : "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={coveredByGlobalScope || g.type_docs.includes(t.id)}
                                disabled={coveredByGlobalScope}
                                onChange={() => toggleGrantTypeDoc(g.employee, t.id)}
                              />
                              {t.parent_nom && <span style={{ color: theme.textMuted, fontSize: 11 }}>↳</span>}
                              {t.nom}
                              {coveredByGlobalScope && <span style={{ fontStyle: "italic" }}>(périmètre global)</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 32px", borderTop: `1px solid ${theme.border}`, flexShrink: 0 }}>
              <button
                onClick={() => setScopeModal(null)}
                style={{
                  background: theme.surface,
                  border: `1.5px solid ${theme.border}`,
                  color: theme.textSecondary,
                  borderRadius: 10,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleSaveScope}
                disabled={savingScope}
                style={{
                  background: savingScope ? `${theme.primary}88` : theme.primary,
                  border: "none",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "9px 24px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: savingScope ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {savingScope ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </PageBackground>
  );
};

export default Users;

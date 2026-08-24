import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import { TrashIcon, PencilIcon, DownloadIcon, UploadIcon, FolderIcon, CheckIcon, XIcon, RocketIcon } from "../components/icons";
import Skeleton from "../components/Skeleton";
import PageBackground from "../components/PageBackground";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import useIsMobile from "../hooks/useIsMobile";
import "../styles/animations.css";

// ─── COMPOSANTS RÉUTILISABLES ─────────────────────────────────────────────────

const Badge = ({ count, color }) => (
  <span
    style={{
      background: `${color}18`,
      color,
      border: `1px solid ${color}44`,
      borderRadius: 10,
      padding: "1px 8px",
      fontSize: 11,
      fontWeight: 700,
      marginLeft: 6,
    }}
  >
    {count}
  </span>
);

const Modal = ({ title, onClose, onSubmit, saving, children }) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.3)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}
    onClick={onClose}
  >
    <div
      style={{
        background: theme.surface,
        borderRadius: 16,
        padding: 32,
        width: 480,
        maxWidth: "90vw",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        border: `1px solid ${theme.primaryBorder}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <h2
        style={{
          color: theme.text,
          margin: "0 0 24px",
          fontSize: 16,
          fontWeight: 800,
        }}
      >
        {title}
      </h2>
      {children}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          marginTop: 24,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: `1px solid ${theme.primaryBorder}`,
            color: theme.textSecondary,
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Annuler
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          style={{
            background: saving ? `${theme.primary}88` : theme.primary,
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 24px",
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  </div>
);

const inputStyle = {
  width: "100%",
  border: `1px solid ${theme.primaryBorder}`,
  borderRadius: 8,
  padding: "9px 14px",
  color: theme.text,
  fontSize: 13,
  outline: "none",
  background: theme.bg,
  boxSizing: "border-box",
  marginBottom: 12,
};

const labelStyle = {
  color: theme.text,
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 5,
};

// ─── TABLEAU GÉNÉRIQUE ────────────────────────────────────────────────────────

const RefTable = ({ items, columns, onEdit, onDelete, onRenameSystem, loading, isAdmin }) => (
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
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 0" }}>
            <Skeleton width={32} height={32} radius={16} />
            <Skeleton width="40%" height={14} />
          </div>
        ))}
      </div>
    ) : items.length === 0 ? (
      <div
        style={{ color: theme.textSecondary, textAlign: "center", padding: 40 }}
      >
        Aucun élément. Cliquez sur "Ajouter" pour commencer.
      </div>
    ) : (
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: theme.primaryBg }}>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  padding: "11px 16px",
                  textAlign: "left",
                  color: theme.primary,
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  borderBottom: `2px solid ${theme.primaryBorder}`,
                }}
              >
                {c.label}
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
                  ? "#F1F5F9"
                  : item.is_categorie
                    ? "#FFFBEB"
                    : item.parent_nom
                      ? "#FFFDF7"
                      : idx % 2 === 0 ? theme.surface : "#FAFBFC",
              }}
            >
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

// ─── ONGLETS ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "directions", label: "Directions" },
  { key: "poles", label: "Pôles" },
  { key: "departements", label: "Départements" },
  { key: "services", label: "Services" },
  { key: "cellules", label: "Cellules" },
  { key: "postes", label: "Postes" },
  { key: "types-contrat", label: "Types de contrat" },
  { key: "categories", label: "Catégories" },
  { key: "types-documents", label: "Types de documents" },
  { key: "champs-personnalises", label: "Champs personnalisés" },
];

// Champs "système" de la fiche employé — pilotent le scoping/périmètre RGPD,
// l'archivage, la recherche ou la logique métier (voir CLAUDE.md). Affichés
// dans l'onglet "Champs personnalisés" pour vue d'ensemble complète, mais
// jamais modifiables/supprimables depuis cet écran (`system: true`).
const SYSTEM_FIELDS = [
  { id: "sys-matricule", nom: "Matricule", code: "matricule", type_champ: "texte", system: true },
  { id: "sys-nom", nom: "Nom", code: "nom", type_champ: "texte", system: true },
  { id: "sys-prenom", nom: "Prénom", code: "prenom", type_champ: "texte", system: true },
  { id: "sys-statut", nom: "Statut", code: "statut", type_champ: "texte", system: true },
  { id: "sys-direction", nom: "Direction", code: "direction", type_champ: "référentiel", system: true },
  { id: "sys-departement", nom: "Département", code: "departement", type_champ: "référentiel", system: true },
  { id: "sys-service", nom: "Service", code: "service", type_champ: "référentiel", system: true },
  { id: "sys-poste", nom: "Fonction", code: "poste", type_champ: "référentiel", system: true },
  { id: "sys-type_contrat", nom: "Type de contrat", code: "type_contrat", type_champ: "référentiel", system: true },
  { id: "sys-categorie", nom: "Catégorie", code: "categorie", type_champ: "référentiel", system: true },
  { id: "sys-date_naissance", nom: "Date de naissance", code: "date_naissance", type_champ: "date", system: true },
  { id: "sys-date_embauche", nom: "Date de recrutement", code: "date_embauche", type_champ: "date", system: true },
];

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────

const Parametres = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const [systemLabels, setSystemLabels] = useState({});
  const [activeTab, setActiveTab] = useState("directions");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', item: {} }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [importModal, setImportModal] = useState(null); // { tab: 'directions' }
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageMeta, setPageMeta] = useState({ count: 0, next: null, previous: null });

  // Données des référentiels pour les selects
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);

  useEffect(() => {
    // Charger directions et départements pour les selects
    fetchDirections();
    fetchPoles();
    fetchDepartements();
    if (activeTab === "champs-personnalises") fetchSystemLabels();
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    fetchTab(activeTab, page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, page, search]);

  const fetchSystemLabels = async () => {
    try {
      const r = await api.get("/ref/system-field-labels/");
      const list = r.data.results || r.data;
      setSystemLabels(Object.fromEntries(list.map((l) => [l.code, l.label])));
    } catch {}
  };

  const handleRenameSystemField = async (item) => {
    const newLabel = await prompt("Nouveau libellé affiché :", systemLabels[item.code] || item.nom);
    if (newLabel === null) return;
    try {
      await api.put(`/ref/system-field-labels/${item.code}/`, { label: newLabel.trim() });
      showMessage("success", "Libellé mis à jour.");
      fetchSystemLabels();
    } catch (err) {
      showMessage("error", "Impossible de mettre à jour le libellé.");
    }
  };

  const fetchDirections = async () => {
    try {
      const r = await api.get("/ref/directions/");
      setDirections(r.data.results || r.data);
    } catch {}
  };

  const fetchPoles = async () => {
    try {
      const r = await api.get("/ref/poles/");
      setPoles(r.data.results || r.data);
    } catch {}
  };

  const fetchDepartements = async () => {
    try {
      const r = await api.get("/ref/departements/");
      setDepartements(r.data.results || r.data);
    } catch {}
  };

  const fetchTab = async (tab, pageNum = 1, q = "") => {
    setLoading(true);
    try {
      const params = { page: pageNum };
      if (q) params.q = q;
      const response = await api.get(`/ref/${tab}/`, { params });
      const isPaginated = Array.isArray(response.data?.results);
      const results = isPaginated ? response.data.results : response.data;
      setData((prev) => ({ ...prev, [tab]: results }));
      setPageMeta(
        isPaginated
          ? {
              count: response.data.count,
              next: response.data.next,
              previous: response.data.previous,
            }
          : { count: (results || []).length, next: null, previous: null },
      );
    } catch (err) {
      showMessage("error", "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm({});
    setModal({ mode: "add" });
  };

  const openEdit = (item) => {
    setForm({ ...item });
    setModal({ mode: "edit", item });
  };

  const handleDelete = async (item) => {
    if (!(await confirm(`Supprimer "${item.nom}" ?`))) return;
    try {
      await api.delete(`/ref/${activeTab}/${item.id}/`);
      showMessage("success", "Supprimé avec succès.");
      fetchTab(activeTab, page, search);
    } catch (err) {
      const serverError = err.response?.data?.error;
      showMessage(
        "error",
        serverError || "Impossible de supprimer — des employés y sont peut-être rattachés.",
      );
    }
  };
  const handleImportFile = async () => {
    if (!importFile || !importModal) return;
    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", importFile);

    try {
      const response = await api.post(
        `/ref/import/${importModal.tab}/`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setImportResult(response.data);
      fetchTab(activeTab, page, search);
      fetchDirections();
      fetchPoles();
      fetchDepartements();
    } catch (err) {
      setImportResult({
        error: err.response?.data?.error || "Erreur lors de l'import.",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadRefTemplate = async (tab) => {
    try {
      const response = await api.get(`/ref/import/${tab}/template/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `template_${tab}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };
  const handleSubmit = async () => {
    setSaving(true);
    try {
      if (modal.mode === "add") {
        await api.post(`/ref/${activeTab}/`, form);
        showMessage("success", "Ajouté avec succès.");
      } else {
        await api.patch(`/ref/${activeTab}/${modal.item.id}/`, form);
        showMessage("success", "Modifié avec succès.");
      }
      setModal(null);
      fetchTab(activeTab, page, search);
      fetchDirections();
      fetchPoles();
      fetchDepartements();
    } catch (err) {
      const data = err.response?.data;
      showMessage(
        "error",
        data ? Object.values(data)[0] : "Une erreur est survenue.",
      );
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Pour les types de documents : au lieu de trier à plat par `ordre` (ce
  // qui sépare visuellement une catégorie de ses sous-types), on regroupe
  // chaque catégorie avec ses enfants juste en dessous — la hiérarchie
  // configurée dans "Catégorie parente" devient enfin visible dans le
  // tableau, comme dans la sidebar Documents.
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

  const items =
    activeTab === "types-documents"
      ? sortTypesDocumentsHierarchy(data[activeTab] || [])
      : activeTab === "champs-personnalises"
        ? [
            ...SYSTEM_FIELDS.map((f) => ({ ...f, nom: systemLabels[f.code] || f.nom })),
            ...(data[activeTab] || []),
          ]
        : data[activeTab] || [];

  // ─── Colonnes par onglet ───────────────────────────────────────────────────

  const getColumns = () => {
    switch (activeTab) {
      case "directions":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "nb_departements",
            label: "Départements",
            render: (i) => (
              <Badge count={i.nb_departements} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "poles":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          { key: "direction_nom", label: "Direction" },
          {
            key: "nb_departements",
            label: "Départements",
            render: (i) => (
              <Badge count={i.nb_departements} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "departements":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          { key: "direction_nom", label: "Direction" },
          { key: "pole_nom", label: "Pôle", render: (i) => i.pole_nom || "—" },
          {
            key: "nb_services",
            label: "Services",
            render: (i) => (
              <Badge count={i.nb_services} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "services":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          { key: "departement_nom", label: "Département" },
          { key: "direction_nom", label: "Direction" },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "cellules":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "rattachement",
            label: "Rattachée à",
            render: (i) =>
              i.direction_nom
                ? `Direction : ${i.direction_nom}`
                : `Département : ${i.departement_nom}`,
          },
          {
            key: "nb_employes",
            label: "Employés",
            render: (i) => (
              <Badge count={i.nb_employes} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "postes":
        return [
          { key: "nom", label: "Intitulé", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "nb_employes",
            label: "Employés",
            render: (i) => (
              <Badge count={i.nb_employes} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "types-contrat":
      case "categories":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "description", label: "Description" },
          {
            key: "nb_employes",
            label: "Employés",
            render: (i) => (
              <Badge count={i.nb_employes} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "types-documents":
        return [
          {
            key: "nom",
            label: "Nom",
            bold: true,
            render: (i) =>
              i.parent_nom ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 22 }}>
                  <span style={{ color: theme.textMuted, fontSize: 13 }}>↳</span>
                  <span>{i.nom}</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i.is_categorie && <span title="Catégorie">📁</span>}
                  <span style={{ fontWeight: 700 }}>{i.nom}</span>
                </div>
              ),
          },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "ordre",
            label: "Ordre",
            render: (i) =>
              i.parent_nom ? (
                <span style={{ color: theme.textMuted, fontSize: 12 }}>— (suit "{i.parent_nom}")</span>
              ) : (
                i.ordre ?? "—"
              ),
          },
          {
            key: "obligatoire",
            label: "Obligatoire",
            render: (i) => (
              <span
                style={{
                  background: i.obligatoire ? theme.dangerBg : theme.primaryBg,
                  color: i.obligatoire ? theme.danger : theme.primary,
                  border: `1px solid ${i.obligatoire ? theme.dangerBorder : theme.primaryBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.obligatoire ? "Obligatoire" : "Optionnel"}
              </span>
            ),
          },
          {
            key: "nb_documents",
            label: "Documents",
            render: (i) => (
              <Badge count={i.nb_documents} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
      case "champs-personnalises":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "type_champ",
            label: "Type",
            render: (i) => (
              <span style={{ color: theme.textSecondary, fontSize: 12, textTransform: "capitalize" }}>
                {i.type_champ}
              </span>
            ),
          },
          { key: "ordre", label: "Ordre", render: (i) => (i.system ? "—" : i.ordre) },
          {
            key: "is_active",
            label: "Statut",
            render: (i) =>
              i.system ? (
                <span style={{ color: theme.textMuted, fontSize: 11, fontStyle: "italic" }}>—</span>
              ) : (
                <span
                  style={{
                    background: i.is_active ? theme.primaryBg : theme.dangerBg,
                    color: i.is_active ? theme.primary : theme.danger,
                    border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                    borderRadius: 6,
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {i.is_active ? "Actif" : "Inactif"}
                </span>
              ),
          },
        ];
      default:
        return [];
    }
  };

  // ─── Formulaire par onglet ─────────────────────────────────────────────────

  const renderForm = () => {
    switch (activeTab) {
      case "directions":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Direction Générale"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="DG"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
              placeholder="Description optionnelle"
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "poles":
        return (
          <>
            <label style={labelStyle}>
              Direction <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="direction"
              value={form.direction || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Pôle Machines Tournantes"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="PMT"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "departements": {
        const polesDeLaDirection = poles.filter((p) => p.direction === form.direction);
        return (
          <>
            <label style={labelStyle}>
              Direction <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="direction"
              value={form.direction || ""}
              onChange={(e) => setForm({ ...form, direction: e.target.value, pole: "" })}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>Pôle (optionnel)</label>
            <select
              name="pole"
              value={form.pole || ""}
              onChange={handleChange}
              disabled={!form.direction || polesDeLaDirection.length === 0}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Aucun (rattaché directement à la Direction) --</option>
              {polesDeLaDirection.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Département Ressources Humaines"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="DRH"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }

      case "services":
        return (
          <>
            <label style={labelStyle}>
              Département <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="departement"
              value={form.departement || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Sélectionner --</option>
              {departements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom} ({d.direction_nom})
                </option>
              ))}
            </select>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Service Paie"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="SP"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "cellules": {
        const rattachement = form.departement ? "departement" : "direction";
        return (
          <>
            <label style={labelStyle}>
              Rattachée à <span style={{ color: theme.danger }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={rattachement === "direction"}
                  onChange={() => setForm({ ...form, direction: form.direction || "", departement: "" })}
                />
                Une Direction
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={rattachement === "departement"}
                  onChange={() => setForm({ ...form, departement: form.departement || "", direction: "" })}
                />
                Un Département
              </label>
            </div>
            {rattachement === "direction" ? (
              <select
                name="direction"
                value={form.direction || ""}
                onChange={handleChange}
                className="input-focus" style={inputStyle}
              >
                <option value="">-- Sélectionner une Direction --</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="departement"
                value={form.departement || ""}
                onChange={handleChange}
                className="input-focus" style={inputStyle}
              >
                <option value="">-- Sélectionner un Département --</option>
                {departements.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom} ({d.direction_nom})
                  </option>
                ))}
              </select>
            )}
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Cellule Audit Interne"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="CAI"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }

      case "postes":
        return (
          <>
            <label style={labelStyle}>
              Intitulé <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Ingénieur principal"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="ING-P"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "types-contrat":
      case "categories":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder={
                activeTab === "types-contrat"
                  ? "CDI, CDD, Titulaire..."
                  : "Cadre, Technicien..."
              }
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      case "types-documents":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Attestation de travail"
            />

            <label style={labelStyle}>
              Code <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="ATTESTATION"
            />

            <label style={labelStyle}>Catégorie parente (optionnel)</label>
            <select
              name="parent"
              value={form.parent || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
            >
              <option value="">-- Aucune (type racine) --</option>
              {items
                .filter((t) => !t.parent && t.id !== modal?.item?.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom}
                  </option>
                ))}
            </select>
            <div style={{ color: theme.textMuted, fontSize: 11, marginTop: -8, marginBottom: 12 }}>
              Rattacher ce type à une catégorie (ex. "Acte de naissance" sous "État civil") pour l'afficher comme sous-dossier. Un type devenant lui-même une catégorie (une fois qu'il a des sous-types) n'est plus uploadable directement.
            </div>

            <label style={labelStyle}>Ordre d'affichage</label>
            <input
              type="number"
              name="ordre"
              value={form.ordre ?? 0}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              min="0"
            />

            <label style={labelStyle}>Obligatoire ?</label>
            <select
              name="obligatoire"
              value={modal?.item?.is_categorie ? false : form.obligatoire ?? false}
              onChange={(e) =>
                setForm({ ...form, obligatoire: e.target.value === "true" })
              }
              disabled={modal?.item?.is_categorie}
              className="input-focus" style={inputStyle}
            >
              <option value="false">Optionnel</option>
              <option value="true">Obligatoire</option>
            </select>
            {modal?.item?.is_categorie && (
              <div style={{ color: theme.warning, fontSize: 11, marginTop: 4, marginBottom: 12 }}>
                Cette catégorie a des sous-types — elle n'est plus uploadable directement, donc "Obligatoire" n'a aucun effet ici. Marquez le(s) sous-type(s) concerné(s) comme obligatoire(s) à la place.
              </div>
            )}

            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "champs-personnalises":
        return (
          <>
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Permis de conduire"
            />

            <label style={labelStyle}>
              Code <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="PERMIS"
            />

            <label style={labelStyle}>Type</label>
            <select
              name="type_champ"
              value={form.type_champ || "texte"}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
            >
              <option value="texte">Texte</option>
              <option value="nombre">Nombre</option>
              <option value="date">Date</option>
            </select>

            <label style={labelStyle}>Ordre d'affichage</label>
            <input
              type="number"
              name="ordre"
              value={form.ordre ?? 0}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              min="0"
            />

            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
            <div style={{ color: theme.textMuted, fontSize: 11, marginTop: -8 }}>
              Ce champ apparaîtra sur la fiche de tous les employés (section "Informations complémentaires").
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div className="anim-fade-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              color: theme.text,
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            Paramètres
          </h1>
          <div
            style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
          >
            Gestion des référentiels organisationnels
          </div>
        </div>

        {message && (
          <div
            style={{
              background:
                message.type === "success" ? theme.primaryBg : theme.dangerBg,
              border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
              color: message.type === "success" ? theme.primary : theme.danger,
              borderRadius: 8,
              padding: "10px 16px",
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {message.text}
          </div>
        )}

        {/* Onglets */}
        <div
          style={{
            background: theme.surface,
            borderRadius: 12,
            border: `1px solid ${theme.primaryBorder}`,
            boxShadow: theme.shadow,
            overflow: "hidden",
          }}
        >
          {/* Tabs header */}
          <div
            style={{
              display: "flex",
              borderBottom: `2px solid ${theme.primaryBorder}`,
              background: theme.bg,
              overflowX: "auto",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  background:
                    activeTab === tab.key ? theme.surface : "transparent",
                  border: "none",
                  borderBottom:
                    activeTab === tab.key
                      ? `2px solid ${theme.primary}`
                      : "2px solid transparent",
                  color:
                    activeTab === tab.key ? theme.primary : theme.textSecondary,
                  padding: "13px 20px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  whiteSpace: "nowrap",
                  transition: "all 0.15s",
                  marginBottom: -2,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Contenu onglet */}
          <div style={{ padding: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
                <div style={{ color: theme.textSecondary, fontSize: 13, whiteSpace: "nowrap" }}>
                  {pageMeta.count} élément(s)
                </div>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="input-focus"
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 13,
                    color: theme.text,
                    background: theme.bg,
                    outline: "none",
                    minWidth: 200,
                    maxWidth: 320,
                  }}
                />
              </div>
              {isAdmin && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleDownloadRefTemplate(activeTab)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: theme.primaryBg,
                      border: `1px solid ${theme.primaryBorder}`,
                      color: theme.primary,
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <DownloadIcon size={13} /> Template
                  </button>
                  <button
                    onClick={() => {
                      setImportModal({ tab: activeTab });
                      setImportFile(null);
                      setImportResult(null);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      background: theme.primaryBg,
                      border: `1px solid ${theme.primaryBorder}`,
                      color: theme.primary,
                      borderRadius: 8,
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <UploadIcon size={13} /> Import CSV
                  </button>
                  <button
                    onClick={openAdd}
                    style={{
                      background: theme.accent,
                      border: "none",
                      color: theme.text,
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: `0 2px 8px ${theme.accent}44`,
                    }}
                  >
                    + Ajouter
                  </button>
                </div>
              )}
            </div>

            <RefTable
              items={items}
              columns={getColumns()}
              onEdit={openEdit}
              onDelete={handleDelete}
              onRenameSystem={activeTab === "champs-personnalises" ? handleRenameSystemField : undefined}
              loading={loading}
              isAdmin={isAdmin}
            />

            {(pageMeta.next || pageMeta.previous) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  marginTop: 16,
                }}
              >
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={!pageMeta.previous}
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    background: theme.surface,
                    color: pageMeta.previous ? theme.text : theme.textMuted,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 13,
                    cursor: pageMeta.previous ? "pointer" : "not-allowed",
                  }}
                >
                  ← Précédent
                </button>
                <span style={{ color: theme.textSecondary, fontSize: 13 }}>
                  Page {page} sur {Math.max(1, Math.ceil(pageMeta.count / 25))}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={!pageMeta.next}
                  style={{
                    border: `1px solid ${theme.primaryBorder}`,
                    background: theme.surface,
                    color: pageMeta.next ? theme.text : theme.textMuted,
                    borderRadius: 8,
                    padding: "7px 16px",
                    fontSize: 13,
                    cursor: pageMeta.next ? "pointer" : "not-allowed",
                  }}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <Modal
          title={modal.mode === "add" ? "Ajouter" : "Modifier"}
          onClose={() => setModal(null)}
          onSubmit={handleSubmit}
          saving={saving}
        >
          {renderForm()}
        </Modal>
      )}
      {/* Modal Import CSV */}
      {importModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setImportModal(null)}
        >
          <div
            style={{
              background: theme.surface,
              borderRadius: 16,
              padding: 32,
              width: 520,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
              border: `1px solid ${theme.primaryBorder}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                color: theme.text,
                margin: "0 0 20px",
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              Import CSV — {TABS.find((t) => t.key === importModal.tab)?.label}
            </h2>

            {/* Zone dépôt */}
            <div
              onClick={() => document.getElementById("ref-csv-input").click()}
              style={{
                border: `2px dashed ${importFile ? theme.primary : theme.primaryBorder}`,
                borderRadius: 10,
                padding: 24,
                textAlign: "center",
                background: importFile ? theme.primaryBg : theme.bg,
                cursor: "pointer",
                marginBottom: 16,
                transition: "all 0.2s",
              }}
            >
              {importFile ? (
                <div>
                  <div style={{ color: theme.primary, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <CheckIcon size={14} /> {importFile.name}
                  </div>
                  <div
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    {(importFile.size / 1024).toFixed(1)} Ko — Cliquez pour
                    changer
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", color: theme.textMuted }}><FolderIcon size={28} /></div>
                  <div style={{ color: theme.text, fontSize: 14 }}>
                    Cliquez pour choisir un fichier CSV
                  </div>
                </div>
              )}
              <input
                id="ref-csv-input"
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files[0])}
                style={{ display: "none" }}
              />
            </div>

            {/* Résultat */}
            {importResult && (
              <div style={{ marginBottom: 16 }}>
                {importResult.error ? (
                  <div
                    style={{
                      background: theme.dangerBg,
                      border: `1px solid ${theme.dangerBorder}`,
                      borderRadius: 8,
                      padding: 12,
                      color: theme.danger,
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <XIcon size={13} /> {importResult.error}
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                      {[
                        {
                          label: "Créés",
                          value: importResult.nb_crees,
                          color: theme.primary,
                        },
                        {
                          label: "Erreurs",
                          value: importResult.nb_erreurs,
                          color:
                            importResult.nb_erreurs > 0
                              ? theme.danger
                              : theme.primary,
                        },
                      ].map((s) => (
                        <div
                          key={s.label}
                          style={{
                            flex: 1,
                            textAlign: "center",
                            padding: "10px",
                            background: theme.bg,
                            borderRadius: 8,
                            border: `1px solid ${theme.primaryBorder}`,
                          }}
                        >
                          <div
                            style={{
                              color: s.color,
                              fontSize: 22,
                              fontWeight: 800,
                            }}
                          >
                            {s.value}
                          </div>
                          <div
                            style={{ color: theme.textSecondary, fontSize: 12 }}
                          >
                            {s.label}
                          </div>
                        </div>
                      ))}
                    </div>
                    {importResult.nb_erreurs > 0 && (
                      <div
                        style={{
                          background: theme.dangerBg,
                          borderRadius: 8,
                          padding: 10,
                        }}
                      >
                        {importResult.erreurs.slice(0, 5).map((err, i) => (
                          <div
                            key={i}
                            style={{
                              color: theme.danger,
                              fontSize: 12,
                              marginBottom: 3,
                            }}
                          >
                            Ligne {err.ligne} — {err.nom} :{" "}
                            {err.erreurs.join(", ")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Boutons */}
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <button
                onClick={() => setImportModal(null)}
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.primaryBorder}`,
                  color: theme.textSecondary,
                  borderRadius: 8,
                  padding: "8px 20px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Fermer
              </button>
              <button
                onClick={handleImportFile}
                disabled={!importFile || importing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background:
                    !importFile || importing
                      ? `${theme.primary}88`
                      : theme.primary,
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 24px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !importFile || importing ? "not-allowed" : "pointer",
                }}
              >
                {importing ? "Import..." : <><RocketIcon size={13} /> Importer</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
};

export default Parametres;

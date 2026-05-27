import { useState, useEffect } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";

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

const RefTable = ({ items, columns, onEdit, onDelete, loading }) => (
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
      <div
        style={{ color: theme.textSecondary, textAlign: "center", padding: 40 }}
      >
        Chargement...
      </div>
    ) : items.length === 0 ? (
      <div
        style={{ color: theme.textSecondary, textAlign: "center", padding: 40 }}
      >
        Aucun élément. Cliquez sur "Ajouter" pour commencer.
      </div>
    ) : (
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
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              style={{ borderBottom: `1px solid ${theme.primaryBorder}` }}
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
              <td style={{ padding: "11px 16px" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => onEdit(item)}
                    style={{
                      background: theme.primaryBg,
                      border: `1px solid ${theme.primaryBorder}`,
                      color: theme.primary,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(item)}
                    style={{
                      background: theme.dangerBg,
                      border: `1px solid ${theme.dangerBorder}`,
                      color: theme.danger,
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);

// ─── ONGLETS ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: "directions", label: "Directions" },
  { key: "departements", label: "Départements" },
  { key: "services", label: "Services" },
  { key: "postes", label: "Postes" },
  { key: "types-contrat", label: "Types de contrat" },
  { key: "categories", label: "Catégories" },
];

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────

const Parametres = () => {
  const [activeTab, setActiveTab] = useState("directions");
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // { mode: 'add'|'edit', item: {} }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Données des référentiels pour les selects
  const [directions, setDirections] = useState([]);
  const [departements, setDepartements] = useState([]);

  useEffect(() => {
    fetchTab(activeTab);
    // Charger directions et départements pour les selects
    fetchDirections();
    fetchDepartements();
  }, [activeTab]);

  const fetchDirections = async () => {
    try {
      const r = await api.get("/ref/directions/");
      setDirections(r.data.results || r.data);
    } catch {}
  };

  const fetchDepartements = async () => {
    try {
      const r = await api.get("/ref/departements/");
      setDepartements(r.data.results || r.data);
    } catch {}
  };

  const fetchTab = async (tab) => {
    setLoading(true);
    try {
      const response = await api.get(`/ref/${tab}/`);
      setData((prev) => ({
        ...prev,
        [tab]: response.data.results || response.data,
      }));
    } catch (err) {
      console.error(err);
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
    if (!window.confirm(`Supprimer "${item.nom}" ?`)) return;
    try {
      await api.delete(`/ref/${activeTab}/${item.id}/`);
      showMessage("success", "Supprimé avec succès.");
      fetchTab(activeTab);
    } catch (err) {
      showMessage(
        "error",
        "Impossible de supprimer — des employés y sont peut-être rattachés.",
      );
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
      fetchTab(activeTab);
      fetchDirections();
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

  const items = data[activeTab] || [];

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
      case "departements":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          { key: "direction_nom", label: "Direction" },
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
              style={inputStyle}
              placeholder="Direction Générale"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              style={inputStyle}
              placeholder="DG"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
              placeholder="Description optionnelle"
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      case "departements":
        return (
          <>
            <label style={labelStyle}>
              Direction <span style={{ color: theme.danger }}>*</span>
            </label>
            <select
              name="direction"
              value={form.direction || ""}
              onChange={handleChange}
              style={inputStyle}
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
              style={inputStyle}
              placeholder="Département Ressources Humaines"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              style={inputStyle}
              placeholder="DRH"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

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
              style={inputStyle}
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
              style={inputStyle}
              placeholder="Service Paie"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              style={inputStyle}
              placeholder="SP"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

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
              style={inputStyle}
              placeholder="Ingénieur principal"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              style={inputStyle}
              placeholder="ING-P"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              style={inputStyle}
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
              style={inputStyle}
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
              style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1100, margin: "0 auto" }}>
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
              }}
            >
              <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                {items.length} élément(s)
              </div>
              <button
                onClick={openAdd}
                style={{
                  background: theme.primary,
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "9px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: `0 2px 8px ${theme.primary}44`,
                }}
              >
                + Ajouter
              </button>
            </div>

            <RefTable
              items={items}
              columns={getColumns()}
              onEdit={openEdit}
              onDelete={handleDelete}
              loading={loading}
            />
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
    </div>
  );
};

export default Parametres;

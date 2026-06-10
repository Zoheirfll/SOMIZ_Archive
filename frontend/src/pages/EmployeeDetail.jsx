import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import SecureDocViewer from "../components/SecureDocViewer";

const EmployeeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [employee, setEmployee] = useState(null);
  const [contrats, setContrats] = useState([]);
  const [activeTab, setActiveTab] = useState("dossier");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState("");
  const [message, setMessage] = useState(null);
  const [typesDocuments, setTypesDocuments] = useState({});
  const [typesDocumentsList, setTypesDocumentsList] = useState([]);
  const [quickUploadingCode, setQuickUploadingCode] = useState(null);
  const [showNewContratForm, setShowNewContratForm] = useState(false);
  const [newContrat, setNewContrat] = useState({ numero_contrat: "", type_contrat: "", date_debut: "", date_fin: "", statut: "actif", notes: "" });
  const [typesContrat, setTypesContrat] = useState([]);
  const [savingContrat, setSavingContrat] = useState(false);

  useEffect(() => {
    fetchTypesDocuments();
    fetchEmployee();
    fetchContrats();
    fetchTypesContrat();
  }, [id]);

  useEffect(() => {
    return () => {
      if (docUrl) URL.revokeObjectURL(docUrl);
    };
  }, [docUrl]);

  const fetchTypesDocuments = async () => {
    try {
      const response = await api.get("/ref/types-documents/");
      const types = response.data.results || response.data;
      const map = {};
      types.forEach((t) => {
        map[t.code] = t.nom;
      });
      setTypesDocuments(map);
      setTypesDocumentsList(types);
      if (types.length > 0) setUploadType(types[0].code);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContrats = async () => {
    try {
      const response = await api.get(`/employees/${id}/contrats/`);
      setContrats(response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTypesContrat = async () => {
    try {
      const response = await api.get("/ref/types-contrat/");
      setTypesContrat(response.data.results || response.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateContrat = async (e) => {
    e.preventDefault();
    setSavingContrat(true);
    try {
      const payload = { ...newContrat };
      if (!payload.type_contrat) delete payload.type_contrat;
      if (!payload.date_debut) delete payload.date_debut;
      if (!payload.date_fin) delete payload.date_fin;
      await api.post(`/employees/${id}/contrats/`, payload);
      setMessage({ type: "success", text: "Contrat créé avec succès." });
      setShowNewContratForm(false);
      setNewContrat({ numero_contrat: "", type_contrat: "", date_debut: "", date_fin: "", statut: "actif", notes: "" });
      fetchContrats();
    } catch (err) {
      const detail = err.response?.data?.numero_contrat?.[0] || err.response?.data?.non_field_errors?.[0] || "Erreur lors de la création.";
      setMessage({ type: "error", text: detail });
    } finally {
      setSavingContrat(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const fetchEmployee = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/employees/${id}/`);
      setEmployee(response.data);
      if (response.data.documents?.length > 0) {
        const firstDoc = response.data.documents[0];
        setSelectedDoc(firstDoc);
        if (firstDoc.fichiers?.length > 0) {
          loadFile(firstDoc.fichiers[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFile = async (file) => {
    setSelectedFile(file);
    setDocLoading(true);
    setDocUrl(null);
    try {
      const response = await api.get(`/files/${file.id}/view/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      setDocUrl(url + "#toolbar=0&navpanes=0&scrollbar=0");
    } catch (err) {
      console.error(err);
    } finally {
      setDocLoading(false);
    }
  };

  const handleSelectDoc = (doc) => {
    setSelectedDoc(doc);
    setSelectedFile(null);
    setDocUrl(null);
    if (doc.fichiers?.length > 0) {
      loadFile(doc.fichiers[0]);
    }
  };

  // Upload multiple fichiers
  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);

    const typeSelectionne = typesDocumentsList.find(
      (t) => t.code === uploadType,
    );
    const formData = new FormData();
    formData.append("type_doc", typeSelectionne?.id || uploadType);
    // Ajouter chaque fichier sous la clé "files"
    files.forEach((file) => formData.append("files", file));

    try {
      await api.post(`/employees/${id}/documents/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({
        type: "success",
        text: `${files.length} fichier(s) uploadé(s) avec succès.`,
      });
      fetchEmployee();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.files?.[0] || "Erreur lors de l'upload.",
      });
    } finally {
      setUploading(false);
      // Reset input fichier
      e.target.value = "";
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDeleteFile = async (file, e) => {
    e.stopPropagation();
    if (!window.confirm(`Supprimer "${file.file_name}" ?`)) return;
    try {
      await api.delete(`/files/${file.id}/`);
      setMessage({ type: "success", text: "Fichier supprimé." });
      if (selectedFile?.id === file.id) {
        setSelectedFile(null);
        setDocUrl(null);
      }
      fetchEmployee();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de la suppression." });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDeleteDoc = async (doc, e) => {
    e.stopPropagation();
    const nomType = typesDocuments[doc.type_document] || doc.type_document;
    if (
      !window.confirm(
        `Supprimer tout le dossier "${nomType} v${doc.version}" et ses ${doc.nb_fichiers} fichier(s) ?`,
      )
    )
      return;
    try {
      await api.delete(`/documents/${doc.id}/`);
      setMessage({ type: "success", text: "Document supprimé." });
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
        setSelectedFile(null);
        setDocUrl(null);
      }
      fetchEmployee();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de la suppression." });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 80,
          }}
        >
          Chargement...
        </div>
      </div>
    );

  if (!employee) return null;

  const infoFields = [
    { label: "Matricule", value: employee.matricule, mono: true },
    {
      label: "Nom & Prénom",
      value: `${employee.nom} ${employee.prenom}`,
      bold: true,
    },
    { label: "Date de naissance", value: employee.date_naissance || "—" },
    { label: "Date d'embauche", value: employee.date_embauche || "—" },
    { label: "Statut", value: employee.statut, badge: true },
    { label: "Direction", value: employee.direction_nom || "—" },
    { label: "Département", value: employee.departement_nom || "—" },
    { label: "Service", value: employee.service_nom || "—" },
    { label: "Poste", value: employee.poste_nom || "—" },
    { label: "Type de contrat", value: employee.type_contrat_nom || "—" },
    { label: "Catégorie", value: employee.categorie_nom || "—" },
  ];

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        <button
          onClick={() => navigate("/employees")}
          style={{
            background: "transparent",
            border: `1px solid ${theme.primaryBorder}`,
            color: theme.textSecondary,
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          ← Retour
        </button>

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

        {/* Infos employé */}
        <div
          style={{
            background: theme.surface,
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            boxShadow: theme.shadow,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: `1px solid ${theme.primaryBorder}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: theme.primaryBg,
                  border: `2px solid ${theme.primaryBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.primary,
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {employee.prenom?.[0]}
                {employee.nom?.[0]}
              </div>
              <div>
                <div
                  style={{ color: theme.text, fontWeight: 800, fontSize: 18 }}
                >
                  {employee.prenom} {employee.nom}
                </div>
                <div
                  style={{
                    color: theme.primary,
                    fontFamily: "monospace",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {employee.matricule}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  Complétude dossier
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 120,
                      background: theme.bg,
                      borderRadius: 4,
                      height: 8,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${employee.taux_completude}%`,
                        background:
                          employee.taux_completude === 100
                            ? theme.primary
                            : employee.taux_completude >= 50
                              ? theme.warning
                              : theme.danger,
                        borderRadius: 4,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                  <span
                    style={{ color: theme.text, fontWeight: 700, fontSize: 13 }}
                  >
                    {employee.taux_completude}%
                  </span>
                </div>
              </div>
              {user?.role === "ADMIN" && (
                <button
                  onClick={() => navigate(`/employees/${id}/modifier`)}
                  style={{
                    background: theme.primaryBg,
                    border: `1px solid ${theme.primaryBorder}`,
                    color: theme.primary,
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ✏️ Modifier
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 20,
            }}
          >
            {infoFields.map((item) => (
              <div key={item.label}>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: 4,
                  }}
                >
                  {item.label}
                </div>
                {item.badge ? (
                  <span
                    style={{
                      background:
                        employee.statut === "actif"
                          ? theme.primaryBg
                          : theme.dangerBg,
                      color:
                        employee.statut === "actif"
                          ? theme.primary
                          : theme.danger,
                      border: `1px solid ${employee.statut === "actif" ? theme.primaryBorder : theme.dangerBorder}`,
                      borderRadius: 6,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {employee.statut}
                  </span>
                ) : (
                  <div
                    style={{
                      color: item.mono ? theme.primary : theme.text,
                      fontFamily: item.mono ? "monospace" : "inherit",
                      fontWeight: item.bold || item.mono ? 700 : 400,
                      fontSize: item.mono ? 15 : 13,
                    }}
                  >
                    {item.value}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "dossier", label: `Dossier (${employee.documents?.length || 0})` },
            { key: "contrats", label: `Contrats (${contrats.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? theme.primary : theme.surface,
                border: `1px solid ${activeTab === tab.key ? theme.primary : theme.primaryBorder}`,
                color: activeTab === tab.key ? "#fff" : theme.text,
                borderRadius: 8, padding: "8px 20px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Onglet Contrats */}
        {activeTab === "contrats" && (
          <div style={{
            background: theme.surface, border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12, overflow: "hidden", boxShadow: theme.shadow,
          }}>
            <div style={{
              padding: "14px 20px", borderBottom: `1px solid ${theme.primaryBorder}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: theme.primaryBg,
            }}>
              <span style={{ color: theme.primary, fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Contrats de {employee.prenom} {employee.nom}
              </span>
              {user?.role === "ADMIN" && (
                <button
                  onClick={() => setShowNewContratForm(!showNewContratForm)}
                  style={{
                    background: theme.primary, border: "none", color: "#fff",
                    borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  + Nouveau contrat
                </button>
              )}
            </div>

            {/* Formulaire nouveau contrat */}
            {showNewContratForm && (
              <form onSubmit={handleCreateContrat} style={{
                padding: 20, borderBottom: `1px solid ${theme.primaryBorder}`,
                background: "#FAFFFE",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      N° Contrat *
                    </label>
                    <input
                      required
                      value={newContrat.numero_contrat}
                      onChange={(e) => setNewContrat({ ...newContrat, numero_contrat: e.target.value })}
                      placeholder="ex: CTR-2024-001"
                      style={{
                        width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                        padding: "8px 10px", fontSize: 13, color: theme.text,
                        background: theme.surface, outline: "none", boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      Type de contrat
                    </label>
                    <select
                      value={newContrat.type_contrat}
                      onChange={(e) => setNewContrat({ ...newContrat, type_contrat: e.target.value })}
                      style={{
                        width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                        padding: "8px 10px", fontSize: 13, color: theme.text,
                        background: theme.surface, outline: "none", boxSizing: "border-box",
                      }}
                    >
                      <option value="">— Sélectionner —</option>
                      {typesContrat.map((t) => (
                        <option key={t.id} value={t.id}>{t.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      Statut
                    </label>
                    <select
                      value={newContrat.statut}
                      onChange={(e) => setNewContrat({ ...newContrat, statut: e.target.value })}
                      style={{
                        width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                        padding: "8px 10px", fontSize: 13, color: theme.text,
                        background: theme.surface, outline: "none", boxSizing: "border-box",
                      }}
                    >
                      <option value="actif">Actif</option>
                      <option value="termine">Terminé</option>
                      <option value="suspendu">Suspendu</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      Date début
                    </label>
                    <input
                      type="date"
                      value={newContrat.date_debut}
                      onChange={(e) => setNewContrat({ ...newContrat, date_debut: e.target.value })}
                      style={{
                        width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                        padding: "8px 10px", fontSize: 13, color: theme.text,
                        background: theme.surface, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                      Date fin
                    </label>
                    <input
                      type="date"
                      value={newContrat.date_fin}
                      onChange={(e) => setNewContrat({ ...newContrat, date_fin: e.target.value })}
                      style={{
                        width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                        padding: "8px 10px", fontSize: 13, color: theme.text,
                        background: theme.surface, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                    Notes
                  </label>
                  <textarea
                    value={newContrat.notes}
                    onChange={(e) => setNewContrat({ ...newContrat, notes: e.target.value })}
                    rows={2}
                    style={{
                      width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
                      padding: "8px 10px", fontSize: 13, color: theme.text,
                      background: theme.surface, outline: "none", boxSizing: "border-box", resize: "vertical",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="submit"
                    disabled={savingContrat}
                    style={{
                      background: savingContrat ? `${theme.primary}88` : theme.primary,
                      border: "none", color: "#fff", borderRadius: 6,
                      padding: "8px 20px", fontSize: 13, fontWeight: 600,
                      cursor: savingContrat ? "not-allowed" : "pointer",
                    }}
                  >
                    {savingContrat ? "Création..." : "Créer le contrat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewContratForm(false)}
                    style={{
                      background: "transparent", border: `1px solid ${theme.primaryBorder}`,
                      color: theme.textSecondary, borderRadius: 6, padding: "8px 16px",
                      fontSize: 13, cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}

            {/* Liste des contrats */}
            {contrats.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                Aucun contrat enregistré
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: theme.bg }}>
                    {["N° Contrat", "Type", "Date début", "Date fin", "Statut", "Documents", ""].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left", fontSize: 11,
                        color: theme.textMuted, textTransform: "uppercase",
                        letterSpacing: "0.05em", fontWeight: 600,
                        borderBottom: `1px solid ${theme.primaryBorder}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contrats.map((c) => {
                    const statutColors = {
                      actif: { bg: theme.primaryBg, border: theme.primaryBorder, color: theme.primary },
                      termine: { bg: "#F5F5F5", border: "#BDBDBD", color: "#616161" },
                      suspendu: { bg: theme.dangerBg, border: theme.dangerBorder, color: theme.danger },
                    };
                    const sc = statutColors[c.statut] || statutColors.actif;
                    return (
                      <tr key={c.id}
                        onClick={() => navigate(`/contrats/${c.id}`)}
                        style={{ cursor: "pointer", borderBottom: `1px solid ${theme.primaryBorder}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme.primaryBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: 13, color: theme.primary, fontWeight: 700 }}>
                          {c.numero_contrat}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: theme.text }}>{c.type_contrat_nom || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: theme.text }}>{c.date_debut || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: theme.text }}>{c.date_fin || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            background: sc.bg, border: `1px solid ${sc.border}`,
                            color: sc.color, borderRadius: 5, padding: "3px 10px",
                            fontSize: 11, fontWeight: 600,
                          }}>
                            {c.statut}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: theme.textSecondary }}>
                          {c.nb_documents} doc(s)
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ color: theme.primary, fontSize: 12 }}>Voir →</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Documents + Viewer */}
        {activeTab === "dossier" && <div
          style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}
        >
          {/* Sidebar */}
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: theme.shadow,
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                borderBottom: `1px solid ${theme.primaryBorder}`,
                color: theme.primary,
                fontWeight: 700,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                background: theme.primaryBg,
              }}
            >
              Documents ({employee.documents?.length || 0})
            </div>

            {/* Documents présents */}
            {employee.documents?.map((doc) => (
              <div
                key={doc.id}
                style={{
                  borderBottom: `1px solid ${theme.primaryBorder}`,
                  background:
                    selectedDoc?.id === doc.id
                      ? theme.primaryBg
                      : "transparent",
                  borderLeft: `3px solid ${selectedDoc?.id === doc.id ? theme.primary : "transparent"}`,
                }}
              >
                {/* En-tête du document */}
                <div
                  onClick={() => handleSelectDoc(doc)}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: theme.text,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {typesDocuments[doc.type_document] || doc.type_document}
                    </div>
                    <div
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      v{doc.version} · {doc.nb_fichiers} fichier(s) ·{" "}
                      {doc.file_size_kb} Ko
                    </div>
                  </div>
                  {user?.role === "ADMIN" && (
                    <button
                      onClick={(e) => handleDeleteDoc(doc, e)}
                      title="Supprimer ce document"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: theme.danger,
                        cursor: "pointer",
                        fontSize: 13,
                        padding: "2px 4px",
                        opacity: 0.5,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.opacity = 0.5)
                      }
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Fichiers du document — affichés si document sélectionné */}
                {selectedDoc?.id === doc.id && doc.fichiers?.length > 0 && (
                  <div
                    style={{
                      borderTop: `1px dashed ${theme.primaryBorder}`,
                      background: theme.bg,
                    }}
                  >
                    {doc.fichiers.map((file, index) => (
                      <div
                        key={file.id}
                        onClick={() => loadFile(file)}
                        style={{
                          padding: "8px 16px 8px 24px",
                          cursor: "pointer",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          background:
                            selectedFile?.id === file.id
                              ? `${theme.primary}18`
                              : "transparent",
                          borderLeft: `3px solid ${selectedFile?.id === file.id ? theme.primaryLight : "transparent"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            style={{ color: theme.textMuted, fontSize: 11 }}
                          >
                            {file.mime_type?.includes("pdf") ? "📄" : "🖼️"}
                          </span>
                          <div>
                            <div
                              style={{
                                color: theme.text,
                                fontSize: 12,
                                fontWeight:
                                  selectedFile?.id === file.id ? 600 : 400,
                              }}
                            >
                              Page {index + 1}
                            </div>
                            <div
                              style={{ color: theme.textMuted, fontSize: 10 }}
                            >
                              {file.file_size_kb} Ko
                            </div>
                          </div>
                        </div>
                        {user?.role === "ADMIN" && (
                          <button
                            onClick={(e) => handleDeleteFile(file, e)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.danger,
                              cursor: "pointer",
                              fontSize: 11,
                              opacity: 0.5,
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.opacity = 1)
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.opacity = 0.5)
                            }
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Documents manquants */}
            {employee.documents_manquants?.map((doc) => (
              <div
                key={doc.code}
                style={{
                  padding: "10px 16px",
                  borderBottom: `1px solid ${theme.primaryBorder}`,
                  background: "#FAFAFA",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ color: theme.textMuted, fontSize: 13 }}>
                    {doc.required && (
                      <span style={{ color: theme.danger, marginRight: 4 }}>*</span>
                    )}
                    {doc.label}
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2, fontStyle: "italic" }}>
                    Non uploadé
                  </div>
                </div>
                {user?.role === "ADMIN" && (
                  <label
                    title={`Uploader ${doc.label}`}
                    style={{
                      background: quickUploadingCode === doc.code ? `${theme.primary}88` : theme.primaryBg,
                      border: `1px solid ${theme.primaryBorder}`,
                      color: theme.primary,
                      borderRadius: 6,
                      padding: "4px 8px",
                      fontSize: 13,
                      cursor: quickUploadingCode === doc.code ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {quickUploadingCode === doc.code ? "⏳" : "📎"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      multiple
                      style={{ display: "none" }}
                      disabled={quickUploadingCode === doc.code}
                      onChange={async (e) => {
                        const files = Array.from(e.target.files);
                        if (!files.length) return;
                        setQuickUploadingCode(doc.code);
                        const typeDoc = typesDocumentsList.find((t) => t.code === doc.code);
                        const formData = new FormData();
                        formData.append("type_doc", typeDoc?.id || doc.code);
                        files.forEach((f) => formData.append("files", f));
                        try {
                          await api.post(`/employees/${id}/documents/`, formData, {
                            headers: { "Content-Type": "multipart/form-data" },
                          });
                          setMessage({ type: "success", text: `${doc.label} uploadé avec succès.` });
                          fetchEmployee();
                        } catch (err) {
                          setMessage({ type: "error", text: err.response?.data?.files?.[0] || "Erreur lors de l'upload." });
                        } finally {
                          setQuickUploadingCode(null);
                          e.target.value = "";
                          setTimeout(() => setMessage(null), 4000);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            ))}

            {/* Upload ADMIN */}
            {user?.role === "ADMIN" && (
              <div
                style={{
                  padding: 16,
                  borderTop: `2px solid ${theme.primaryBorder}`,
                  background: theme.bg,
                }}
              >
                <div
                  style={{
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Ajouter un document
                </div>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  style={{
                    width: "100%",
                    border: `1px solid ${theme.primaryBorder}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                    fontSize: 12,
                    color: theme.text,
                    background: theme.surface,
                    marginBottom: 8,
                    outline: "none",
                  }}
                >
                  {typesDocumentsList.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.nom}
                    </option>
                  ))}
                </select>
                <label
                  style={{
                    display: "block",
                    width: "100%",
                    background: uploading
                      ? `${theme.primary}88`
                      : theme.primary,
                    color: "#fff",
                    borderRadius: 6,
                    padding: "8px",
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: uploading ? "not-allowed" : "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  {uploading ? "Upload en cours..." : "📎 Choisir fichier(s)"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff"
                    onChange={handleUpload}
                    style={{ display: "none" }}
                    disabled={uploading}
                    multiple /* ← permet sélection multiple */
                  />
                </label>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 10,
                    marginTop: 6,
                    textAlign: "center",
                  }}
                >
                  Maintenez Ctrl pour sélectionner plusieurs fichiers
                </div>
              </div>
            )}
          </div>

          {/* Viewer */}
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: theme.shadow,
              minHeight: 600,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {selectedFile ? (
              <>
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: `1px solid ${theme.primaryBorder}`,
                    background: theme.primaryBg,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span
                      style={{
                        color: theme.text,
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {typesDocuments[selectedDoc?.type_document] ||
                        selectedDoc?.type_document}
                    </span>
                    <span
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        marginLeft: 8,
                      }}
                    >
                      — {selectedFile.file_name}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    {/* Onglets fichiers */}
                    {selectedDoc?.fichiers?.length > 1 && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {selectedDoc.fichiers.map((file, index) => (
                          <button
                            key={file.id}
                            onClick={() => loadFile(file)}
                            style={{
                              background:
                                selectedFile.id === file.id
                                  ? theme.primary
                                  : theme.primaryBg,
                              border: `1px solid ${theme.primaryBorder}`,
                              color:
                                selectedFile.id === file.id
                                  ? "#fff"
                                  : theme.primary,
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Page {index + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                      {selectedFile.file_size_kb} Ko
                    </span>
                  </div>
                </div>

                {docLoading ? (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme.textSecondary,
                    }}
                  >
                    Chargement...
                  </div>
                ) : docUrl ? (
                  <SecureDocViewer
                    url={docUrl}
                    mimeType={selectedFile?.mime_type}
                    fileName={selectedFile?.file_name}
                  />
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: theme.danger,
                    }}
                  >
                    Impossible de charger le fichier.
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: theme.textMuted,
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
                <div style={{ fontSize: 14 }}>
                  Sélectionnez un document pour le visualiser
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
};

export default EmployeeDetail;

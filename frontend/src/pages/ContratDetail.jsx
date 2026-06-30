import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import SecureDocViewer from "../components/SecureDocViewer";

const STATUT_COLORS = {
  actif:      { bg: theme.primaryBg, border: theme.primaryBorder, color: theme.primary,  label: "Actif" },
  archive:    { bg: "#F5F5F5",       border: "#BDBDBD",           color: "#616161",      label: "Archivé" },
  demobilise: { bg: theme.dangerBg,  border: theme.dangerBorder,  color: theme.danger,   label: "Démobilisé" },
};

const ContratDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [contrat, setContrat] = useState(null);
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
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [typesContrat, setTypesContrat] = useState([]);

  useEffect(() => {
    fetchTypesDocuments();
    fetchContrat();
    fetchTypesContrat();
  }, [id]);

  const fetchTypesContrat = async () => {
    try {
      const res = await api.get("/ref/types-contrat/");
      setTypesContrat(res.data.results || res.data);
    } catch (err) { console.error(err); }
  };

  const handleEditOpen = () => {
    setEditForm({
      numero_contrat: contrat.numero_contrat,
      type_contrat: contrat.type_contrat || "",
      date_debut: contrat.date_debut || "",
      date_fin: contrat.date_fin || "",
      statut: contrat.statut,
      notes: contrat.notes || "",
    });
    setEditing(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...editForm };
      if (!payload.type_contrat) delete payload.type_contrat;
      if (!payload.date_debut) delete payload.date_debut;
      if (!payload.date_fin) delete payload.date_fin;
      await api.patch(`/contrats/${id}/`, payload);
      setMessage({ type: "success", text: "Contrat modifié avec succès." });
      setEditing(false);
      fetchContrat();
    } catch (err) {
      const detail = err.response?.data?.numero_contrat?.[0] || "Erreur lors de la modification.";
      setMessage({ type: "error", text: detail });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

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
      types.forEach((t) => { map[t.code] = t.nom; });
      setTypesDocuments(map);
      setTypesDocumentsList(types);
      if (types.length > 0) setUploadType(types[0].code);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContrat = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/contrats/${id}/`);
      setContrat(response.data);
      if (response.data.documents?.length > 0) {
        const firstDoc = response.data.documents[0];
        setSelectedDoc(firstDoc);
        if (firstDoc.fichiers?.length > 0) loadFile(firstDoc.fichiers[0]);
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
      const response = await api.get(`/files/${file.id}/view/`, { responseType: "blob" });
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
    if (doc.fichiers?.length > 0) loadFile(doc.fichiers[0]);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);

    const typeSelectionne = typesDocumentsList.find((t) => t.code === uploadType);
    const formData = new FormData();
    formData.append("type_doc", typeSelectionne?.id || uploadType);
    files.forEach((file) => formData.append("files", file));

    try {
      await api.post(`/contrats/${id}/documents/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({ type: "success", text: `${files.length} fichier(s) uploadé(s) avec succès.` });
      fetchContrat();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.files?.[0] || "Erreur lors de l'upload." });
    } finally {
      setUploading(false);
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
      if (selectedFile?.id === file.id) { setSelectedFile(null); setDocUrl(null); }
      fetchContrat();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de la suppression." });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDeleteDoc = async (doc, e) => {
    e.stopPropagation();
    const nomType = typesDocuments[doc.type_document] || doc.type_document;
    if (!window.confirm(`Supprimer "${nomType} v${doc.version}" et ses ${doc.nb_fichiers} fichier(s) ?`)) return;
    try {
      await api.delete(`/documents/${doc.id}/`);
      setMessage({ type: "success", text: "Document supprimé." });
      if (selectedDoc?.id === doc.id) { setSelectedDoc(null); setSelectedFile(null); setDocUrl(null); }
      fetchContrat();
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
        <div style={{ color: theme.textSecondary, textAlign: "center", padding: 80 }}>
          Chargement...
        </div>
      </div>
    );

  if (!contrat) return null;

  const statutStyle = STATUT_COLORS[contrat.statut] || STATUT_COLORS.actif;

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero Header */}
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: "40px 32px 32px",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <button onClick={() => navigate("/employees")} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              ← Employés
            </button>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
            <button onClick={() => navigate(`/employees/${contrat.employee_id}`)} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "rgba(255,255,255,0.8)", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              {contrat.employee_matricule} — {contrat.employee_nom}
            </button>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: 12, fontFamily: "monospace" }}>{contrat.numero_contrat}</span>
          </div>

          {/* Hero content */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.15)", border: "2px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                📋
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Contrat</div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", fontFamily: "monospace" }}>{contrat.numero_contrat}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>{contrat.employee_prenom || ""} {contrat.employee_nom} · {contrat.employee_matricule}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ background: statutStyle.bg, border: `1px solid ${statutStyle.border}`, color: statutStyle.color, borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 700 }}>
                {statutStyle.label}
              </span>
              {user?.role === "ADMIN" && !editing && (
                <button onClick={handleEditOpen} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  ✏️ Modifier
                </button>
              )}
              {user?.role === "ADMIN" && (
                <button onClick={() => navigate(`/employees/${contrat.employee_id}?tab=contrats`)} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  + Nouveau contrat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>

        {message && (
          <div className="notif-banner" style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 13, fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {/* Infos contrat */}
        <div className="anim-slide-up delay-1" style={{
          background: theme.surface, border: `1px solid ${theme.border}`,
          borderRadius: 16, padding: 28, marginBottom: 24, boxShadow: theme.shadowMd,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ width: 4, height: 20, background: theme.primary, borderRadius: 2 }} />
            <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Informations du contrat</span>
          </div>

          {/* Formulaire d'édition inline */}
          {editing ? (
            <form onSubmit={handleSave}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", marginBottom: 16 }}>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>N° Contrat</label>
                  <input
                    value={editForm.numero_contrat}
                    onChange={(e) => setEditForm({ ...editForm, numero_contrat: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Statut</label>
                  <select
                    value={editForm.statut}
                    onChange={(e) => setEditForm({ ...editForm, statut: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }}
                  >
                    <option value="actif">Actif</option>
                    <option value="archive">Archivé</option>
                    <option value="demobilise">Démobilisé</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Type de contrat</label>
                  <select
                    value={editForm.type_contrat}
                    onChange={(e) => setEditForm({ ...editForm, type_contrat: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }}
                  >
                    <option value="">— Aucun —</option>
                    {typesContrat.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Date début</label>
                  <input type="date" value={editForm.date_debut} onChange={(e) => setEditForm({ ...editForm, date_debut: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Date fin</label>
                  <input type="date" value={editForm.date_fin} onChange={(e) => setEditForm({ ...editForm, date_fin: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notes</label>
                  <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", border: `1px solid ${theme.border}`, borderRadius: 10, fontSize: 14, background: theme.bg, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" disabled={saving} style={{
                  background: theme.primary, color: "#fff", border: "none", borderRadius: 7,
                  padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer",
                }}>
                  {saving ? "Enregistrement…" : "✓ Enregistrer"}
                </button>
                <button type="button" onClick={() => setEditing(false)} style={{
                  background: "transparent", border: `1px solid ${theme.border}`,
                  color: theme.textSecondary, borderRadius: 10, padding: "8px 16px", fontSize: 13, cursor: "pointer",
                }}>
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
                {[
                  { label: "N° Contrat", value: contrat.numero_contrat, mono: true },
                  { label: "Type de contrat", value: contrat.type_contrat_nom || "—" },
                  { label: "Date début", value: contrat.date_debut || "—" },
                  { label: "Date fin", value: contrat.date_fin || "—" },
                  { label: "Documents", value: `${contrat.nb_documents} fichier(s)` },
                ].map((item) => (
                  <div key={item.label}>
                    <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ color: item.mono ? theme.primary : theme.text, fontFamily: item.mono ? "monospace" : "inherit", fontWeight: item.mono ? 700 : 400, fontSize: item.mono ? 15 : 13 }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              {contrat.notes && (
                <div style={{ marginTop: 16, padding: "12px 16px", background: theme.bg, borderRadius: 8 }}>
                  <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
                  <div style={{ color: theme.text, fontSize: 13 }}>{contrat.notes}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Documents + Viewer */}
        <div className="anim-fade-in delay-2" style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
          {/* Sidebar documents */}
          <div style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 16, overflow: "hidden", boxShadow: theme.shadowMd,
          }}>
            <div style={{
              padding: "14px 16px", borderBottom: `1px solid ${theme.border}`,
              color: theme.primary, fontWeight: 700, fontSize: 12,
              textTransform: "uppercase", letterSpacing: "0.05em", background: theme.primaryBg,
            }}>
              Documents ({contrat.documents?.length || 0})
            </div>

            {contrat.documents?.map((doc) => (
              <div key={doc.id} style={{
                borderBottom: `1px solid ${theme.border}`,
                background: selectedDoc?.id === doc.id ? theme.primaryBg : "transparent",
                borderLeft: `3px solid ${selectedDoc?.id === doc.id ? theme.primary : "transparent"}`,
              }}>
                <div
                  onClick={() => handleSelectDoc(doc)}
                  style={{
                    padding: "10px 16px", cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>
                      {typesDocuments[doc.type_document] || doc.type_document}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                      v{doc.version} · {doc.nb_fichiers} fichier(s) · {doc.file_size_kb} Ko
                    </div>
                  </div>
                  {user?.role === "ADMIN" && (
                    <button
                      onClick={(e) => handleDeleteDoc(doc, e)}
                      title="Supprimer ce document"
                      style={{
                        background: "transparent", border: "none",
                        color: theme.danger, cursor: "pointer", fontSize: 13,
                        padding: "2px 4px", opacity: 0.5,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {selectedDoc?.id === doc.id && doc.fichiers?.length > 0 && (
                  <div style={{ borderTop: `1px dashed ${theme.border}`, background: theme.bg }}>
                    {doc.fichiers.map((file, index) => (
                      <div
                        key={file.id}
                        onClick={() => loadFile(file)}
                        style={{
                          padding: "8px 16px 8px 24px", cursor: "pointer",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: selectedFile?.id === file.id ? `${theme.primary}18` : "transparent",
                          borderLeft: `3px solid ${selectedFile?.id === file.id ? theme.primaryLight : "transparent"}`,
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: theme.textMuted, fontSize: 11 }}>
                            {file.mime_type?.includes("pdf") ? "📄" : "🖼️"}
                          </span>
                          <div>
                            <div style={{ color: theme.text, fontSize: 12, fontWeight: selectedFile?.id === file.id ? 600 : 400 }}>
                              Page {index + 1}
                            </div>
                            <div style={{ color: theme.textMuted, fontSize: 10 }}>{file.file_size_kb} Ko</div>
                          </div>
                        </div>
                        {user?.role === "ADMIN" && (
                          <button
                            onClick={(e) => handleDeleteFile(file, e)}
                            style={{
                              background: "transparent", border: "none",
                              color: theme.danger, cursor: "pointer", fontSize: 11, opacity: 0.5,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
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

            {contrat.documents?.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                Aucun document
              </div>
            )}

            {/* Upload ADMIN */}
            {user?.role === "ADMIN" && (
              <div style={{
                padding: 16, borderTop: `1px solid ${theme.border}`, background: theme.bg,
              }}>
                <div style={{ color: theme.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Ajouter un document
                </div>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  style={{
                    width: "100%", border: `1px solid ${theme.border}`, borderRadius: 8,
                    padding: "7px 10px", fontSize: 12, color: theme.text,
                    background: theme.surface, marginBottom: 8, outline: "none",
                  }}
                >
                  {typesDocumentsList.map((t) => (
                    <option key={t.code} value={t.code}>{t.nom}</option>
                  ))}
                </select>
                <label style={{
                  display: "block", width: "100%",
                  background: uploading ? `${theme.primary}88` : theme.primary,
                  color: "#fff", borderRadius: 6, padding: "8px", textAlign: "center",
                  fontSize: 12, fontWeight: 700,
                  cursor: uploading ? "not-allowed" : "pointer", boxSizing: "border-box",
                }}>
                  {uploading ? "Upload en cours..." : "📎 Choisir fichier(s)"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff"
                    onChange={handleUpload}
                    style={{ display: "none" }}
                    disabled={uploading}
                    multiple
                  />
                </label>
                <div style={{ color: theme.textMuted, fontSize: 10, marginTop: 6, textAlign: "center" }}>
                  Maintenez Ctrl pour sélectionner plusieurs fichiers
                </div>
              </div>
            )}
          </div>

          {/* Viewer */}
          <div style={{
            background: theme.surface, border: `1px solid ${theme.border}`,
            borderRadius: 16, overflow: "hidden", boxShadow: theme.shadowMd,
            minHeight: 600, display: "flex", flexDirection: "column",
          }}>
            {selectedFile ? (
              <>
                <div style={{
                  padding: "14px 20px", borderBottom: `1px solid ${theme.border}`,
                  background: theme.primaryBg, display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: theme.text, fontWeight: 700, fontSize: 14 }}>
                      {typesDocuments[selectedDoc?.type_document] || selectedDoc?.type_document}
                    </span>
                    <span style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 8 }}>
                      {selectedFile.file_size_kb} Ko
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {selectedDoc?.fichiers?.length > 1 && (
                      <div style={{ display: "flex", gap: 4 }}>
                        {selectedDoc.fichiers.map((file, index) => (
                          <button
                            key={file.id}
                            onClick={() => loadFile(file)}
                            style={{
                              background: selectedFile.id === file.id ? theme.primary : theme.primaryBg,
                              border: `1px solid ${theme.border}`,
                              color: selectedFile.id === file.id ? "#fff" : theme.primary,
                              borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
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
                  <div style={{
                    flex: 1, display: "flex", alignItems: "center",
                    justifyContent: "center", color: theme.textSecondary,
                  }}>
                    Chargement...
                  </div>
                ) : docUrl ? (
                  <SecureDocViewer
                    url={docUrl}
                    mimeType={selectedFile?.mime_type}
                    fileName={selectedFile?.file_name}
                  />
                ) : (
                  <div style={{
                    flex: 1, display: "flex", alignItems: "center",
                    justifyContent: "center", color: theme.danger,
                  }}>
                    Impossible de charger le fichier.
                  </div>
                )}
              </>
            ) : (
              <div style={{
                flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", color: theme.textMuted,
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: 14 }}>
                  Sélectionnez un document pour le visualiser
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContratDetail;

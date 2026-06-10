import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import SecureDocViewer from "../components/SecureDocViewer";

const STATUT_COLORS = {
  actif: { bg: theme.primaryBg, border: theme.primaryBorder, color: theme.primary },
  termine: { bg: "#F5F5F5", border: "#BDBDBD", color: "#616161" },
  suspendu: { bg: theme.dangerBg, border: theme.dangerBorder, color: theme.danger },
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
  const [quickUploadingCode, setQuickUploadingCode] = useState(null);

  useEffect(() => {
    fetchTypesDocuments();
    fetchContrat();
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
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Fil d'ariane */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <button
            onClick={() => navigate("/employees")}
            style={{
              background: "transparent", border: `1px solid ${theme.primaryBorder}`,
              color: theme.textSecondary, padding: "6px 14px", borderRadius: 6,
              cursor: "pointer", fontSize: 13,
            }}
          >
            ← Employés
          </button>
          <span style={{ color: theme.textMuted, fontSize: 13 }}>›</span>
          <button
            onClick={() => navigate(`/employees/${contrat.employee_id}`)}
            style={{
              background: "transparent", border: `1px solid ${theme.primaryBorder}`,
              color: theme.textSecondary, padding: "6px 14px", borderRadius: 6,
              cursor: "pointer", fontSize: 13,
            }}
          >
            {contrat.employee_matricule} — {contrat.employee_nom}
          </button>
          <span style={{ color: theme.textMuted, fontSize: 13 }}>›</span>
          <span style={{ color: theme.primary, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>
            {contrat.numero_contrat}
          </span>
        </div>

        {message && (
          <div style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 13, fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {/* Infos contrat */}
        <div style={{
          background: theme.surface, border: `1px solid ${theme.primaryBorder}`,
          borderRadius: 12, padding: 24, marginBottom: 24, boxShadow: theme.shadow,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.primaryBorder}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: theme.primaryBg, border: `2px solid ${theme.primaryBorder}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: theme.primary, fontWeight: 800, fontSize: 18,
              }}>
                📋
              </div>
              <div>
                <div style={{ color: theme.text, fontWeight: 800, fontSize: 18 }}>
                  Contrat {contrat.numero_contrat}
                </div>
                <div style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {contrat.employee_matricule} — {contrat.employee_nom}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                background: statutStyle.bg, border: `1px solid ${statutStyle.border}`,
                color: statutStyle.color, borderRadius: 6, padding: "4px 12px",
                fontSize: 12, fontWeight: 600,
              }}>
                {contrat.statut}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
            {[
              { label: "N° Contrat", value: contrat.numero_contrat, mono: true },
              { label: "Type de contrat", value: contrat.type_contrat_nom || "—" },
              { label: "Date début", value: contrat.date_debut || "—" },
              { label: "Date fin", value: contrat.date_fin || "—" },
              { label: "Documents", value: `${contrat.nb_documents} fichier(s)` },
            ].map((item) => (
              <div key={item.label}>
                <div style={{
                  color: theme.textMuted, fontSize: 11, textTransform: "uppercase",
                  letterSpacing: "0.05em", marginBottom: 4,
                }}>
                  {item.label}
                </div>
                <div style={{
                  color: item.mono ? theme.primary : theme.text,
                  fontFamily: item.mono ? "monospace" : "inherit",
                  fontWeight: item.mono ? 700 : 400,
                  fontSize: item.mono ? 15 : 13,
                }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {contrat.notes && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: theme.bg, borderRadius: 8 }}>
              <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", marginBottom: 4 }}>
                Notes
              </div>
              <div style={{ color: theme.text, fontSize: 13 }}>{contrat.notes}</div>
            </div>
          )}
        </div>

        {/* Documents + Viewer */}
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
          {/* Sidebar documents */}
          <div style={{
            background: theme.surface, border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12, overflow: "hidden", boxShadow: theme.shadow,
          }}>
            <div style={{
              padding: "14px 16px", borderBottom: `1px solid ${theme.primaryBorder}`,
              color: theme.primary, fontWeight: 700, fontSize: 12,
              textTransform: "uppercase", letterSpacing: "0.05em", background: theme.primaryBg,
            }}>
              Documents ({contrat.documents?.length || 0})
            </div>

            {contrat.documents?.map((doc) => (
              <div key={doc.id} style={{
                borderBottom: `1px solid ${theme.primaryBorder}`,
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
                  <div style={{ borderTop: `1px dashed ${theme.primaryBorder}`, background: theme.bg }}>
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
                padding: 16, borderTop: `2px solid ${theme.primaryBorder}`, background: theme.bg,
              }}>
                <div style={{ color: theme.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                  Ajouter un document
                </div>
                <select
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
                  style={{
                    width: "100%", border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
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
            background: theme.surface, border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 12, overflow: "hidden", boxShadow: theme.shadow,
            minHeight: 600, display: "flex", flexDirection: "column",
          }}>
            {selectedFile ? (
              <>
                <div style={{
                  padding: "14px 20px", borderBottom: `1px solid ${theme.primaryBorder}`,
                  background: theme.primaryBg, display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <span style={{ color: theme.text, fontWeight: 700, fontSize: 14 }}>
                      {typesDocuments[selectedDoc?.type_document] || selectedDoc?.type_document}
                    </span>
                    <span style={{ color: theme.textSecondary, fontSize: 12, marginLeft: 8 }}>
                      — {selectedFile.file_name}
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
                              border: `1px solid ${theme.primaryBorder}`,
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

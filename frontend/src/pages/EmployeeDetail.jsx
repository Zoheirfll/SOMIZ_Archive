import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

const TYPE_LABELS = {
  CNI: "Carte Nationale d'Identité",
  CONTRAT: "Contrat de Travail",
  RESIDENCE: "Justificatif de Résidence",
  FICHE_IEP: "Fiche IEP",
  DOSSIER_MED: "Dossier Médical",
  DIPLOME: "Diplôme(s)",
  PHOTO: "Photo d'identité",
  AUTRE: "Document divers",
};

const EmployeeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState("CNI");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchEmployee();
  }, [id]);

  useEffect(() => {
    return () => {
      if (docUrl) URL.revokeObjectURL(docUrl);
    };
  }, [docUrl]);

  const fetchEmployee = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/employees/${id}/`, {
        params: { no_log: true },
      });
      setEmployee(response.data);
      if (response.data.documents?.length > 0) {
        loadDocument(response.data.documents[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadDocument = async (doc) => {
    setSelectedDoc(doc);
    setDocLoading(true);
    setDocUrl(null);
    try {
      const response = await api.get(`/documents/${doc.id}/view/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      setDocUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDocLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type_document", uploadType);
    try {
      await api.post(`/employees/${id}/documents/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({ type: "success", text: "Document uploadé avec succès." });
      fetchEmployee();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.file?.[0] || "Erreur lors de l'upload.",
      });
    } finally {
      setUploading(false);
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

  // Tous les champs à afficher — ajout/suppression ici sans toucher au JSX
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
        {/* Retour */}
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

        {/* Message succès / erreur */}
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
          {/* En-tête de la carte */}
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
              {/* Barre de complétude */}
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

          {/* Grille des champs */}
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

        {/* Contenu principal : liste docs + viewer */}
        <div
          style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}
        >
          {/* Sidebar documents */}
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
                onClick={() => loadDocument(doc)}
                style={{
                  padding: "12px 16px",
                  cursor: "pointer",
                  borderBottom: `1px solid ${theme.primaryBorder}`,
                  background:
                    selectedDoc?.id === doc.id
                      ? theme.primaryBg
                      : "transparent",
                  borderLeft: `3px solid ${selectedDoc?.id === doc.id ? theme.primary : "transparent"}`,
                  transition: "all 0.15s",
                }}
              >
                <div
                  style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}
                >
                  {TYPE_LABELS[doc.type_document] || doc.type_document}
                </div>
                <div
                  style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}
                >
                  v{doc.version} · {doc.file_size_kb} Ko ·{" "}
                  {new Date(doc.uploaded_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
            ))}

            {/* Documents manquants */}
            {employee.documents_manquants?.map((doc) => (
              <div
                key={doc.code}
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${theme.primaryBorder}`,
                  background: "#FAFAFA",
                }}
              >
                <div style={{ color: theme.textMuted, fontSize: 13 }}>
                  {doc.required && (
                    <span style={{ color: theme.danger, marginRight: 4 }}>
                      *
                    </span>
                  )}
                  {doc.label}
                </div>
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginTop: 2,
                    fontStyle: "italic",
                  }}
                >
                  Non uploadé
                </div>
              </div>
            ))}

            {/* Upload — ADMIN uniquement */}
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
                  {Object.entries(TYPE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
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
                  {uploading ? "Upload en cours..." : "📎 Choisir un fichier"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.tiff"
                    onChange={handleUpload}
                    style={{ display: "none" }}
                    disabled={uploading}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Viewer inline */}
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
            {selectedDoc ? (
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
                  <span
                    style={{ color: theme.text, fontWeight: 700, fontSize: 14 }}
                  >
                    {TYPE_LABELS[selectedDoc.type_document]}
                  </span>
                  <span style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Version {selectedDoc.version} · {selectedDoc.file_size_kb}{" "}
                    Ko
                  </span>
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
                    Chargement du document...
                  </div>
                ) : docUrl ? (
                  <iframe
                    src={docUrl}
                    style={{
                      flex: 1,
                      border: "none",
                      width: "100%",
                      minHeight: 550,
                    }}
                    title={selectedDoc.type_document}
                    onContextMenu={(e) => e.preventDefault()}
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
                    Impossible de charger le document.
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
        </div>
      </div>
    </div>
  );
};

export default EmployeeDetail;

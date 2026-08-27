import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import SecureDocViewer from "../components/SecureDocViewer";
import EmployeeAvatar from "../components/EmployeeAvatar";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import ScanImportModal from "../components/ScanImportModal";
import { TrashIcon, PencilIcon, PaperclipIcon, FileTextIcon, ImageIcon, Spinner, TagIcon } from "../components/icons";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";

// Nom de fichier sans l'extension — l'utilisateur voit "Acte de naissance",
// pas "Acte de naissance.png" (le type/mime reste géré côté serveur).
const stripExt = (name) => {
  if (!name) return name;
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
};

// file_size_kb vient du backend en Ko — affiché en Mo pour rester lisible
// sur des documents scannés qui font souvent plusieurs Mo.
const formatSizeMo = (kb) => {
  if (kb === null || kb === undefined) return "";
  return `${(kb / 1024).toFixed(2)} Mo`;
};

// Date + heure d'upload d'un fichier (ex. "27/08/2026 13:30").
const formatDateTime = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const EmployeeDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const isMobile = useIsMobile();

  const [employee, setEmployee] = useState(null);
  const [contrats, setContrats] = useState([]);
  const [selectedContratId, setSelectedContratId] = useState(null);
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "dossier",
  );
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showScanImport, setShowScanImport] = useState(false);
  const [uploadType, setUploadType] = useState("");
  const [message, setMessage] = useState(null);
  const [typesDocuments, setTypesDocuments] = useState({});
  const [typesDocumentsList, setTypesDocumentsList] = useState([]);
  const [quickUploadingCode, setQuickUploadingCode] = useState(null);
  const [showNewContratForm, setShowNewContratForm] = useState(false);
  const [newContrat, setNewContrat] = useState({
    numero_contrat: "",
    type_contrat: "",
    date_debut: "",
    date_fin: "",
    statut: "actif",
    notes: "",
  });
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
      // Seuls les types "feuilles" sont uploadables — une catégorie
      // (ex. "État civil") ne sert qu'à regrouper visuellement.
      const uploadable = types.filter((t) => !t.is_categorie);
      setTypesDocumentsList(uploadable);
      if (uploadable.length > 0) setUploadType(uploadable[0].code);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchContrats = async () => {
    try {
      const response = await api.get(`/employees/${id}/contrats/`);
      setContrats(response.data);
      if (response.data.length > 0) {
        const dernierContrat = sortContratsByDate(response.data).at(-1);
        // Ne seed selectedContratId que s'il n'est pas déjà défini (première charge)
        setSelectedContratId((prev) => prev ?? dernierContrat.id);
      }
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

  // Trier les contrats par date_debut (croissant) puis par id (tie-break)
  const sortContratsByDate = (contractsList) => {
    return [...contractsList].sort((a, b) => {
      const dateA = new Date(a.date_debut || 0);
      const dateB = new Date(b.date_debut || 0);
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }
      // Tie-break: compare by id (string comparison)
      return String(a.id).localeCompare(String(b.id));
    });
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
      setNewContrat({
        numero_contrat: "",
        type_contrat: "",
        date_debut: "",
        date_fin: "",
        statut: "actif",
        notes: "",
      });
      fetchContrats();
    } catch (err) {
      const detail =
        err.response?.data?.numero_contrat?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        "Erreur lors de la création.";
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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      await api.post(`/employees/${id}/photo/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchEmployee();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Impossible d'uploader la photo.",
      });
    } finally {
      setUploadingPhoto(false);
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

  // Sélectionne par défaut le premier document du contrat/dossier
  // actuellement affiché (pas juste le tout premier document de
  // l'employé, tous contrats confondus) — évite d'ouvrir un fichier
  // d'un ancien contrat alors que l'onglet du contrat récent est actif.
  useEffect(() => {
    if (!employee) return;
    const filtered = (employee.documents || []).filter(
      (doc) => !doc.contrat || doc.contrat === selectedContratId,
    );
    if (filtered.length > 0) {
      setSelectedDoc(filtered[0]);
      if (filtered[0].fichiers?.length > 0) {
        loadFile(filtered[0].fichiers[0]);
      } else {
        setSelectedFile(null);
        setDocUrl(null);
      }
    } else {
      setSelectedDoc(null);
      setSelectedFile(null);
      setDocUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, selectedContratId]);

  // Calcule une position d'affichage STABLE pour les documents présents ET
  // manquants combinés, basée sur l'ordre configuré du type (Paramètres >
  // Types de documents) — jamais sur la date d'upload. Un document qui
  // passe de "manquant" à "présent" garde exactement la même place dans la
  // liste, il change juste d'apparence (plus de saut visuel en haut).
  // Chaque catégorie (ex. "État civil") partage l'ordre de sa catégorie
  // parente, donc tous ses enfants restent groupés ensemble, présents et
  // manquants confondus. On applique ensuite ce classement via CSS `order`
  // (flex) plutôt qu'en réordonnant le DOM, pour ne pas toucher au reste du
  // rendu de chaque ligne.
  const buildDocOrder = (presentDocs, missingDocs) => {
    const rows = [
      ...presentDocs.map((d) => ({
        key: `p-${d.id}`,
        parentLabel: d.type_document_parent || null,
        sortKey: d.ordre ?? 0,
        subKey: d.type_ordre ?? 0,
      })),
      ...missingDocs.map((d) => ({
        key: `m-${d.code}`,
        parentLabel: d.parent_nom || null,
        sortKey: d.ordre ?? 0,
        subKey: d.type_ordre ?? 0,
      })),
    ];
    rows.sort((a, b) => a.sortKey - b.sortKey || a.subKey - b.subKey);

    const orderMap = new Map();
    const headerBefore = new Map();
    const groupEnd = new Set();
    rows.forEach((row, i) => {
      orderMap.set(row.key, i);
      const prev = rows[i - 1];
      const next = rows[i + 1];
      if (row.parentLabel && (!prev || prev.parentLabel !== row.parentLabel)) {
        headerBefore.set(row.key, row.parentLabel);
      }
      if (row.parentLabel && (!next || next.parentLabel !== row.parentLabel)) {
        groupEnd.add(row.key);
      }
    });
    return { orderMap, headerBefore, groupEnd };
  };

  // "Boîte" de catégorie : fond ambré continu + bordure gauche/droite sur
  // l'en-tête ET chaque ligne du groupe (via categoryRowStyle ci-dessous),
  // pour que la catégorie se lise comme un vrai dossier distinct plutôt que
  // de se fondre avec les éléments non groupés au-dessus/en-dessous.
  const categoryHeaderStyle = {
    marginTop: 8,
    padding: "7px 16px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#FFFBEB",
    border: "1px solid #FDE68A",
    borderBottom: "none",
    borderRadius: "8px 8px 0 0",
    color: theme.warning,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const categoryRowExtraStyle = {
    background: "#FFFDF7",
    borderRight: "1px solid #FDE68A",
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
    files.forEach((file) => formData.append("files", file));

    const url = selectedContratId
      ? `/contrats/${selectedContratId}/documents/`
      : `/employees/${id}/documents/`;

    try {
      await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({
        type: "success",
        text: `${files.length} fichier(s) uploadé(s) avec succès.`,
      });
      fetchEmployee();
      fetchContrats();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.files?.[0] || "Erreur lors de l'upload.",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDeleteFile = async (file, e) => {
    e.stopPropagation();
    if (!(await confirm(`Supprimer "${file.file_name}" ?`))) return;
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

  const handleRenameFile = async (file, e) => {
    e?.stopPropagation();
    const dotIndex = (file.file_name || "").lastIndexOf(".");
    const baseName = dotIndex > 0 ? file.file_name.slice(0, dotIndex) : file.file_name || "";
    const ext = dotIndex > 0 ? file.file_name.slice(dotIndex) : "";
    const newBaseName = await prompt("Nouveau nom du fichier :", baseName);
    if (newBaseName === null || !newBaseName || newBaseName === baseName) return;
    const newName = `${newBaseName}${ext}`;
    try {
      await api.patch(`/files/${file.id}/`, { file_name: newName });
      setMessage({ type: "success", text: "Fichier renommé." });
      fetchEmployee();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Erreur lors du renommage.",
      });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  // Renomme un fichier d'après le libellé de son type de document
  // ("Acte de naissance" au lieu du nom technique du scan), en un clic.
  const handleAutoRenameFile = async (file, label, e) => {
    e?.stopPropagation();
    if (!label) return;
    const dotIndex = (file.file_name || "").lastIndexOf(".");
    const ext = dotIndex > 0 ? file.file_name.slice(dotIndex) : "";
    const newName = `${label}${ext}`;
    if (newName === file.file_name) return;
    try {
      await api.patch(`/files/${file.id}/`, { file_name: newName });
      setMessage({ type: "success", text: "Fichier renommé." });
      fetchEmployee();
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Erreur lors du renommage.",
      });
    } finally {
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const handleDeleteDoc = async (doc, e) => {
    e.stopPropagation();
    const nomType = typesDocuments[doc.type_document] || doc.type_document;
    if (
      !(await confirm(
        `Supprimer tout le dossier "${nomType} v${doc.version}" et ses ${doc.nb_fichiers} fichier(s) ?`,
      ))
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
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={120} radius={16} style={{ marginBottom: 24 }} />
          <Skeleton height={300} radius={16} />
        </div>
      </PageBackground>
    );

  if (!employee) return null;

  const infoFields = [
    { label: "Matricule", value: employee.matricule, mono: true },
    {
      label: "N° Contrat",
      value: contrats[0]?.numero_contrat || "—",
      mono: true,
    },
    {
      label: "Nom & Prénom",
      value: `${employee.nom} ${employee.prenom}`,
      bold: true,
    },
    { label: "Date de naissance", value: employee.date_naissance || "—" },
    { label: "Date de recrutement", value: employee.date_embauche || "—" },
    { label: "Statut", value: employee.statut, badge: true },
    { label: "Direction", value: employee.direction_nom || "—" },
    { label: "Département", value: employee.departement_nom || "—" },
    { label: "Service", value: employee.service_nom || "—" },
    ...(employee.cellule_nom
      ? [{ label: "Cellule", value: employee.cellule_nom }]
      : []),
    { label: "Fonction", value: employee.poste_nom || "—" },
    { label: "Type de contrat", value: employee.type_contrat_nom || "—" },
    { label: "Catégorie", value: employee.categorie_nom || "—" },
    ...(employee.champs_personnalises || []).map((c) => ({
      label: c.nom,
      value: c.valeur || "—",
    })),
  ];

  const documentsAffiches = (employee.documents || []).filter(
    (doc) => !doc.contrat || doc.contrat === selectedContratId,
  );

  const { orderMap: docOrderMap, headerBefore: docHeaderBefore, groupEnd: docGroupEnd } =
    buildDocOrder(documentsAffiches, employee.documents_manquants || []);

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 20px" : "28px 32px 32px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <button onClick={() => navigate(-1)} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
            ← Retour
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
              <EmployeeAvatar employee={employee} size={96} fontSize={32} light shape="square" />
              {user?.role === "ADMIN" && (
                <label
                  aria-label="Changer la photo"
                  style={{
                    position: "absolute",
                    bottom: -6,
                    right: -6,
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: theme.primary,
                    border: "2px solid #0d3b1f",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: uploadingPhoto ? "wait" : "pointer",
                    fontSize: 13,
                  }}
                >
                  {uploadingPhoto ? "…" : "✎"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoChange}
                    disabled={uploadingPhoto}
                    style={{ display: "none" }}
                  />
                </label>
              )}
            </div>
            <div>
              <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                {employee.prenom} {employee.nom}
              </h1>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{employee.matricule}</span>
                {contrats.length > 0 && (
                  <><span style={{ opacity: 0.5 }}>·</span>
                  <span style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.4)" }} onClick={() => navigate(`/contrats/${contrats[0].id}`)}>
                    {contrats[0].numero_contrat}
                  </span></>
                )}
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ background: employee.statut === "actif" ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.25)", border: `1px solid ${employee.statut === "actif" ? "rgba(74,222,128,0.4)" : "rgba(239,68,68,0.4)"}`, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                  {employee.statut}
                </span>
              </div>
            </div>
            <div style={{ marginLeft: isMobile ? 0 : "auto", textAlign: isMobile ? "left" : "right" }}>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 4 }}>Complétude dossier</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 120, background: "rgba(255,255,255,0.15)", borderRadius: 4, height: 6 }}>
                  <div style={{ height: "100%", width: `${employee.taux_completude}%`, background: employee.taux_completude === 100 ? "#4ade80" : employee.taux_completude >= 50 ? "#fbbf24" : "#f87171", borderRadius: 4, transition: "width 0.5s ease" }} />
                </div>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{employee.taux_completude}%</span>
              </div>
              {user?.role === "ADMIN" && (
                <button onClick={() => navigate(`/employees/${id}/modifier`)} className="btn-lift" style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Modifier
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "24px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {message && (
          <div className="notif-banner" style={{ background: message.type === "success" ? theme.primaryBg : theme.dangerBg, border: `1px solid ${message.type === "success" ? theme.border : theme.dangerBorder}`, color: message.type === "success" ? theme.primary : theme.danger, borderRadius: 10, padding: "10px 16px", marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            {message.text}
          </div>
        )}

        {/* Infos employé */}
        <div className="anim-slide-up" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: theme.shadowMd }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>Informations</span>
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
                      border: `1px solid ${employee.statut === "actif" ? theme.border : theme.dangerBorder}`,
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
            {
              key: "dossier",
              label: `Dossier (${employee.documents?.length || 0})`,
            },
            { key: "contrats", label: `Contrats (${contrats.length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background:
                  activeTab === tab.key ? theme.primary : theme.surface,
                border: `1px solid ${activeTab === tab.key ? theme.primary : theme.border}`,
                color: activeTab === tab.key ? "#fff" : theme.text,
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Onglet Contrats */}
        {activeTab === "contrats" && (
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
              {user?.role === "ADMIN" && (
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
        )}

        {/* Documents + Viewer */}
        {activeTab === "dossier" && (
          <div
            className="tab-content"
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "340px 1fr",
              gap: 20,
            }}
          >
            {/* Sidebar */}
            <div
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: theme.shadow,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  order: -2,
                  padding: "14px 16px",
                  borderBottom: `1px solid ${theme.border}`,
                  color: theme.primary,
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: theme.primaryBg,
                }}
              >
                Documents ({documentsAffiches.length})
              </div>

              {contrats.length > 0 && (
                <div
                  style={{
                    order: -1,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${theme.border}`,
                    background: theme.bg,
                  }}
                >
                  {sortContratsByDate(contrats).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={selectedContratId === c.id}
                        onClick={() => setSelectedContratId(c.id)}
                        style={{
                          background: selectedContratId === c.id ? theme.primary : theme.surface,
                          border: `1px solid ${selectedContratId === c.id ? theme.primary : theme.border}`,
                          color: selectedContratId === c.id ? "#fff" : theme.text,
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "monospace",
                          cursor: "pointer",
                        }}
                      >
                        {c.numero_contrat}
                      </button>
                    ))}
                </div>
              )}

              {/* Documents présents */}
              {documentsAffiches.map((doc) => (
                <div key={doc.id} style={{ order: docOrderMap.get(`p-${doc.id}`) ?? 0 }}>
                {docHeaderBefore.get(`p-${doc.id}`) && (
                  <div style={categoryHeaderStyle}>📁 {docHeaderBefore.get(`p-${doc.id}`)}</div>
                )}
                <div
                  style={{
                    borderBottom: `1px solid ${doc.type_document_parent ? "#FDE68A" : theme.border}`,
                    borderLeft: `3px solid ${selectedDoc?.id === doc.id ? theme.primary : "transparent"}`,
                    ...(doc.type_document_parent ? categoryRowExtraStyle : {}),
                    background: selectedDoc?.id === doc.id
                      ? theme.primaryBg
                      : doc.type_document_parent ? "#FFFDF7" : "transparent",
                    ...(docGroupEnd.has(`p-${doc.id}`)
                      ? { borderRadius: "0 0 8px 8px", borderBottom: "1px solid #FDE68A", marginBottom: 10 }
                      : {}),
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {typesDocuments[doc.type_document] || doc.type_document}
                        </span>
                        {doc.contrat && (() => {
                          const c = contrats.find((c) => c.id === doc.contrat);
                          return c ? (
                            <span style={{
                              background: theme.primaryBg, border: `1px solid ${theme.border}`,
                              color: theme.primary, borderRadius: 4, padding: "1px 7px",
                              fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                            }}>
                              {c.numero_contrat}
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    {user?.role === "ADMIN" && (
                      <button
                        onClick={(e) => handleDeleteDoc(doc, e)}
                        title="Supprimer ce document"
                        aria-label="Supprimer ce document"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: theme.danger,
                          cursor: "pointer",
                          display: "flex",
                          padding: "2px 4px",
                          opacity: 0.5,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.opacity = 1)
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.opacity = 0.5)
                        }
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>

                  {/* Fichiers du document — affichés si document sélectionné */}
                  {selectedDoc?.id === doc.id && doc.fichiers?.length > 0 && (
                    <div
                      style={{
                        borderTop: `1px dashed ${theme.border}`,
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
                              style={{ color: theme.textMuted, fontSize: 11, display: "flex" }}
                            >
                              {file.mime_type?.includes("pdf") ? <FileTextIcon size={13} /> : <ImageIcon size={13} />}
                            </span>
                            <div>
                              <div
                                title={file.file_name}
                                style={{
                                  color: theme.text,
                                  fontSize: 12,
                                  fontWeight:
                                    selectedFile?.id === file.id ? 600 : 400,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  maxWidth: 210,
                                }}
                              >
                                {stripExt(file.file_name) || `Page ${index + 1}`}
                              </div>
                            </div>
                          </div>
                          {user?.role === "ADMIN" && (
                            <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={(e) => handleAutoRenameFile(file, typesDocuments[doc.type_document] || doc.type_document, e)}
                              title="Renommer d'après le type de document"
                              aria-label="Renommer d'après le type de document"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.textSecondary,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                            >
                              <TagIcon size={12} />
                            </button>
                            <button
                              onClick={(e) => handleRenameFile(file, e)}
                              title="Renommer ce fichier"
                              aria-label="Renommer ce fichier"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.textSecondary,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.opacity = 1)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.opacity = 0.5)
                              }
                            >
                              <PencilIcon size={12} />
                            </button>
                            <button
                              onClick={(e) => handleDeleteFile(file, e)}
                              title="Supprimer ce fichier"
                              aria-label="Supprimer ce fichier"
                              style={{
                                background: "transparent",
                                border: "none",
                                color: theme.danger,
                                cursor: "pointer",
                                display: "flex",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.opacity = 1)
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.opacity = 0.5)
                              }
                            >
                              <TrashIcon size={12} />
                            </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                </div>
              ))}

              {/* Documents manquants */}
              {(employee.documents_manquants || []).map((doc) => (
                <div key={doc.code} style={{ order: docOrderMap.get(`m-${doc.code}`) ?? 0 }}>
                {docHeaderBefore.get(`m-${doc.code}`) && (
                  <div style={categoryHeaderStyle}>📁 {docHeaderBefore.get(`m-${doc.code}`)}</div>
                )}
                <div
                  style={{
                    padding: "10px 16px",
                    borderBottom: `1px solid ${doc.parent_nom ? "#FDE68A" : theme.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    ...(doc.parent_nom ? categoryRowExtraStyle : {}),
                    background: doc.parent_nom ? "#FFFDF7" : "#FAFAFA",
                    ...(docGroupEnd.has(`m-${doc.code}`)
                      ? { borderRadius: "0 0 8px 8px", borderBottom: "1px solid #FDE68A", marginBottom: 10 }
                      : {}),
                  }}
                >
                  <div>
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
                  {user?.role === "ADMIN" && (
                    <label
                      title={`Uploader ${doc.label}`}
                      aria-label={`Uploader ${doc.label}`}
                      style={{
                        background:
                          quickUploadingCode === doc.code
                            ? `${theme.primary}88`
                            : theme.primaryBg,
                        border: `1px solid ${theme.border}`,
                        color: theme.primary,
                        borderRadius: 6,
                        padding: "4px 8px",
                        display: "flex",
                        alignItems: "center",
                        cursor:
                          quickUploadingCode === doc.code
                            ? "not-allowed"
                            : "pointer",
                        flexShrink: 0,
                      }}
                    >
                      {quickUploadingCode === doc.code ? <Spinner size={13} /> : <PaperclipIcon size={13} />}
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
                          const typeDoc = typesDocumentsList.find(
                            (t) => t.code === doc.code,
                          );
                          const formData = new FormData();
                          formData.append("type_doc", typeDoc?.id || doc.code);
                          files.forEach((f) => formData.append("files", f));
                          try {
                            await api.post(
                              `/employees/${id}/documents/`,
                              formData,
                              {
                                headers: {
                                  "Content-Type": "multipart/form-data",
                                },
                              },
                            );
                            setMessage({
                              type: "success",
                              text: `${doc.label} uploadé avec succès.`,
                            });
                            fetchEmployee();
                          } catch (err) {
                            setMessage({
                              type: "error",
                              text:
                                err.response?.data?.files?.[0] ||
                                "Erreur lors de l'upload.",
                            });
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
                </div>
              ))}

              {/* Upload ADMIN */}
              {user?.role === "ADMIN" && (
                <div
                  style={{
                    order: 999999,
                    padding: 16,
                    borderTop: `2px solid ${theme.border}`,
                    background: theme.bg,
                  }}
                >
                  <button
                    onClick={() => setShowScanImport(true)}
                    className="btn-lift"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      width: "100%",
                      background: theme.surface,
                      color: theme.primary,
                      border: `1px solid ${theme.primaryBorder}`,
                      borderRadius: 6,
                      padding: "8px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      marginBottom: 12,
                    }}
                  >
                    <PaperclipIcon size={13} /> Scanner un dossier
                  </button>
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
                    className="input-focus"
                    style={{
                      width: "100%",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 12,
                      color: theme.text,
                      background: theme.surface,
                      marginBottom: 8,
                      outline: "none",
                    }}
                  >
                    {typesDocumentsList.filter((t) => !t.parent_nom).map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.nom}
                      </option>
                    ))}
                    {Object.entries(
                      typesDocumentsList
                        .filter((t) => t.parent_nom)
                        .reduce((acc, t) => {
                          (acc[t.parent_nom] = acc[t.parent_nom] || []).push(t);
                          return acc;
                        }, {}),
                    ).map(([label, items]) => (
                      <optgroup key={label} label={label}>
                        {items.map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.nom}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
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
                    {uploading ? "Upload en cours..." : <><PaperclipIcon size={13} /> Choisir fichier(s)</>}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      onChange={handleUpload}
                      style={{ display: "none" }}
                      disabled={uploading}
                      multiple
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
                border: `1px solid ${theme.border}`,
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
                      borderBottom: `1px solid ${theme.border}`,
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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 3,
                        }}
                      >
                        <span
                          title={selectedFile.file_name}
                          style={{
                            color: theme.textSecondary,
                            fontSize: 12,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 260,
                          }}
                        >
                          {stripExt(selectedFile.file_name)}
                        </span>
                        {user?.role === "ADMIN" && (
                          <button
                            onClick={(e) => handleAutoRenameFile(selectedFile, typesDocuments[selectedDoc?.type_document] || selectedDoc?.type_document, e)}
                            title="Renommer d'après le type de document"
                            aria-label="Renommer d'après le type de document"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.textSecondary,
                              cursor: "pointer",
                              display: "flex",
                              opacity: 0.6,
                              padding: 0,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                          >
                            <TagIcon size={12} />
                          </button>
                        )}
                        {user?.role === "ADMIN" && (
                          <button
                            onClick={(e) => handleRenameFile(selectedFile, e)}
                            title="Renommer ce fichier"
                            aria-label="Renommer ce fichier"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: theme.textSecondary,
                              cursor: "pointer",
                              display: "flex",
                              opacity: 0.6,
                              padding: 0,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
                          >
                            <PencilIcon size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      {/* Onglets fichiers */}
                      {selectedDoc?.fichiers?.length > 1 && (
                        <div style={{ display: "flex", gap: 6 }}>
                          {selectedDoc.fichiers.map((file, index) => (
                            <button
                              key={file.id}
                              onClick={() => loadFile(file)}
                              title={file.file_name}
                              style={{
                                background:
                                  selectedFile.id === file.id
                                    ? theme.primary
                                    : theme.primaryBg,
                                border: `1px solid ${theme.border}`,
                                color:
                                  selectedFile.id === file.id
                                    ? "#fff"
                                    : theme.primary,
                                borderRadius: 6,
                                padding: "4px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {stripExt(file.file_name) || `Page ${index + 1}`}
                            </button>
                          ))}
                        </div>
                      )}
                      <span
                        style={{ color: theme.textSecondary, fontSize: 12 }}
                      >
                        {formatSizeMo(selectedFile.file_size_kb)} · {formatDateTime(selectedFile.uploaded_at)}
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
                  <div style={{ marginBottom: 16 }}><FileTextIcon size={48} /></div>
                  <div style={{ fontSize: 14 }}>
                    Sélectionnez un document pour le visualiser
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
      {showScanImport && (
        <ScanImportModal
          employeeId={id}
          typesDocumentsList={typesDocumentsList}
          onClose={() => setShowScanImport(false)}
          onImported={() => {
            fetchEmployee();
            fetchContrats();
          }}
        />
      )}
    </PageBackground>
  );
};

export default EmployeeDetail;

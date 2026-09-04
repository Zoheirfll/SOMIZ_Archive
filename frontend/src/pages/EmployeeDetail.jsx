import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import EmployeeAvatar from "../components/EmployeeAvatar";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import InfoNotice from "../components/InfoNotice";
import CarriereTab from "../components/employeeDetail/CarriereTab";
import ContratsTab from "../components/employeeDetail/ContratsTab";
import DossierTab from "../components/employeeDetail/DossierTab";
import { PAGE_NOTICES } from "../config/notices";
import useIsMobile from "../hooks/useIsMobile";


// Regroupe les documents actifs par (type de document, contrat) — depuis
// que l'historique est conservé (2026-08-30), plusieurs versions actives
// du même type peuvent coexister. La version la plus récente reste le
// document affiché normalement dans la liste ; les versions antérieures
// sont attachées en `__history` (triées décroissant) et affichées via un
// lien "Historique" repliable sous la ligne principale.
const groupDocsByVersion = (docs) => {
  const groups = new Map();
  docs.forEach((d) => {
    const key = `${d.type_doc}-${d.contrat || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  const primary = [];
  groups.forEach((arr) => {
    const sorted = [...arr].sort((a, b) => b.version - a.version);
    const [current, ...history] = sorted;
    primary.push({ ...current, __history: history });
  });
  return primary;
};

const EmployeeDetail = () => {
  const theme = useTheme();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const isMobile = useIsMobile();

  const [employee, setEmployee] = useState(null);
  const [adjacent, setAdjacent] = useState({ prev: null, next: null });
  const [contrats, setContrats] = useState([]);
  const [selectedContratId, setSelectedContratId] = useState(null);
  const [activeTab, setActiveTab] = useState(
    searchParams.get("tab") || "dossier",
  );
  const [selectedDoc, setSelectedDoc] = useState(null);
  // Ids des documents dont l'historique (versions antérieures conservées)
  // est déplié dans la sidebar — replié par défaut.
  const [expandedHistory, setExpandedHistory] = useState(() => new Set());
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
  const [historiqueFonctions, setHistoriqueFonctions] = useState([]);
  const [historiqueCategories, setHistoriqueCategories] = useState([]);
  const [historiqueEchelles, setHistoriqueEchelles] = useState([]);
  const [postes, setPostes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [echelles, setEchelles] = useState([]);
  const [managingAxe, setManagingAxe] = useState(null);
  const [newPeriode, setNewPeriode] = useState({
    valeur: "",
    date_debut: "",
    date_fin: "",
  });
  const [highlightedMissingCode, setHighlightedMissingCode] = useState(null);
  const [systemFieldOrder, setSystemFieldOrder] = useState({});
  const missingRowRefs = useRef({});
  const dossierSectionRef = useRef(null);

  useEffect(() => {
    fetchTypesDocuments();
    fetchEmployee();
    fetchContrats();
    fetchTypesContrat();
    fetchHistorique();
    fetchAxeReferentiels();
    fetchSystemFieldOrder();
    fetchAdjacent();
  }, [id]);

  // Navigation Précédent/Suivant triée par N° Contrat — permet de parcourir
  // les employés depuis la fiche sans repasser par la liste (respecte le
  // périmètre de l'utilisateur côté serveur).
  const fetchAdjacent = async () => {
    try {
      const r = await api.get(`/employees/${id}/adjacent/`);
      setAdjacent({ prev: r.data.prev || null, next: r.data.next || null });
    } catch {
      setAdjacent({ prev: null, next: null });
    }
  };

  // Ordre des champs système (Matricule, Fonction...) tel que réglé dans
  // Paramètres > Champs personnalisés (flèches ↑/↓, mélangé avec les
  // champs personnalisés) — voir CLAUDE.md "Champs cliquables".
  const fetchSystemFieldOrder = async () => {
    try {
      const r = await api.get("/ref/system-field-labels/");
      const list = r.data.results || r.data;
      setSystemFieldOrder(Object.fromEntries(list.map((l) => [l.code, l.ordre])));
    } catch {}
  };

  // Doit rester identique à SYSTEM_FIELDS de Parametres.jsx (même ordre par
  // défaut quand aucun réglage manuel n'a encore été fait).
  const SYSTEM_FIELD_CODES_ORDER = [
    "matricule", "numero_contrat", "nom", "prenom", "statut",
    "direction", "pole", "departement", "section", "service", "cellule",
    "poste", "type_contrat", "categorie", "echelle",
    "date_naissance", "date_embauche", "date_debut_contrat", "date_fin_contrat",
  ];
  const defaultSystemOrdre = (code) => {
    const idx = SYSTEM_FIELD_CODES_ORDER.indexOf(code);
    return idx === -1 ? 0 : idx * 10;
  };
  const systemOrdre = (code) => systemFieldOrder[code] ?? defaultSystemOrdre(code);

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

  const fetchHistorique = async (silent = false) => {
    try {
      const [fonctions, categoriesRes, echellesRes] = await Promise.all([
        api.get(`/employees/${id}/historique/fonctions/`),
        api.get(`/employees/${id}/historique/categories/`),
        api.get(`/employees/${id}/historique/echelles/`),
      ]);
      setHistoriqueFonctions(fonctions.data.results || fonctions.data);
      setHistoriqueCategories(categoriesRes.data.results || categoriesRes.data);
      setHistoriqueEchelles(echellesRes.data.results || echellesRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAxeReferentiels = async () => {
    try {
      const [postesRes, categoriesRes, echellesRes] = await Promise.all([
        api.get("/ref/postes/"),
        api.get("/ref/categories/"),
        api.get("/ref/echelles/"),
      ]);
      setPostes(postesRes.data.results || postesRes.data);
      setCategories(categoriesRes.data.results || categoriesRes.data);
      setEchelles(echellesRes.data.results || echellesRes.data);
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

  const fetchEmployee = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get(`/employees/${id}/`);
      setEmployee(response.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
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
      await fetchEmployee(true);
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Impossible d'uploader la photo.",
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleExportEmployee = async () => {
    try {
      const response = await api.get(`/employees/${id}/export/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `employe_${employee.matricule}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Impossible d'exporter cet employé." });
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
    const filtered = groupDocsByVersion(
      (employee.documents || []).filter(
        (doc) => !doc.contrat || doc.contrat === selectedContratId,
      ),
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

    // Toujours le dossier général de l'employé — un contrat sélectionné
    // dans la sidebar sert uniquement à filtrer l'affichage, pas à
    // choisir où attacher un nouvel upload (cohérent avec "Scanner un
    // dossier", qui n'a jamais eu de notion de contrat).
    const url = `/employees/${id}/documents/`;

    try {
      await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage({
        type: "success",
        text: `${files.length} fichier(s) uploadé(s) avec succès.`,
      });
      fetchEmployee(true);
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
      fetchEmployee(true);
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
      fetchEmployee(true);
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
      fetchEmployee(true);
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
      fetchEmployee(true);
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

  // "Nom & Prénom" (fusion de deux champs système "nom"+"prenom" — pas de
  // ligne dédiée réordonnable seule dans SYSTEM_FIELDS) prend l'ordre de
  // "nom". Pôle/Département/Section/Service/Cellule sont bien des
  // SYSTEM_FIELDS réordonnables (voir Parametres.jsx), mais restent
  // conditionnels ici — affichés seulement pour les employés qui en ont
  // un(e) (un employé rattaché via Section/Cellule plutôt que Département/
  // Service, ou sans Pôle, ne doit pas afficher de "—" trompeur). Échelle
  // reste affichée systématiquement (comme Catégorie), "—" sinon — choix
  // explicite de l'utilisateur.
  const currentEchelleNom = Array.isArray(historiqueEchelles)
    ? historiqueEchelles.find((p) => !p.date_fin)?.echelle_nom || null
    : null;

  const infoFields = [
    { label: "Matricule", value: employee.matricule, mono: true, code: "matricule", sortKey: systemOrdre("matricule") },
    {
      label: "N° Contrat",
      value: contrats[0]?.numero_contrat || "—",
      mono: true,
      code: "numero_contrat",
      sortKey: systemOrdre("numero_contrat"),
    },
    {
      label: "Nom & Prénom",
      value: `${employee.nom} ${employee.prenom}`,
      bold: true,
      code: "nom",
      sortKey: systemOrdre("nom"),
    },
    { label: "Date de naissance", value: employee.date_naissance || "—", code: "date_naissance", sortKey: systemOrdre("date_naissance") },
    { label: "Date de recrutement", value: employee.date_embauche || "—", code: "date_embauche", sortKey: systemOrdre("date_embauche") },
    {
      label: "Date de début de contrat",
      value: contrats[0]?.date_debut || "—",
      code: "date_debut_contrat",
      sortKey: systemOrdre("date_debut_contrat"),
    },
    {
      label: "Date de fin de contrat",
      value: employee.date_fin_contrat || "—",
      code: "date_fin_contrat",
      sortKey: systemOrdre("date_fin_contrat"),
    },
    { label: "Statut", value: employee.statut, badge: true, code: "statut", sortKey: systemOrdre("statut") },
    { label: "Direction", value: employee.direction_nom || "—", code: "direction", sortKey: systemOrdre("direction") },
    ...(employee.pole_nom
      ? [{ label: "Pôle", value: employee.pole_nom, code: "pole", sortKey: systemOrdre("pole") }]
      : []),
    ...(employee.departement_nom
      ? [{ label: "Département", value: employee.departement_nom, code: "departement", sortKey: systemOrdre("departement") }]
      : []),
    ...(employee.section_nom
      ? [{ label: "Section", value: employee.section_nom, code: "section", sortKey: systemOrdre("section") }]
      : []),
    ...(employee.service_nom
      ? [{ label: "Service", value: employee.service_nom, code: "service", sortKey: systemOrdre("service") }]
      : []),
    ...(employee.cellule_nom
      ? [{ label: "Cellule", value: employee.cellule_nom, code: "cellule", sortKey: systemOrdre("cellule") }]
      : []),
    { label: "Fonction", value: employee.poste_nom || "—", code: "poste", sortKey: systemOrdre("poste") },
    { label: "Type de contrat", value: employee.type_contrat_nom || "—", code: "type_contrat", sortKey: systemOrdre("type_contrat") },
    { label: "Catégorie", value: employee.categorie_nom || "—", code: "categorie", sortKey: systemOrdre("categorie") },
    // Pas de champ Employee.echelle direct (voir CLAUDE.md "Historique de
    // carrière") — valeur actuelle lue depuis la période ouverte de
    // l'historique Échelle, comme dans l'onglet Carrière. Toujours
    // affichée (comme Catégorie), "—" si aucune période saisie.
    { label: "Échelle", value: currentEchelleNom || "—", code: "echelle", sortKey: systemOrdre("echelle") },
    ...(employee.champs_personnalises || []).map((c) => ({
      label: c.nom,
      value: c.valeur || "—",
      code: c.code,
      sortKey: c.ordre ?? 0,
    })),
  ].sort((a, b) => a.sortKey - b.sortKey);

  // Un champ absent de champs_categories n'est pas affiché pour l'utilisateur
  // courant, quelle qu'en soit la raison (périmètre CONSULTANT sur un champ
  // personnel non autorisé — voir CLAUDE.md "Panneau Informations — colonnes
  // Personnel/Administratif" — le backend l'a déjà exclu du dict).
  const champsCategories = employee.champs_categories || {};
  const visibleInfoFields = infoFields.filter((f) => f.code in champsCategories);
  const infoFieldsPersonnel = visibleInfoFields.filter((f) => champsCategories[f.code] === "PERSONNEL");
  const infoFieldsAdministratif = visibleInfoFields.filter((f) => champsCategories[f.code] === "ADMINISTRATIF");

  const documentsAffiches = groupDocsByVersion(
    (employee.documents || []).filter(
      (doc) => !doc.contrat || doc.contrat === selectedContratId,
    ),
  );

  const { orderMap: docOrderMap, headerBefore: docHeaderBefore, groupEnd: docGroupEnd } =
    buildDocOrder(documentsAffiches, employee.documents_manquants || []);

  const champToDoc = {};
  typesDocumentsList.forEach((t) => {
    if (t.champ_source) champToDoc[t.champ_source] = t;
  });

  const handleFieldClick = (code) => {
    const typeDoc = champToDoc[code];
    if (!typeDoc) return;
    setActiveTab("dossier");
    const present = documentsAffiches.find((d) => d.type_doc_id === typeDoc.id);
    if (present) {
      handleSelectDoc(present);
      setTimeout(() => {
        dossierSectionRef.current?.scrollIntoView?.({
          behavior: "smooth",
          block: "start",
        });
      }, 50);
      return;
    }
    const manquant = (employee.documents_manquants || []).find((d) => d.id === typeDoc.id);
    if (manquant) {
      setHighlightedMissingCode(manquant.code);
      setTimeout(() => {
        missingRowRefs.current[manquant.code]?.scrollIntoView?.({
          behavior: "smooth",
          block: "center",
        });
      }, 50);
      setTimeout(() => setHighlightedMissingCode(null), 2000);
    }
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 20px" : "28px 32px 32px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <button onClick={() => navigate(-1)} title="Retour (Alt+←)" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", marginBottom: 16, fontFamily: "inherit" }}>
            ← Retour
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
              <EmployeeAvatar employee={employee} size={96} fontSize={32} light shape="square" />
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
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
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h1 style={{ color: "#fff", fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: "-0.02em" }}>
                  {employee.prenom} {employee.nom}
                </h1>
                <InfoNotice text={PAGE_NOTICES.employeeDetail} />
                <div style={{ display: "flex", gap: 6, marginLeft: 6 }}>
                  <button
                    onClick={() => navigate(`/employees/${adjacent.prev.id}`)}
                    disabled={!adjacent.prev}
                    title={adjacent.prev ? `${adjacent.prev.prenom} ${adjacent.prev.nom} (${adjacent.prev.matricule})` : "Aucun employé précédent"}
                    className={adjacent.prev ? "btn-lift" : undefined}
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      color: adjacent.prev ? "#fff" : "rgba(255,255,255,0.35)",
                      borderRadius: 8,
                      width: 28,
                      height: 28,
                      fontSize: 14,
                      cursor: adjacent.prev ? "pointer" : "default",
                    }}
                  >
                    ←
                  </button>
                  <button
                    onClick={() => navigate(`/employees/${adjacent.next.id}`)}
                    disabled={!adjacent.next}
                    title={adjacent.next ? `${adjacent.next.prenom} ${adjacent.next.nom} (${adjacent.next.matricule})` : "Aucun employé suivant"}
                    className={adjacent.next ? "btn-lift" : undefined}
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      color: adjacent.next ? "#fff" : "rgba(255,255,255,0.35)",
                      borderRadius: 8,
                      width: 28,
                      height: 28,
                      fontSize: 14,
                      cursor: adjacent.next ? "pointer" : "default",
                    }}
                  >
                    →
                  </button>
                </div>
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginTop: 2 }}>
                Navigation triée par N° Contrat
              </div>
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
              {["ADMIN", "SUPERADMIN"].includes(user?.role) && (
                <div style={{ display: "flex", gap: 8, justifyContent: isMobile ? "flex-start" : "flex-end", marginTop: 10 }}>
                  <button onClick={handleExportEmployee} className="btn-lift" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Exporter
                  </button>
                  <button onClick={() => navigate(`/employees/${id}/modifier`)} className="btn-lift" style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Modifier
                  </button>
                </div>
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 24,
            marginBottom: 24,
          }}
        >
          {[
            { title: "Informations personnelles", fields: infoFieldsPersonnel },
            { title: "Informations administratives", fields: infoFieldsAdministratif },
          ].map(({ title, fields }) => (
            <div
              key={title}
              className="anim-slide-up"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>{title}</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: 20,
                }}
              >
                {fields.map((item) => (
                  <div key={item.label}>
                    <div
                      onClick={champToDoc[item.code] ? () => handleFieldClick(item.code) : undefined}
                      title={champToDoc[item.code] ? `Voir le document : ${champToDoc[item.code].nom}` : undefined}
                      className={champToDoc[item.code] ? "hover-lift" : undefined}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: champToDoc[item.code] ? theme.primary : theme.textMuted,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                        ...(champToDoc[item.code]
                          ? {
                              cursor: "pointer",
                              background: theme.primaryBg,
                              border: `1px solid ${theme.primaryBorder}`,
                              borderRadius: 6,
                              padding: "3px 7px",
                            }
                          : {}),
                      }}
                    >
                      {champToDoc[item.code] && <span style={{ fontSize: 11 }}>🔗</span>}
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
          ))}
        </div>

        {/* Voie hiérarchique */}
        {employee.voie_hierarchique?.length > 0 && (
          <div className="anim-slide-up" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: theme.shadowMd }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
              <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>Voie hiérarchique</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
              {employee.voie_hierarchique.map((niveau, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <EmployeeAvatar
                    employee={{ id: niveau.employee_id, nom: niveau.nom, prenom: niveau.prenom, has_photo: niveau.has_photo }}
                    size={40}
                    fontSize={14}
                  />
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {niveau.role}
                    </div>
                    <div style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>
                      {niveau.prenom} {niveau.nom}
                    </div>
                  </div>
                  {i < employee.voie_hierarchique.length - 1 && (
                    <span style={{ color: theme.textMuted, fontSize: 16, marginLeft: 10 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Onglets */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            {
              key: "dossier",
              label: `Dossier (${employee.documents?.length || 0})`,
            },
            { key: "contrats", label: `Contrats (${contrats.length})` },
            { key: "carriere", label: "Carrière" },
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
        <ContratsTab
          activeTab={activeTab}
          employee={employee}
          contrats={contrats}
          navigate={navigate}
          typesContrat={typesContrat}
          showNewContratForm={showNewContratForm}
          setShowNewContratForm={setShowNewContratForm}
          newContrat={newContrat}
          setNewContrat={setNewContrat}
          savingContrat={savingContrat}
          handleCreateContrat={handleCreateContrat}
          user={user}
          isMobile={isMobile}
        />

        <CarriereTab
          activeTab={activeTab}
          employee={employee}
          user={user}
          navigate={navigate}
          id={id}
          confirm={confirm}
          contrats={contrats}
          historiqueFonctions={historiqueFonctions}
          historiqueCategories={historiqueCategories}
          historiqueEchelles={historiqueEchelles}
          managingAxe={managingAxe}
          setManagingAxe={setManagingAxe}
          newPeriode={newPeriode}
          setNewPeriode={setNewPeriode}
          postes={postes}
          categories={categories}
          echelles={echelles}
          fetchHistorique={fetchHistorique}
        />

        {/* Documents + Viewer */}
        <DossierTab
          activeTab={activeTab}
          contrats={contrats}
          docLoading={docLoading}
          docUrl={docUrl}
          documentsAffiches={documentsAffiches}
          docOrderMap={docOrderMap}
          docHeaderBefore={docHeaderBefore}
          docGroupEnd={docGroupEnd}
          employee={employee}
          expandedHistory={expandedHistory}
          setExpandedHistory={setExpandedHistory}
          fetchEmployee={fetchEmployee}
          fetchContrats={fetchContrats}
          highlightedMissingCode={highlightedMissingCode}
          isMobile={isMobile}
          missingRowRefs={missingRowRefs}
          quickUploadingCode={quickUploadingCode}
          setQuickUploadingCode={setQuickUploadingCode}
          selectedContratId={selectedContratId}
          setSelectedContratId={setSelectedContratId}
          selectedDoc={selectedDoc}
          selectedFile={selectedFile}
          showScanImport={showScanImport}
          setShowScanImport={setShowScanImport}
          setUploadType={setUploadType}
          uploadType={uploadType}
          uploading={uploading}
          typesDocuments={typesDocuments}
          typesDocumentsList={typesDocumentsList}
          sortContratsByDate={sortContratsByDate}
          loadFile={loadFile}
          handleAutoRenameFile={handleAutoRenameFile}
          handleDeleteDoc={handleDeleteDoc}
          handleDeleteFile={handleDeleteFile}
          handleRenameFile={handleRenameFile}
          handleSelectDoc={handleSelectDoc}
          handleUpload={handleUpload}
          dossierSectionRef={dossierSectionRef}
          setMessage={setMessage}
          id={id}
          user={user}
        />
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
};

export default EmployeeDetail;

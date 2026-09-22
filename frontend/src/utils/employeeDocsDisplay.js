// Helpers d'affichage pour la sidebar "Documents" de la fiche employé —
// extraits de EmployeeDetail.jsx (onglet Dossier) pour partage avec
// DossierTab.jsx. Purs : ne dépendent que de leurs arguments + theme.

// Nom de fichier sans l'extension — l'utilisateur voit "Acte de naissance",
// pas "Acte de naissance.png" (le type/mime reste géré côté serveur).
export const stripExt = (name) => {
  if (!name) return name;
  const dotIndex = name.lastIndexOf(".");
  return dotIndex > 0 ? name.slice(0, dotIndex) : name;
};

// file_size_kb vient du backend en Ko — affiché en Mo pour rester lisible
// sur des documents scannés qui font souvent plusieurs Mo.
export const formatSizeMo = (kb) => {
  if (kb === null || kb === undefined) return "";
  return `${(kb / 1024).toFixed(2)} Mo`;
};

// Date + heure d'upload d'un fichier (ex. "27/08/2026 13:30").
export const formatDateTime = (isoString) => {
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

export const hexToRgba = (hex, alpha) => {
  if (!hex) return null;
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Couleur neutre indépendante du thème (clair/sombre) — utilisée seulement
// quand aucune couleur de dossier n'est fournie.
export const FALLBACK_FOLDER_COLOR = "#D97706";

// `collapsed` referme visuellement le dossier sur lui-même (bordure/coins
// arrondis sur les 4 côtés, comme s'il n'y avait pas de contenu en dessous)
// — utilisé quand le dossier est replié (voir openFolders/toggleFolder).
export const folderHeaderStyle = (couleur, collapsed = false) => {
  const c = couleur || FALLBACK_FOLDER_COLOR;
  return {
    marginTop: 8,
    padding: "7px 16px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: hexToRgba(c, 0.12),
    border: `1px solid ${hexToRgba(c, 0.35)}`,
    borderBottom: collapsed ? `1px solid ${hexToRgba(c, 0.35)}` : "none",
    borderRadius: collapsed ? 8 : "8px 8px 0 0",
    color: c,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    cursor: "pointer",
    userSelect: "none",
    justifyContent: "space-between",
    marginBottom: collapsed ? 10 : 0,
  };
};

// Puce de bascule (▾) à droite de l'en-tête d'un dossier — rotation
// -90°/0° (fermé/ouvert) plutôt qu'un glyphe texte différent : affordance
// plus visible (fond teinté + taille) et cohérente avec le chevron rotatif
// déjà utilisé pour le menu Administration (Navbar.jsx).
export const folderToggleStyle = (couleur, open) => {
  const c = couleur || FALLBACK_FOLDER_COLOR;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 5,
    background: hexToRgba(c, 0.22),
    fontSize: 12,
    fontWeight: 800,
    lineHeight: 1,
    flexShrink: 0,
    transform: open ? "rotate(0deg)" : "rotate(-90deg)",
    transition: "transform 0.18s ease",
  };
};

export const folderRowExtraStyle = (couleur) => {
  const c = couleur || FALLBACK_FOLDER_COLOR;
  return {
    background: hexToRgba(c, 0.05),
    borderRight: `1px solid ${hexToRgba(c, 0.35)}`,
  };
};

export const folderRowBorder = (couleur) =>
  `1px solid ${hexToRgba(couleur || FALLBACK_FOLDER_COLOR, 0.35)}`;

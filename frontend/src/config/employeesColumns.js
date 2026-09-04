// Colonnes optionnelles du tableau /employees — extrait de Employees.jsx.
// Persistées côté navigateur (par utilisateur) — n'affecte que l'affichage,
// aucune donnée n'est masquée côté serveur.
// Par défaut : les colonnes fixes restent affichées telles qu'avant (aucun
// changement du tableau existant) ; les champs personnalisés dynamiques,
// eux, sont proposés dans le filtre mais MASQUÉS par défaut — l'utilisateur
// les active volontairement via "Colonnes" s'il en a besoin. On ne
// persiste que les choix explicites (overrides), pour que le comportement
// par défaut reste correct même si de nouveaux champs sont ajoutés plus
// tard dans /parametres.
export const COLUMN_OPTIONS_FIXED = [
  { key: "numero_contrat", label: "N° Contrat" },
  { key: "date_naissance", label: "Date de naissance" },
  { key: "date_embauche", label: "Date de recrutement" },
  { key: "direction", label: "Direction" },
  { key: "departement", label: "Département" },
  { key: "service", label: "Service" },
  { key: "poste", label: "Fonction" },
  { key: "type_contrat", label: "Type de contrat" },
  { key: "categorie", label: "Catégorie" },
  { key: "statut", label: "Statut" },
  { key: "motif_archivage", label: "Motif" },
  { key: "dossier", label: "Dossier" },
];
export const COLUMNS_STORAGE_KEY = "somiz_employees_column_overrides";

export const loadColumnOverrides = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
    if (saved && typeof saved === "object") return saved;
  } catch {}
  return {};
};

// Colonnes qui n'existaient pas dans le tableau avant l'ajout du filtre —
// masquées par défaut comme les champs personnalisés, pour ne rien changer
// à l'affichage existant tant que l'utilisateur ne les active pas lui-même.
export const NEWLY_ADDED_COLUMNS = new Set([
  "date_naissance",
  "date_embauche",
  "type_contrat",
  "categorie",
  "motif_archivage",
]);
export const defaultColumnVisible = (key) =>
  !key.startsWith("custom_") && !NEWLY_ADDED_COLUMNS.has(key);

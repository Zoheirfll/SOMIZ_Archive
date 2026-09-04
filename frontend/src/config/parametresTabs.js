// Configuration statique des onglets référentiels de la page Parametres —
// extraite de Parametres.jsx pour garder le composant page en dessous de
// 1000 lignes. Aucune logique ici, uniquement des données.

export const TABS = [
  { key: "directions", label: "Directions" },
  { key: "poles", label: "Pôles" },
  { key: "departements", label: "Départements" },
  { key: "services", label: "Services" },
  { key: "cellules", label: "Cellules" },
  { key: "sections", label: "Sections" },
  { key: "postes", label: "Postes" },
  { key: "types-contrat", label: "Types de contrat" },
  { key: "categories", label: "Catégories" },
  { key: "echelles", label: "Échelles" },
  { key: "motifs-archivage", label: "Motifs d'archivage" },
  { key: "types-documents", label: "Types de documents" },
  { key: "champs-personnalises", label: "Champs personnalisés" },
];

// Regroupement sémantique des 13 onglets pour la sidebar de navigation —
// remplace l'ancienne barre d'onglets horizontale (illisible/scrollable au-delà
// d'une dizaine d'entrées). Chaque clé référence TABS, aucune duplication de
// libellé.
export const TAB_GROUPS = [
  {
    label: "Organisation",
    keys: ["directions", "poles", "departements", "services", "cellules", "sections"],
  },
  {
    label: "Emploi",
    keys: ["postes", "types-contrat", "categories", "echelles"],
  },
  {
    label: "Dossier RH",
    keys: ["types-documents", "champs-personnalises", "motifs-archivage"],
  },
];

// Tabs sans import/template CSV-XLSX côté backend (ReferentielImportView) —
// "types-documents" a une hiérarchie catégorie/sous-type et
// "champs-personnalises" un type de champ, tous deux trop spécifiques pour
// le mécanisme générique d'import référentiel. Masquer les boutons
// Template/Import plutôt que de les laisser échouer avec une erreur.
export const IMPORT_UNSUPPORTED_TABS = new Set([
  "types-documents",
  "champs-personnalises",
]);

// Colonnes obligatoires/optionnelles par onglet — reflète exactement
// ReferentielImportView.MODELS (backend/employees/import_views.py), affiché
// dans la modale d'import pour que l'admin sache quoi remplir sans deviner
// (même principe que Import.jsx pour l'import employés).
export const REF_COLUMNS_INFO = {
  directions: { obligatoires: ["nom"], optionnelles: ["code", "description"] },
  poles: {
    obligatoires: ["nom", "direction"],
    optionnelles: ["code", "description"],
  },
  departements: {
    obligatoires: ["nom", "direction"],
    optionnelles: ["code", "description"],
  },
  services: {
    obligatoires: ["nom", "departement"],
    optionnelles: ["code", "direction", "description"],
    note: "\"direction\" ne sert qu'à lever l'ambiguïté si plusieurs départements portent le même nom.",
  },
  cellules: {
    obligatoires: ["nom"],
    optionnelles: ["code", "direction", "departement", "description"],
    note: 'Au moins une des deux colonnes "direction" ou "departement" doit être remplie par ligne. Si "departement" est rempli, "direction" devient facultative et sert seulement à lever l\'ambiguïté si plusieurs départements portent ce nom.',
  },
  sections: {
    obligatoires: ["nom"],
    optionnelles: ["code", "direction", "departement", "description"],
    note: 'Au moins une des deux colonnes "direction" ou "departement" doit être remplie par ligne. Si "departement" est rempli, "direction" devient facultative et sert seulement à lever l\'ambiguïté si plusieurs départements portent ce nom.',
  },
  postes: { obligatoires: ["nom"], optionnelles: ["code", "description"] },
  "types-contrat": { obligatoires: ["nom"], optionnelles: ["description"] },
  categories: { obligatoires: ["nom"], optionnelles: ["description"] },
  echelles: { obligatoires: ["nom"], optionnelles: ["description"] },
  "motifs-archivage": { obligatoires: ["nom"], optionnelles: ["description"] },
};

// Champs "système" de la fiche employé — pilotent le scoping/périmètre RGPD,
// l'archivage, la recherche ou la logique métier (voir CLAUDE.md). Affichés
// dans l'onglet "Champs personnalisés" pour vue d'ensemble complète, mais
// jamais modifiables/supprimables depuis cet écran (`system: true`).
export const SYSTEM_FIELDS = [
  {
    id: "sys-matricule",
    nom: "Matricule",
    code: "matricule",
    type_champ: "texte",
    system: true,
  },
  {
    id: "sys-numero_contrat",
    nom: "N° Contrat",
    code: "numero_contrat",
    type_champ: "texte",
    system: true,
  },
  { id: "sys-nom", nom: "Nom", code: "nom", type_champ: "texte", system: true },
  {
    id: "sys-prenom",
    nom: "Prénom",
    code: "prenom",
    type_champ: "texte",
    system: true,
  },
  {
    id: "sys-statut",
    nom: "Statut",
    code: "statut",
    type_champ: "texte",
    system: true,
  },
  {
    id: "sys-direction",
    nom: "Direction",
    code: "direction",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-pole",
    nom: "Pôle",
    code: "pole",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-departement",
    nom: "Département",
    code: "departement",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-section",
    nom: "Section",
    code: "section",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-service",
    nom: "Service",
    code: "service",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-cellule",
    nom: "Cellule",
    code: "cellule",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-poste",
    nom: "Fonction",
    code: "poste",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-type_contrat",
    nom: "Type de contrat",
    code: "type_contrat",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-categorie",
    nom: "Catégorie",
    code: "categorie",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-echelle",
    nom: "Échelle",
    code: "echelle",
    type_champ: "référentiel",
    system: true,
  },
  {
    id: "sys-date_naissance",
    nom: "Date de naissance",
    code: "date_naissance",
    type_champ: "date",
    system: true,
  },
  {
    id: "sys-date_embauche",
    nom: "Date de recrutement",
    code: "date_embauche",
    type_champ: "date",
    system: true,
  },
  {
    id: "sys-date_debut_contrat",
    nom: "Date de début de contrat",
    code: "date_debut_contrat",
    type_champ: "date",
    system: true,
  },
  {
    id: "sys-date_fin_contrat",
    nom: "Date de fin de contrat",
    code: "date_fin_contrat",
    type_champ: "date",
    system: true,
  },
];

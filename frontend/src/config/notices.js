// Textes des notices contextuelles ("(i)") affichées sur chaque page.
// Une clé absente ou à `null` = pas de bouton (i) affiché pour cette page/ce champ.

export const PAGE_NOTICES = {
  employees: "Parcourez les employés par Direction, puis Département, puis Service, Cellule ou Section. Utilisez la recherche ou le filtre Statut pour retrouver un employé directement, et le bouton Colonnes pour choisir les informations affichées dans le tableau.",
  employeeDetail: "Fiche complète d'un employé : informations, documents (classés par type, avec historique des versions) et contrats. Le bouton \"Scanner un dossier\" permet d'importer plusieurs documents scannés en une seule fois.",
  employeeForm: "Créez ou modifiez un employé. L'affectation (Direction/Département/Service ou Cellule ou Section) détermine qui peut voir cet employé selon le périmètre des comptes Consultant. Un changement d'affectation vous sera demandé de confirmer avant l'enregistrement.",
  contratDetail: "Détail d'un contrat et de ses documents propres (distincts du dossier général de l'employé). Modifiable uniquement par un Administrateur.",
  dashboard: "Vue d'ensemble des effectifs et de la complétude des dossiers RH sur l'ensemble de l'organisation.",
  users: "Gérez les comptes Administrateur et Consultant. Le bouton \"Périmètre\" restreint un compte Consultant à une partie de l'organisation, à certains types de documents, et/ou à des employés précis.",
  audit: "Historique de toutes les actions effectuées dans SOMIZ (traçabilité RGPD / Loi 18-07). Un Administrateur voit ses propres actions et celles des comptes Consultant qu'il gère ; seul un compte Super-administrateur voit le journal complet.",
  parametres: "Gérez les référentiels organisationnels (Directions, Départements, Services, Cellules, Sections...), les types de documents et les champs personnalisés utilisés dans toute l'application.",
  import: "Importez plusieurs employés en une fois depuis un fichier Excel (.xlsx) ou CSV. Téléchargez le modèle pour connaître les colonnes attendues avant de préparer votre fichier.",
  profil: "Consultez vos informations de compte et modifiez votre mot de passe.",
};

export const FIELD_NOTICES = {
  parametres: {
    cellulesEtSections: "Cellules et Sections sont deux référentiels indépendants qui coexistent : chacun est rattaché à exactement une Direction OU un Département (jamais un Service, jamais les deux). Un même Département peut avoir à la fois des Cellules et des Sections.",
    typesDocumentsCategories: "Une catégorie (ex. \"État civil\") regroupe des types de documents réellement uploadables (ex. \"Acte de naissance\"). Une catégorie elle-même n'est jamais uploadable et ne peut pas être marquée \"Obligatoire\" — reportez cette exigence sur ses sous-types.",
  },
  employeeForm: {
    affectationExclusive: "Un employé est rattaché à un seul de ces trois champs à la fois : Service, Cellule ou Section. Choisir l'un vide automatiquement les deux autres.",
  },
  users: {
    perimetre: "Trois niveaux de périmètre se combinent : le périmètre organisationnel (Direction/Département/Service/Cellule/Section, en OU entre les cases cochées), le périmètre \"Types de documents\" (combiné en ET avec l'organisationnel), et les accès ponctuels par employé (en OU en plus des deux autres). Aucune case cochée nulle part = accès non restreint.",
  },
};

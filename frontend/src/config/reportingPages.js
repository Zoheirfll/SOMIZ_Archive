// frontend/src/config/reportingPages.js
// Pages du menu « Statistiques » — seule liste, partagée par la navbar et le
// routeur (pages/reporting/RapportRH.jsx). Backend : GET /reporting/rh/<page>/.
// Accès (vérifié aussi côté serveur) : par défaut `peutVoirStatistiques` (SUPERADMIN,
// ou ADMIN portant acces_statistiques) ; `visible(user)` remplace ce droit pour
// les pages réservées à un traiteur (Congés, Demandes).
export const STATISTIQUES_PAGES = [
  { page: "synthese", path: "/statistiques/synthese", label: "Synthèse DRH",
    description: "Indicateurs clés, objectifs, alertes et faits marquants" },
  { page: "effectifs", path: "/statistiques/effectifs", label: "Effectifs",
    description: "Structure, répartitions, encadrement" },
  { page: "parite", path: "/statistiques/parite", label: "Parité",
    description: "Répartition hommes / femmes par unité et profil" },
  { page: "demographie", path: "/statistiques/demographie", label: "Démographie & retraites",
    description: "Âges, ancienneté, départs prévisibles, postes à risque" },
  { page: "mouvements", path: "/statistiques/mouvements", label: "Mouvements & rétention",
    description: "Entrées, sorties, turnover, rétention par promotion" },
  { page: "carriere", path: "/statistiques/carriere", label: "Carrière & mobilité",
    description: "Changements de fonction, catégorie, échelle et transferts" },
  { page: "contrats", path: "/statistiques/contrats", label: "Contrats",
    description: "Échéances, contrats échus, contrats successifs" },
  { page: "unites", path: "/statistiques/unites", label: "Comparaison des unités",
    description: "Carte de chaleur des directions sur les indicateurs clés" },
  { page: "qualite", path: "/statistiques/qualite", label: "Qualité des données",
    description: "Complétude, données manquantes, incohérences" },
  { page: "documents", path: "/statistiques/documents", label: "Documents & archives",
    description: "Volumétrie, ajouts, suppressions, types" },
  { page: "conges", path: "/statistiques/conges", label: "Congés",
    description: "Jours pris, demandes, soldes", visible: (u) => !!u?.can_manage_conges },
  { page: "demandes", path: "/statistiques/demandes", label: "Attestations & consultations",
    description: "Volumes, délais, rejets, retards",
    visible: (u) => !!(u?.can_manage_attestations || u?.can_manage_consultations) },
  { page: "activite", path: "/statistiques/activite", label: "Activité des comptes",
    description: "Actions des administrateurs sur la période" },
];

export const peutVoirStatistiques = (user) => user?.role === "SUPERADMIN" || !!user?.can_view_statistiques;

export const pagesVisibles = (user) =>
  STATISTIQUES_PAGES.filter((p) => (p.visible ? p.visible(user) : peutVoirStatistiques(user)));

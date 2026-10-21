// Utilitaires des demandes de congé (voir docs/fonctionnel/conges.md).
// Les règles de calcul reproduisent celles du backend (conges/services.py) :
// ici elles ne servent qu'à GUIDER la saisie et à AFFICHER un aperçu, le
// serveur reste l'unique juge au moment de valider.

export const TYPES_CONGE = [
  { value: "CP", label: "Congé payé (CP)" },
  { value: "CE", label: "Congé exceptionnel (CE)" },
  { value: "CS", label: "Congé sans solde (CS)" },
];

// Groupe d'un exercice par rapport à l'exercice en cours (calculé par le serveur).
export const CATEGORIES_EXERCICE = [
  { value: "RELIQUAT", label: "Reliquat" },
  { value: "ACTUEL", label: "Actuel" },
  { value: "ANTICIPE", label: "Anticipé" },
];

export const libelleCategorie = (cat) =>
  (CATEGORIES_EXERCICE.find((c) => c.value === cat) || {}).label || cat || "";

const LIBELLES_STATUT = {
  recue: "Reçue",
  prete: "Prête",
  recuperee: "Récupérée",
  rejetee: "Rejetée",
  annulee: "Annulée",
  interrompue: "Interrompue",
};

export const libelleStatutConge = (statut) => LIBELLES_STATUT[statut] || statut;

// La référence « 00001/26 » contient un « / » : encodée « 00001-26 » dans l'URL.
export const refVersUrl = (reference) => String(reference || "").replace("/", "-");

// Jours calendaires entre le départ et le retour (date de REPRISE).
export const joursEntre = (depart, retour) => {
  if (!depart || !retour) return "";
  const ms = new Date(`${retour}T00:00:00Z`) - new Date(`${depart}T00:00:00Z`);
  const jours = Math.round(ms / 86400000);
  return jours > 0 ? jours : "";
};

// Date ISO + n jours (UTC : aucun décalage d'heure d'été).
export const ajouterJours = (iso, n) => {
  if (!iso || !n) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.toISOString().slice(0, 10);
};

// Exercice du 1er juillet au 30 juin, noté « AAAA/AAAA ».
export const exercicePour = (iso) => {
  if (!iso) return "";
  const [annee, mois] = String(iso).slice(0, 10).split("-").map(Number);
  if (!annee || !mois) return "";
  const debut = mois >= 7 ? annee : annee - 1;
  return `${debut}/${debut + 1}`;
};

const avecJours = (exercices) =>
  [...(exercices || [])]
    .filter((e) => e.restant > 0)
    .sort((a, b) => a.exercice.localeCompare(b.exercice));

// Exercice proposé d'office : le plus ancien qui a encore des jours.
export const exerciceParDefaut = (exercices) => avecJours(exercices)[0]?.exercice || "";

// Un exercice ne peut servir de départ que s'il est le plus ancien non vide.
export const exerciceSelectionnable = (exercices, exercice) =>
  exercice === exerciceParDefaut(exercices);

// Ventilation d'un CP : à partir de l'exercice de départ (par défaut le plus
// ancien non vide), puis débordement sur les suivants jusqu'à l'anticipé.
// `exercices` = solde.exercices de l'API ({exercice, restant}).
// Renvoie { parts: [{exercice, jours}], erreur } ; null si rien à calculer.
export const calculerVentilation = (exercices, nbJours, exerciceDepart = "") => {
  const n = Number(nbJours);
  if (!exercices || !n || n < 1) return null;
  const disponibles = avecJours(exercices);
  if (disponibles.length === 0) {
    return { parts: [], erreur: "Aucun jour disponible : le serveur refusera la validation." };
  }
  const plusAncien = disponibles[0];
  const depart = exerciceDepart || plusAncien.exercice;
  if (depart !== plusAncien.exercice) {
    const erreur = disponibles.some((e) => e.exercice === depart)
      ? `L'exercice ${plusAncien.exercice} a encore ${plusAncien.restant} jour(s) : il doit être consommé avant ${depart}.`
      : `L'exercice ${depart} n'a plus de jours disponibles.`;
    return { parts: [], erreur };
  }
  const total = disponibles.reduce((s, e) => s + e.restant, 0);
  if (n > total) {
    return { parts: [], erreur: `Solde insuffisant : ${n} jour(s) demandé(s), ${total} disponible(s) (anticipé compris).` };
  }
  const parts = [];
  let reste = n;
  disponibles.forEach((e) => {
    if (reste === 0) return;
    const pris = Math.min(e.restant, reste);
    parts.push({ exercice: e.exercice, jours: pris });
    reste -= pris;
  });
  return { parts, erreur: null };
};

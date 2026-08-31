// Slug lisible pour les URLs de référentiels organisationnels (Direction,
// Département, Service...) — ces noms ne sont pas des données personnelles
// (contrairement à un nom d'employé, voir employeeSlug.js), donc aucune
// contrainte RGPD à les afficher tels quels dans l'URL.
const DIACRITICS_RE = /[̀-ͯ]/g;

export const slugify = (str) =>
  (str || "")
    .toString()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

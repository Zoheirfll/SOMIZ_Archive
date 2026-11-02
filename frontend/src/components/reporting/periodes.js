// frontend/src/components/reporting/periodes.js
const toIso = (d) => d.toLocaleDateString("en-CA");

export const PRESETS = [
  { key: "30j", label: "30 jours" },
  { key: "3m", label: "3 mois" },
  { key: "12m", label: "12 mois" },
  { key: "annee", label: "Année en cours" },
];

export const presetToRange = (preset) => {
  const fin = new Date();
  const debut = new Date();
  if (preset === "30j") debut.setDate(fin.getDate() - 30);
  else if (preset === "3m") debut.setMonth(fin.getMonth() - 3);
  else if (preset === "12m") debut.setFullYear(fin.getFullYear() - 1);
  else if (preset === "annee") { debut.setMonth(0); debut.setDate(1); }
  else return null;
  return { date_debut: toIso(debut), date_fin: toIso(fin) };
};

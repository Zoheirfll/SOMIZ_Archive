export const TYPES_DEMANDE = [
  { value: "dossier", label: "Dossier" },
  { value: "document", label: "Document" },
  { value: "information", label: "Information" },
];

// Presets de durée — doivent rester identiques à
// settings.CONSULTATION_DUREES_HEURES côté backend.
export const DUREES = [
  { value: 1, label: "1 heure" },
  { value: 24, label: "24 heures" },
  { value: 72, label: "3 jours" },
  { value: 168, label: "7 jours" },
];

// La référence "C-00001/26" contient un "/" illisible dans une URL : encodé
// en "-" (voir reference_depuis_slug côté backend).
export const slugDepuisReference = (reference) => reference.replace("/", "-");

// Date + heure locales (formatDateFR ne gère que la date).
export function formatDateHeure(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Compte à rebours lisible. Purement indicatif : l'expiration réelle est
// toujours décidée par le serveur à chaque lecture.
export function tempsRestant(iso, maintenant = Date.now()) {
  const ms = iso ? new Date(iso).getTime() - maintenant : NaN;
  if (Number.isNaN(ms) || ms <= 0) return "Expirée";
  const minutes = Math.floor(ms / 60000);
  const j = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (j > 0) return `${j} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${Math.max(m, 1)} min`;
}

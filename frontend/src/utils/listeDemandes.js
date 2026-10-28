// Briques communes aux listes de demandes (/attestations, /consultations, /conges).
import { formatDateFR } from "./formatDate";

export const MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

export const dateCourte = (iso) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return formatDateFR(iso);
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

export const heureRecue = (iso) => {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

// Clé locale AAAA-MM-JJ (pas toISOString : décalage UTC autour de minuit).
export const cleJour = (iso) => {
  const dt = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export const libelleJour = (cle) => {
  const [y, m, j] = cle.split("-").map(Number);
  const txt = new Date(y, m - 1, j).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

// Tri au clic sur un en-tête : les colonnes texte démarrent A→Z, les autres
// (dates, durées) par le plus récent / le plus grand ; un second clic inverse.
const TRIS_TEXTE = ["employee", "statut", "importance", "motif", "type_demande"];
export const prochainTri = (actuel, cle) => {
  if (actuel === cle) return `-${cle}`;
  if (actuel === `-${cle}`) return cle;
  return TRIS_TEXTE.includes(cle) ? cle : `-${cle}`;
};

export const estTriParDateDemande = (tri) => tri === "created_at" || tri === "-created_at";

// Regroupe par jour de réception tant que le tri porte sur la date de demande ;
// pour tout autre tri, une seule liste continue (un regroupement serait trompeur).
export const grouperDemandes = (demandes, tri) => {
  if (!estTriParDateDemande(tri)) return [["tous", demandes]];
  const jours = [];
  demandes.forEach((d) => {
    const cle = cleJour(d.created_at);
    const dernier = jours[jours.length - 1];
    if (dernier && dernier[0] === cle) dernier[1].push(d);
    else jours.push([cle, [d]]);
  });
  return jours;
};

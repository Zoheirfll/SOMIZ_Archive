import api from "../services/api";

// Message lisible d'une erreur d'API. DRF renvoie `{detail: "…"}` pour une
// permission refusée, mais une LISTE (`["…"]`) pour un `ValidationError("…")`
// simple (ex. motif d'annulation manquant) et un dictionnaire par champ pour
// les erreurs de formulaire : les trois formes sont lues, sinon `defaut`.
export function messageErreur(err, defaut) {
  const data = err?.response?.data;
  if (Array.isArray(data) && typeof data[0] === "string") return data[0];
  if (data && typeof data === "object") {
    if (typeof data.detail === "string") return data.detail;
    const premier = Object.values(data).find((v) => (Array.isArray(v) ? typeof v[0] === "string" : typeof v === "string"));
    if (premier) return Array.isArray(premier) ? premier[0] : premier;
  }
  return defaut;
}

export const anneesDisponibles = (annee = new Date().getFullYear()) =>
  Array.from({ length: 6 }, (_, i) => annee - i);

// Téléchargement authentifié (cookie httpOnly) : on passe par un blob, jamais
// par un lien direct vers l'API. Le paramètre s'appelle `fmt` (et non
// `format`) : DRF réserve ?format= à la négociation de contenu et répondrait
// 404 avant d'atteindre la vue.
export async function telechargerRegistre(registre, params) {
  const res = await api.get(`/registres/${registre}/export/`, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `registre-${registre}-${params.annee}.${params.fmt}`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

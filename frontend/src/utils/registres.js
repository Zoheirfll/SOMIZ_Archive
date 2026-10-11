import api from "../services/api";

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

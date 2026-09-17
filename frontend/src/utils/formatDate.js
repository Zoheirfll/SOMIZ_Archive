// Formate une date ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss...) en DD/MM/YYYY.
// Parsing manuel de la chaîne plutôt que new Date().toLocaleDateString() —
// évite tout décalage de fuseau horaire sur une date sans heure (ex.
// "2026-09-17" interprété en UTC minuit peut retomber sur le 16 en soirée
// dans un fuseau négatif).
export function formatDateFR(isoString) {
  if (!isoString) return '—';
  const datePart = String(isoString).slice(0, 10);
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d || y.length !== 4) return '—';
  return `${d}/${m}/${y}`;
}

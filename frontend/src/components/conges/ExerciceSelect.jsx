import { CATEGORIES_EXERCICE, exerciceSelectionnable } from "../../utils/conges";

// Liste des exercices d'un employé, groupés Reliquat / Actuel / Anticipé, avec
// les jours restants. Seul le plus ancien exercice ayant encore des jours est
// sélectionnable (règle du serveur : le reliquat se consomme d'abord).
// `exercices` = solde.exercices de GET /conges/soldes/<matricule>/.
export default function ExerciceSelect({ id, exercices, value, onChange, style }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={style}>
      {CATEGORIES_EXERCICE.map((cat) => {
        const duGroupe = (exercices || []).filter((e) => e.categorie === cat.value);
        if (duGroupe.length === 0) return null;
        return (
          <optgroup key={cat.value} label={cat.label}>
            {duGroupe.map((e) => (
              <option key={e.exercice} value={e.exercice} disabled={!exerciceSelectionnable(exercices, e.exercice)}>
                {e.exercice} — {e.restant} j restant{e.restant > 1 ? "s" : ""}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

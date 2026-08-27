// URL lisible : /employees/{matricule} plutôt que l'UUID interne. Le nom
// complet n'est volontairement pas inclus (contrairement au pattern
// "Amazon/YouTube") — c'est une donnée personnelle identifiante (RGPD /
// Loi 18-07 ANPDP) qui n'a rien à faire dans une URL susceptible de fuiter
// via l'historique navigateur, les logs serveur ou un lien partagé. Le
// backend (resolve_employee, employees/views.py) accepte aussi l'UUID brut
// en repli, donc aucune migration des anciens liens n'est nécessaire.
export const employeeSlug = (source) => {
  if (!source) return "";
  return source.matricule || source.employee_matricule || source.id || source.employee_id || "";
};

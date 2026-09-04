// Regroupe chaque catégorie de type de document (ex. "ETAT CIVIL") avec ses
// sous-types juste en dessous, comme dans /parametres — sinon la liste plate
// (triée par ordre brut) décroche les sous-types de leur catégorie.
// Partagé entre Users.jsx et UserPerimetre.jsx (modale "Périmètre").
export const sortTypesDocumentsHierarchy = (list) => {
  const byId = new Map(list.map((t) => [t.id, t]));
  const children = new Map();
  list.forEach((t) => {
    if (t.parent && byId.has(t.parent)) {
      if (!children.has(t.parent)) children.set(t.parent, []);
      children.get(t.parent).push(t);
    }
  });
  children.forEach((arr) => arr.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)));
  const roots = list
    .filter((t) => !t.parent || !byId.has(t.parent))
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const ordered = [];
  roots.forEach((r) => {
    ordered.push(r);
    (children.get(r.id) || []).forEach((c) => ordered.push(c));
  });
  return ordered;
};

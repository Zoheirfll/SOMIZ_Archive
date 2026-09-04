import { useState, useEffect } from "react";
import api from "../services/api";
import { sortTypesDocumentsHierarchy } from "../utils/typesDocumentsHierarchy";

// État + logique du périmètre organisationnel (scoping CONSULTANT) — extrait
// en hook partagé car dupliqué à l'identique entre Users.jsx (section
// "Périmètre d'accès (optionnel)" du formulaire de création) et
// UserPerimetre.jsx (page d'édition du périmètre d'un compte existant, voir
// CLAUDE.md section Scoping). Un employé est visible dès qu'il correspond à
// au moins une direction/pôle/département/service/cellule/section cochée
// (sélection multiple indépendante à chaque niveau).
export default function useOrgScopeForm() {
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [services, setServices] = useState([]);
  const [cellules, setCellules] = useState([]);
  const [sections, setSections] = useState([]);
  const [typesDocuments, setTypesDocuments] = useState([]);
  const [champsPersonnels, setChampsPersonnels] = useState([]);
  const [scopeForm, setScopeForm] = useState({
    directions: [],
    poles: [],
    departements: [],
    services: [],
    cellules: [],
    sections: [],
    types_documents: [],
    champs_personnels: [],
  });

  useEffect(() => {
    // ?all=1 — un compte ADMIN doit voir l'intégralité du référentiel pour
    // pouvoir attribuer n'importe quel périmètre, indépendamment de son
    // propre périmètre (toujours non restreint pour ADMIN, mais garde le
    // même paramètre que /organigramme par cohérence).
    api.get("/ref/directions/?all=1").then((res) => setDirections(res.data.results || res.data)).catch(() => {});
    api.get("/ref/poles/?all=1").then((res) => setPoles(res.data.results || res.data)).catch(() => {});
    api.get("/ref/departements/?all=1").then((res) => setDepartements(res.data.results || res.data)).catch(() => {});
    api.get("/ref/services/?all=1").then((res) => setServices(res.data.results || res.data)).catch(() => {});
    api.get("/ref/cellules/?all=1").then((res) => setCellules(res.data.results || res.data)).catch(() => {});
    api.get("/ref/sections/?all=1").then((res) => setSections(res.data.results || res.data)).catch(() => {});
    api.get("/ref/types-documents/").then((res) => {
      setTypesDocuments(sortTypesDocumentsHierarchy(res.data.results || res.data));
    }).catch(() => {});
    api.get("/ref/champs-personnalises/").then((res) => {
      const list = res.data.results || res.data;
      setChampsPersonnels(list.filter((c) => c.categorie === "PERSONNEL"));
    }).catch(() => {});
  }, []);

  // Listes affichées en cascade : cocher une direction ne laisse apparaître
  // que ses pôles/départements/cellules ; cocher un pôle ou un département ne
  // laisse apparaître que ses départements/services. Sans direction cochée,
  // tout est visible (pour un scoping direct à un niveau inférieur sans
  // passer par la direction).
  const visiblePoles = scopeForm.directions.length > 0
    ? poles.filter((p) => scopeForm.directions.includes(p.direction))
    : poles;

  const visibleDepartements = (() => {
    let list = departements;
    if (scopeForm.directions.length > 0) list = list.filter((d) => scopeForm.directions.includes(d.direction));
    if (scopeForm.poles.length > 0) list = list.filter((d) => scopeForm.poles.includes(d.pole));
    return list;
  })();

  const visibleServices = scopeForm.departements.length > 0
    ? services.filter((s) => scopeForm.departements.includes(s.departement))
    : scopeForm.directions.length > 0 || scopeForm.poles.length > 0
      ? services.filter((s) => visibleDepartements.some((d) => d.id === s.departement))
      : services;

  // Une Cellule/Section est rattachée soit directement à une Direction, soit
  // à un Département — les deux filtres (Directions cochées / Départements
  // cochés) s'appliquent donc en OR, pas en cascade exclusive, sinon une
  // cellule directement sous une Direction disparaît dès qu'un Département
  // est aussi coché.
  const visibleCellules =
    scopeForm.directions.length === 0 && scopeForm.departements.length === 0
      ? cellules
      : cellules.filter((c) =>
          (c.direction && scopeForm.directions.includes(c.direction)) ||
          (c.departement && scopeForm.departements.includes(c.departement))
        );

  const visibleSections =
    scopeForm.directions.length === 0 && scopeForm.departements.length === 0
      ? sections
      : sections.filter((s) =>
          (s.direction && scopeForm.directions.includes(s.direction)) ||
          (s.departement && scopeForm.departements.includes(s.departement))
        );

  // Cocher une Direction/un Département coche aussi automatiquement, en
  // cascade, tout ce qu'il contient (Départements/Services, Cellules,
  // Sections) — visuellement explicite sur ce que l'accès couvre déjà de
  // toute façon via employee_scope_q() (un match sur `direction_id` seul
  // suffit à voir tout le monde en dessous), plutôt que de laisser des
  // niveaux inférieurs vides après avoir coché un niveau supérieur.
  // Décocher ne fait qu'enlever ce qui n'est plus dans la cascade visible
  // (comportement existant, inchangé) — pas de "décoche en cascade" needed
  // puisque retirer un parent retire déjà tous ses enfants de la sélection.
  const toggleDirection = (id) => {
    setScopeForm((prev) => {
      const adding = !prev.directions.includes(id);
      const nextDirections = adding
        ? [...prev.directions, id]
        : prev.directions.filter((x) => x !== id);
      const stillVisiblePoleIds = nextDirections.length > 0
        ? poles.filter((p) => nextDirections.includes(p.direction)).map((p) => p.id)
        : poles.map((p) => p.id);
      let nextPoles = prev.poles.filter((poleId) => stillVisiblePoleIds.includes(poleId));
      const stillVisibleDeps = nextDirections.length > 0
        ? departements.filter((d) => nextDirections.includes(d.direction)).map((d) => d.id)
        : departements.map((d) => d.id);
      let nextDepartements = prev.departements.filter((depId) => stillVisibleDeps.includes(depId));
      let nextServices = prev.services;
      let nextCellules = prev.cellules;
      let nextSections = prev.sections;
      if (adding) {
        const cascadePoleIds = poles.filter((p) => p.direction === id).map((p) => p.id);
        nextPoles = [...new Set([...nextPoles, ...cascadePoleIds])];
        const cascadeDepIds = departements.filter((d) => d.direction === id).map((d) => d.id);
        nextDepartements = [...new Set([...nextDepartements, ...cascadeDepIds])];
        const cascadeServiceIds = services.filter((s) => cascadeDepIds.includes(s.departement)).map((s) => s.id);
        nextServices = [...new Set([...prev.services, ...cascadeServiceIds])];
        const cascadeCelluleIds = cellules
          .filter((c) => c.direction === id || cascadeDepIds.includes(c.departement))
          .map((c) => c.id);
        nextCellules = [...new Set([...prev.cellules, ...cascadeCelluleIds])];
        const cascadeSectionIds = sections
          .filter((s) => s.direction === id || cascadeDepIds.includes(s.departement))
          .map((s) => s.id);
        nextSections = [...new Set([...prev.sections, ...cascadeSectionIds])];
      }
      const stillVisibleDepSet = new Set(nextDepartements);
      nextServices = nextServices.filter((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return svc && stillVisibleDepSet.has(svc.departement);
      });
      nextCellules = nextCellules.filter((celId) => {
        const cel = cellules.find((c) => c.id === celId);
        if (!cel) return false;
        if (cel.departement) return stillVisibleDeps.includes(cel.departement);
        return nextDirections.length === 0 || nextDirections.includes(cel.direction);
      });
      nextSections = nextSections.filter((secId) => {
        const sec = sections.find((s) => s.id === secId);
        if (!sec) return false;
        if (sec.departement) return stillVisibleDeps.includes(sec.departement);
        return nextDirections.length === 0 || nextDirections.includes(sec.direction);
      });
      return { ...prev, directions: nextDirections, poles: nextPoles, departements: nextDepartements, services: nextServices, cellules: nextCellules, sections: nextSections };
    });
  };

  const togglePole = (id) => {
    setScopeForm((prev) => {
      const next = prev.poles.includes(id) ? prev.poles.filter((x) => x !== id) : [...prev.poles, id];
      return { ...prev, poles: next };
    });
  };

  const toggleDepartement = (id) => {
    setScopeForm((prev) => {
      const adding = !prev.departements.includes(id);
      const nextDepartements = adding
        ? [...prev.departements, id]
        : prev.departements.filter((x) => x !== id);
      let nextServices = prev.services;
      let nextCellules = prev.cellules;
      let nextSections = prev.sections;
      if (adding) {
        const cascadeServiceIds = services.filter((s) => s.departement === id).map((s) => s.id);
        nextServices = [...new Set([...prev.services, ...cascadeServiceIds])];
        const cascadeCelluleIds = cellules.filter((c) => c.departement === id).map((c) => c.id);
        nextCellules = [...new Set([...prev.cellules, ...cascadeCelluleIds])];
        const cascadeSectionIds = sections.filter((s) => s.departement === id).map((s) => s.id);
        nextSections = [...new Set([...prev.sections, ...cascadeSectionIds])];
      }
      nextServices = nextServices.filter((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return svc && nextDepartements.includes(svc.departement);
      });
      return { ...prev, departements: nextDepartements, services: nextDepartements.length > 0 ? nextServices : prev.services, cellules: nextCellules, sections: nextSections };
    });
  };

  const toggleService = (id) => {
    setScopeForm((prev) => {
      const next = prev.services.includes(id) ? prev.services.filter((x) => x !== id) : [...prev.services, id];
      return { ...prev, services: next };
    });
  };

  const toggleCellule = (id) => {
    setScopeForm((prev) => {
      const next = prev.cellules.includes(id) ? prev.cellules.filter((x) => x !== id) : [...prev.cellules, id];
      return { ...prev, cellules: next };
    });
  };

  const toggleSection = (id) => {
    setScopeForm((prev) => {
      const next = prev.sections.includes(id) ? prev.sections.filter((x) => x !== id) : [...prev.sections, id];
      return { ...prev, sections: next };
    });
  };

  // Cocher une catégorie (ex. "ETAT CIVIL") ne fait rien à elle seule pour le
  // périmètre — seuls les sous-types (feuilles) sont réellement rattachés à
  // un document, la catégorie elle-même ne l'est jamais. Cocher la case
  // "catégorie" sélectionne donc tous ses sous-types d'un coup ; son propre
  // id n'est jamais ajouté à scope_types_documents.
  const toggleTypeDocument = (id) => {
    const children = typesDocuments.filter((t) => t.parent === id);
    setScopeForm((prev) => {
      if (children.length > 0) {
        const childIds = children.map((c) => c.id);
        const allSelected = childIds.every((cid) => prev.types_documents.includes(cid));
        const next = allSelected
          ? prev.types_documents.filter((x) => !childIds.includes(x))
          : [...new Set([...prev.types_documents, ...childIds])];
        return { ...prev, types_documents: next };
      }
      const next = prev.types_documents.includes(id)
        ? prev.types_documents.filter((x) => x !== id)
        : [...prev.types_documents, id];
      return { ...prev, types_documents: next };
    });
  };

  // État "coché" d'une ligne Types de documents — pour une catégorie, reflète
  // si TOUS ses sous-types sont sélectionnés (son propre id n'est jamais
  // dans scope_types_documents, voir toggleTypeDocument).
  const isTypeDocChecked = (item) => {
    if (item.is_categorie) {
      const childIds = typesDocuments.filter((t) => t.parent === item.id).map((c) => c.id);
      return childIds.length > 0 && childIds.every((cid) => scopeForm.types_documents.includes(cid));
    }
    return scopeForm.types_documents.includes(item.id);
  };

  const toggleChampPersonnel = (id) => {
    setScopeForm((prev) => {
      const next = prev.champs_personnels.includes(id)
        ? prev.champs_personnels.filter((x) => x !== id)
        : [...prev.champs_personnels, id];
      return { ...prev, champs_personnels: next };
    });
  };

  const selectAllInLevel = (level, items) => {
    // Pour les types de documents, ne jamais ajouter l'id d'une catégorie —
    // elle n'est jamais rattachée à un document, seuls ses sous-types comptent.
    const ids = level === "types_documents"
      ? items.filter((item) => !item.is_categorie).map((item) => item.id)
      : items.map((item) => item.id);
    setScopeForm((prev) => ({ ...prev, [level]: ids }));
  };

  const clearLevel = (level) => {
    setScopeForm((prev) => ({ ...prev, [level]: [] }));
  };

  return {
    directions,
    poles,
    departements,
    services,
    cellules,
    sections,
    typesDocuments,
    champsPersonnels,
    scopeForm,
    setScopeForm,
    visiblePoles,
    visibleDepartements,
    visibleServices,
    visibleCellules,
    visibleSections,
    toggleDirection,
    togglePole,
    toggleDepartement,
    toggleService,
    toggleCellule,
    toggleSection,
    toggleTypeDocument,
    isTypeDocChecked,
    toggleChampPersonnel,
    selectAllInLevel,
    clearLevel,
  };
}

import { useTheme } from "../../context/ThemeContext";
import {
  IconDirection,
  IconPole,
  IconDepartement,
  IconService,
  IconCellule,
  IconSection,
} from "./icons";
import HierarchyCard from "./HierarchyCard";
import SectionHeader from "./SectionHeader";

const delayClass = (i) =>
  ["", "delay-1", "delay-2", "delay-3", "delay-4", "delay-5", "delay-6", "delay-7"][
    Math.min(i, 7)
  ];

// Vue drill-down Direction → Département → Service de /employees — extrait
// de Employees.jsx pour garder la page principale sous les 1000 lignes.
// Reçoit tout ce dont il a besoin en props : aucun état local, aucun appel
// API (tout est déjà chargé/dérivé côté page parente).
const HierarchyView = ({
  hierarchyLoading,
  hierarchyKey,
  view,
  directions,
  poles,
  departements,
  services,
  selectedDirection,
  selectedPole,
  selectedDepartement,
  departementsDePole,
  cellulesDirection,
  sectionsDirection,
  cellulesDepartement,
  sectionsDepartement,
  selectDirection,
  selectPole,
  selectDepartement,
  selectService,
  selectCellule,
  selectSection,
}) => {
  const theme = useTheme();
  if (hierarchyLoading) {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 20,
        }}
      >
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            style={{
              background: theme.surface,
              borderRadius: theme.cardRadius,
              minHeight: 240,
              border: `1px solid ${theme.border}`,
              animation: "somizFadeIn 1s ease infinite alternate",
              opacity: 0.5,
            }}
          />
        ))}
      </div>
    );
  }

  // Style/comportement par type de nœud — un même écran (departements/
  // services) peut mélanger plusieurs types (Pôle+Département+Cellule,
  // ou Service+Cellule), donc le style se lit par item, pas par écran.
  const TYPE_META = {
    direction: {
      color: theme.directionColor,
      gradient: theme.directionGrad,
      icon: <IconDirection size={28} />,
      countLabel: "département(s)",
      countKey: "nb_departements",
      onSelect: selectDirection,
    },
    pole: {
      color: "#0d9488",
      gradient: "linear-gradient(135deg, #042f2e 0%, #0d9488 60%, #14b8a6 100%)",
      icon: <IconPole size={28} />,
      countLabel: "département(s)",
      countKey: "nb_departements",
      onSelect: selectPole,
    },
    departement: {
      color: theme.departementColor,
      gradient: theme.departementGrad,
      icon: <IconDepartement size={28} />,
      countLabel: "service(s)",
      countKey: "nb_services",
      onSelect: selectDepartement,
    },
    service: {
      color: theme.serviceColor,
      gradient: theme.serviceGrad,
      icon: <IconService size={28} />,
      countLabel: "employé(s)",
      countKey: "nb_employes",
      onSelect: selectService,
    },
    cellule: {
      color: "#b45309",
      gradient: "linear-gradient(135deg, #451a03 0%, #b45309 60%, #d97706 100%)",
      icon: <IconCellule size={28} />,
      countLabel: "employé(s)",
      countKey: "nb_employes",
      onSelect: selectCellule,
    },
    section: {
      color: "#0369a1",
      gradient: "linear-gradient(135deg, #082f49 0%, #0369a1 60%, #0ea5e9 100%)",
      icon: <IconSection size={28} />,
      countLabel: "employé(s)",
      countKey: "nb_employes",
      onSelect: selectSection,
    },
  };

  const configs = {
    directions: {
      title: "Directions",
      subtitle: "Sélectionnez une direction pour explorer ses départements",
      color: theme.directionColor,
      items: directions.map((d) => {
        // Badge composé : une Direction organisée en Pôles ou avec des
        // Cellules directes ne doit pas afficher seulement "X
        // département(s)" — trompeur si l'essentiel passe par des Pôles.
        const parts = [];
        if (d.nb_departements) parts.push(`${d.nb_departements} départ.`);
        if (d.nb_poles) parts.push(`${d.nb_poles} pôle(s)`);
        if (d.nb_cellules) parts.push(`${d.nb_cellules} cellule(s)`);
        if (d.nb_sections) parts.push(`${d.nb_sections} section(s)`);
        return {
          ...d,
          __type: "direction",
          __badge: parts.length > 0 ? parts.join(" · ") : null,
        };
      }),
    },
    departements: selectedPole
      ? {
          title: `Départements · ${selectedPole.nom}`,
          subtitle: "Sélectionnez un département pour voir ses services",
          color: "#0d9488",
          items: departementsDePole.map((d) => ({ ...d, __type: "departement" })),
        }
      : {
          title: `Direction · ${selectedDirection?.nom}`,
          subtitle: "Pôles, départements directs et cellules de cette direction",
          color: theme.directionColor,
          items: [
            ...poles.map((p) => ({ ...p, __type: "pole" })),
            ...departements
              .filter((d) => !d.pole)
              .map((d) => ({ ...d, __type: "departement" })),
            ...cellulesDirection.map((c) => ({ ...c, __type: "cellule" })),
            ...sectionsDirection.map((s) => ({ ...s, __type: "section" })),
          ],
        },
    services: {
      title: `Département · ${selectedDepartement?.nom}`,
      subtitle: "Services et cellules de ce département",
      color: theme.departementColor,
      items: [
        ...services.map((s) => ({ ...s, __type: "service" })),
        ...cellulesDepartement.map((c) => ({ ...c, __type: "cellule" })),
        ...sectionsDepartement.map((s) => ({ ...s, __type: "section" })),
      ],
    },
  };

  const cfg = configs[view];
  if (!cfg) return null;

  return (
    <div key={hierarchyKey} className="anim-fade-in">
      <SectionHeader title={cfg.title} subtitle={cfg.subtitle} color={cfg.color} />

      {cfg.items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "64px 24px",
            background: theme.surface,
            border: `2px dashed ${theme.border}`,
            borderRadius: theme.cardRadius,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}>◈</div>
          <div
            style={{
              fontWeight: 700,
              color: theme.text,
              fontSize: 15,
              fontFamily: theme.fontFamily,
            }}
          >
            Aucun élément configuré
          </div>
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>
            Configurez les référentiels dans Paramètres
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 20,
          }}
        >
          {cfg.items.map((item, idx) => {
            const meta = TYPE_META[item.__type];
            const hasBadge = item.__badge !== undefined;
            return (
              <HierarchyCard
                key={item.id}
                icon={meta.icon}
                name={item.nom}
                code={item.code}
                count={
                  hasBadge
                    ? item.__badge
                    : item[meta.countKey] != null
                      ? item[meta.countKey]
                      : undefined
                }
                countLabel={hasBadge ? "" : meta.countLabel}
                gradient={meta.gradient}
                accentColor={meta.color}
                animClass={`anim-pop ${delayClass(idx)}`}
                onClick={() => meta.onSelect(item)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HierarchyView;

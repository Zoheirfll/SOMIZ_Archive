import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";

const LEVEL = {
  direction: {
    label: "Direction",
    color: "#166534",
    bg: "#F0FDF4",
    border: "#BBF7D0",
  },
  pole: {
    label: "Pôle",
    color: "#0d9488",
    bg: "#F0FDFA",
    border: "#99F6E4",
  },
  departement: {
    label: "Département",
    color: "#1e40af",
    bg: "#EFF6FF",
    border: "#BFDBFE",
  },
  service: {
    label: "Service",
    color: "#6d28d9",
    bg: "#F5F3FF",
    border: "#DDD6FE",
  },
  cellule: {
    label: "Cellule",
    color: "#b45309",
    bg: "#FFFBEB",
    border: "#FDE68A",
  },
};

const CHILD_LABEL = {
  direction: "département/pôle/cellule",
  pole: "département(s)",
  departement: "service/cellule",
};

const ArrowRightIcon = ({ color }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

// Carte d'un nœud de l'arbre (Direction, Pôle, Département, Service ou
// Cellule) dans l'écran drill-down. Le corps de la carte descend d'un
// niveau (s'il a des enfants) ; le bouton flèche mène directement à la
// liste des employés filtrée sur ce nœud.
const OrgCard = ({ level, nom, childCount, hasChildren, onEnter, onNavigate, accessible }) => {
  const s = LEVEL[level];
  const color = accessible ? s.color : "#64748B";
  const bg = accessible ? s.bg : "#F1F5F9";
  const border = accessible ? s.border : "#CBD5E1";
  return (
    <div
      className="hover-lift"
      onClick={hasChildren ? onEnter : accessible ? onNavigate : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: hasChildren || accessible ? "pointer" : "default",
        opacity: accessible ? 1 : 0.9,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {s.label}
        </div>
        <div
          style={{
            color: accessible ? theme.text : theme.textMuted,
            fontSize: 15,
            fontWeight: 700,
            fontFamily: theme.fontFamily,
            whiteSpace: "normal",
            wordBreak: "break-word",
          }}
        >
          {nom}
        </div>
        {childCount != null && (
          <div style={{ color, fontSize: 11, fontWeight: 700, marginTop: 4 }}>
            {childCount} {CHILD_LABEL[level]}
          </div>
        )}
        {!accessible && (
          <span
            title="Hors de votre périmètre"
            style={{
              display: "inline-block",
              marginTop: 4,
              background: "#E2E8F0",
              border: "1px solid #94A3B8",
              color: "#475569",
              borderRadius: 20,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Hors périmètre
          </span>
        )}
      </div>

      {accessible && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
          title="Voir les employés"
          aria-label="Voir les employés"
          style={{
            background: color,
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ArrowRightIcon color="#fff" />
        </button>
      )}
    </div>
  );
};

const Organigramme = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [directions, setDirections] = useState([]);
  const [poles, setPoles] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [services, setServices] = useState([]);
  const [cellules, setCellules] = useState([]);
  const [accessibleDirIds, setAccessibleDirIds] = useState(null);
  const [accessiblePoleIds, setAccessiblePoleIds] = useState(null);
  const [accessibleDeptIds, setAccessibleDeptIds] = useState(null);
  const [accessibleSvcIds, setAccessibleSvcIds] = useState(null);
  const [accessibleCelIds, setAccessibleCelIds] = useState(null);
  const [loading, setLoading] = useState(true);
  // Chemin depuis la racine SOMIZ jusqu'à l'écran courant, ex.
  // [{id, level: "direction", nom}, {id, level: "departement", nom}].
  const [path, setPath] = useState([]);

  const fetchAllPages = async (url) => {
    let results = [];
    let next = url;
    let opts = {};
    while (next) {
      const res = await api.get(next, opts);
      const data = res.data;
      results = results.concat(data.results || data);
      if (data.next) {
        const nextUrl = new URL(data.next);
        next = nextUrl.pathname + nextUrl.search;
        opts = { baseURL: "" };
      } else {
        next = null;
      }
    }
    return results;
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Arbre complet (?all=1 ignore le périmètre CONSULTANT côté backend)
        // + listes scopées, pour déterminer ce qui reste accessible.
        const [dir, pol, dept, srv, cel, scopedDir, scopedPol, scopedDept, scopedSrv, scopedCel] = await Promise.all([
          fetchAllPages("/ref/directions/?all=1"),
          fetchAllPages("/ref/poles/?all=1"),
          fetchAllPages("/ref/departements/?all=1"),
          fetchAllPages("/ref/services/?all=1"),
          fetchAllPages("/ref/cellules/?all=1"),
          fetchAllPages("/ref/directions/"),
          fetchAllPages("/ref/poles/"),
          fetchAllPages("/ref/departements/"),
          fetchAllPages("/ref/services/"),
          fetchAllPages("/ref/cellules/"),
        ]);
        setDirections(dir.filter((d) => d.is_active));
        setPoles(pol.filter((p) => p.is_active));
        setDepartements(dept.filter((d) => d.is_active));
        setServices(srv.filter((s) => s.is_active));
        setCellules(cel.filter((c) => c.is_active));
        setAccessibleDirIds(new Set(scopedDir.map((d) => d.id)));
        setAccessiblePoleIds(new Set(scopedPol.map((p) => p.id)));
        setAccessibleDeptIds(new Set(scopedDept.map((d) => d.id)));
        setAccessibleSvcIds(new Set(scopedSrv.map((s) => s.id)));
        setAccessibleCelIds(new Set(scopedCel.map((c) => c.id)));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Enfants d'un nœud, quel que soit son type — reflète les règles
  // métier : un Département peut être direct sous une Direction OU sous
  // un Pôle ; une Cellule peut être sous une Direction OU un Département.
  const childrenOf = (node, level) => {
    if (level === "direction") {
      return [
        ...poles.filter((p) => p.direction === node.id).map((p) => ({ ...p, level: "pole" })),
        ...departements
          .filter((d) => d.direction === node.id && !d.pole)
          .map((d) => ({ ...d, level: "departement" })),
        ...cellules.filter((c) => c.direction === node.id).map((c) => ({ ...c, level: "cellule" })),
      ];
    }
    if (level === "pole") {
      return departements.filter((d) => d.pole === node.id).map((d) => ({ ...d, level: "departement" }));
    }
    if (level === "departement") {
      return [
        ...services.filter((s) => s.departement === node.id).map((s) => ({ ...s, level: "service" })),
        ...cellules.filter((c) => c.departement === node.id).map((c) => ({ ...c, level: "cellule" })),
      ];
    }
    return [];
  };

  // Un nœud est accessible si la liste scopée correspondante (déjà filtrée
  // par le backend selon le périmètre CONSULTANT) le contient.
  const isAccessible = (node, level) => {
    if (!accessibleDirIds) return true; // pas encore chargé — pas de flash grisé
    if (level === "direction") return accessibleDirIds.has(node.id);
    if (level === "pole") return accessiblePoleIds.has(node.id);
    if (level === "departement") return accessibleDeptIds.has(node.id);
    if (level === "service") return accessibleSvcIds.has(node.id);
    if (level === "cellule") return accessibleCelIds.has(node.id);
    return true;
  };

  const navigateTo = (node, level) => {
    const paramByLevel = {
      direction: "direction",
      pole: "pole",
      departement: "departement",
      service: "service",
      cellule: "cellule",
    };
    navigate(`/employees?${paramByLevel[level]}=${node.id}`);
  };

  // Enfants affichés à l'écran courant : les Directions à la racine, ou
  // les enfants du dernier nœud du chemin sinon.
  const current = path.length > 0 ? path[path.length - 1] : null;
  const currentChildren = current
    ? childrenOf(current, current.level)
    : directions.map((d) => ({ ...d, level: "direction" }));

  const enter = (node) => setPath((prev) => [...prev, node]);
  const goToDepth = (depth) => setPath((prev) => prev.slice(0, depth));

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      <div
        style={{
          background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
          padding: isMobile ? "24px 16px" : "40px 32px 32px",
        }}
      >
        <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Organigramme
        </h1>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 4,
            marginTop: 12,
            fontSize: 13,
          }}
        >
          <span
            onClick={() => goToDepth(0)}
            style={{
              color: "rgba(255,255,255,0.85)",
              fontWeight: path.length === 0 ? 800 : 600,
              cursor: path.length === 0 ? "default" : "pointer",
              textDecoration: path.length === 0 ? "none" : "underline",
            }}
          >
            SOMIZ
          </span>
          {path.map((node, i) => (
            <span key={node.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>›</span>
              <span
                onClick={() => goToDepth(i + 1)}
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontWeight: i === path.length - 1 ? 800 : 600,
                  cursor: i === path.length - 1 ? "default" : "pointer",
                  textDecoration: i === path.length - 1 ? "none" : "underline",
                }}
              >
                {node.nom}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px 24px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>
            Chargement de l'organigramme...
          </div>
        ) : directions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: theme.textMuted }}>
            Aucune direction configurée.
          </div>
        ) : (
          // Layout en grappe : le nœud courant, un tronc, une barre horizontale,
          // puis ses enfants en grille qui s'enroule sur plusieurs lignes — jamais
          // de scroll horizontal, quel que soit le nombre d'enfants.
          <div style={{ textAlign: "center" }}>
            {/* Nœud courant — SOMIZ à la racine, sinon le dernier élément du chemin */}
            <div style={{ width: 240, margin: "0 auto" }}>
              {current ? (
                <OrgCard
                  level={current.level}
                  nom={current.nom}
                  hasChildren={false}
                  onEnter={undefined}
                  onNavigate={() => navigateTo(current, current.level)}
                  accessible={isAccessible(current, current.level)}
                />
              ) : (
                <div
                  style={{
                    background: theme.text,
                    color: "#fff",
                    borderRadius: 12,
                    padding: "14px 0",
                    fontWeight: 800,
                    fontSize: 15,
                    letterSpacing: "0.02em",
                  }}
                >
                  SOMIZ
                </div>
              )}
            </div>

            {currentChildren.length === 0 ? (
              <div style={{ padding: "40px 0 20px", color: theme.textMuted }}>
                Aucun élément à ce niveau.
              </div>
            ) : (
              <>
                {/* Tronc vertical du nœud courant vers la barre */}
                <div style={{ width: 2, height: 24, background: theme.textMuted, margin: "0 auto" }} />
                {/* Barre horizontale regroupant tous les enfants */}
                <div style={{ height: 2, background: theme.textMuted, maxWidth: 640, margin: "0 auto" }} />
                <div style={{ width: 2, height: 24, background: theme.textMuted, margin: "0 auto" }} />

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 14,
                  }}
                >
                  {currentChildren.map((node) => {
                    const children = childrenOf(node, node.level);
                    return (
                      <div key={node.id} style={{ width: 240 }}>
                        <OrgCard
                          level={node.level}
                          nom={node.nom}
                          hasChildren={children.length > 0}
                          childCount={children.length || undefined}
                          onEnter={() => enter(node)}
                          onNavigate={() => navigateTo(node, node.level)}
                          accessible={isAccessible(node, node.level)}
                        />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </PageBackground>
  );
};

export default Organigramme;

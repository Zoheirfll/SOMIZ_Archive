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

const ChevronIcon = ({ open, color }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: open ? "rotate(90deg)" : "rotate(0deg)",
      transition: "transform 0.15s ease",
      flexShrink: 0,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

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

// Un nœud de l'arbre (Direction, Pôle, Département, Service ou Cellule) —
// accordéon vertical : cliquer le corps de la carte déplie ses enfants
// juste en dessous (indentés), cliquer la flèche navigue vers la liste
// filtrée. Ce pattern garantit que la page ne déborde jamais
// horizontalement, contrairement à un diagramme en arbre classique.
const OrgNode = ({ level, nom, childCount, hasChildren, depth, onToggle, open, onNavigate }) => {
  const s = LEVEL[level];
  return (
    <div
      className="hover-lift"
      onClick={hasChildren ? onToggle : onNavigate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginLeft: depth * 28,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderLeft: `4px solid ${s.color}`,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: "pointer",
      }}
    >
      {hasChildren ? (
        <ChevronIcon open={open} color={s.color} />
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: s.color,
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
            color: theme.text,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: theme.fontFamily,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={nom}
        >
          {nom}
        </div>
      </div>

      {childCount != null && (
        <span
          style={{
            background: "#fff",
            border: `1px solid ${s.border}`,
            color: s.color,
            borderRadius: 20,
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {childCount} {CHILD_LABEL[level]}
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate();
        }}
        title="Voir les employés"
        aria-label="Voir les employés"
        style={{
          background: s.color,
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
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState(new Set());

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
        const [dir, pol, dept, srv, cel] = await Promise.all([
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
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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

  const renderNode = (node, level, depth) => {
    const children = childrenOf(node, level);
    const open = openIds.has(node.id);
    return (
      <div key={node.id}>
        <OrgNode
          level={level}
          nom={node.nom}
          depth={depth}
          hasChildren={children.length > 0}
          open={open}
          childCount={children.length || undefined}
          onToggle={() => toggle(node.id)}
          onNavigate={() => navigateTo(node, level)}
        />
        {open && children.map((child) => renderNode(child, child.level, depth + 1))}
      </div>
    );
  };

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
        <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 6 }}>
          Cliquez sur une ligne pour déplier, ou sur la flèche pour voir les employés
        </div>
      </div>

      <div style={{ padding: isMobile ? "16px" : "32px", maxWidth: 900, margin: "0 auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>
            Chargement de l'organigramme...
          </div>
        ) : directions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: theme.textMuted }}>
            Aucune direction configurée.
          </div>
        ) : (
          <div>
            {directions.map((dir) => renderNode(dir, "direction", 0))}
          </div>
        )}
      </div>
    </PageBackground>
  );
};

export default Organigramme;

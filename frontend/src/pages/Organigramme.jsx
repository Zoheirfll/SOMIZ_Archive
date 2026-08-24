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
    countLabel: "département(s)",
  },
  departement: {
    label: "Département",
    color: "#1e40af",
    bg: "#EFF6FF",
    border: "#BFDBFE",
    countLabel: "service(s)",
  },
  service: {
    label: "Service",
    color: "#6d28d9",
    bg: "#F5F3FF",
    border: "#DDD6FE",
    countLabel: null,
  },
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

// Un nœud de l'arbre (Direction, Département ou Service) — accordéon
// vertical : cliquer le corps de la carte déplie ses enfants juste en
// dessous (indentés), cliquer la flèche navigue vers la liste filtrée.
// Ce pattern garantit que la page ne déborde jamais horizontalement,
// contrairement à un diagramme en arbre classique avec beaucoup de nœuds.
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
          {childCount} {s.countLabel}
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
  const [departements, setDepartements] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDirections, setOpenDirections] = useState(new Set());
  const [openDepartements, setOpenDepartements] = useState(new Set());

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
        const [dir, dept, srv] = await Promise.all([
          fetchAllPages("/ref/directions/"),
          fetchAllPages("/ref/departements/"),
          fetchAllPages("/ref/services/"),
        ]);
        setDirections(dir.filter((d) => d.is_active));
        setDepartements(dept.filter((d) => d.is_active));
        setServices(srv.filter((s) => s.is_active));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const deptsOf = (directionId) => departements.filter((d) => d.direction === directionId);
  const servicesOf = (departementId) => services.filter((s) => s.departement === departementId);

  const toggle = (set, setSet, id) => {
    setSet((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
            {directions.map((dir) => {
              const depts = deptsOf(dir.id);
              const dirOpen = openDirections.has(dir.id);
              return (
                <div key={dir.id}>
                  <OrgNode
                    level="direction"
                    nom={dir.nom}
                    depth={0}
                    hasChildren={depts.length > 0}
                    open={dirOpen}
                    childCount={depts.length || undefined}
                    onToggle={() => toggle(openDirections, setOpenDirections, dir.id)}
                    onNavigate={() => navigate(`/employees?direction=${dir.id}`)}
                  />
                  {dirOpen &&
                    depts.map((dept) => {
                      const svcs = servicesOf(dept.id);
                      const deptOpen = openDepartements.has(dept.id);
                      return (
                        <div key={dept.id}>
                          <OrgNode
                            level="departement"
                            nom={dept.nom}
                            depth={1}
                            hasChildren={svcs.length > 0}
                            open={deptOpen}
                            childCount={svcs.length || undefined}
                            onToggle={() => toggle(openDepartements, setOpenDepartements, dept.id)}
                            onNavigate={() => navigate(`/employees?departement=${dept.id}`)}
                          />
                          {deptOpen &&
                            svcs.map((svc) => (
                              <OrgNode
                                key={svc.id}
                                level="service"
                                nom={svc.nom}
                                depth={2}
                                hasChildren={false}
                                childCount={null}
                                onNavigate={() => navigate(`/employees?service=${svc.id}`)}
                              />
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageBackground>
  );
};

export default Organigramme;

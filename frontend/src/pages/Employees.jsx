import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import "../styles/animations.css";
import PageBackground from "../components/PageBackground";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconDirection = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const IconDepartement = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2"/>
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
    <line x1="10" y1="14" x2="14" y2="14"/>
  </svg>
);

const IconService = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
  </svg>
);

const IconUsers = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconChevronRight = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

const IconArrowRight = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconImport = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconPlus = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

// ─── Carte hiérarchique premium ───────────────────────────────────────────────

const HierarchyCard = ({ icon, name, code, count, countLabel, gradient, accentColor, animClass, onClick }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={animClass}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: theme.surface,
        borderRadius: theme.cardRadius,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: hovered ? theme.shadowLg : theme.shadowMd,
        transform: hovered ? "translateY(-6px) scale(1.01)" : "translateY(0) scale(1)",
        transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
        display: "flex",
        flexDirection: "column",
        minHeight: 240,
        border: `1px solid ${hovered ? accentColor + "40" : theme.border}`,
      }}
    >
      {/* Zone gradient supérieure */}
      <div style={{
        background: gradient,
        padding: "28px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Cercle décoratif */}
        <div style={{
          position: "absolute",
          top: -30,
          right: -30,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.07)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          bottom: -20,
          left: "30%",
          width: 70,
          height: 70,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }} />

        {/* Icône */}
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: "rgba(255,255,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}>
          {icon}
        </div>

        {/* Compteur */}
        {count != null && (
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            background: "rgba(255,255,255,0.18)",
            borderRadius: 20,
            padding: "4px 12px",
            color: "rgba(255,255,255,0.95)",
            fontSize: 12,
            fontWeight: 600,
            width: "fit-content",
            backdropFilter: "blur(4px)",
          }}>
            {count} {countLabel}
          </div>
        )}
      </div>

      {/* Zone informations basse */}
      <div style={{
        padding: "18px 24px 20px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            color: theme.text,
            fontWeight: 700,
            fontSize: 16,
            lineHeight: 1.3,
            marginBottom: code ? 8 : 0,
            fontFamily: theme.fontFamily,
          }}>
            {name}
          </div>
          {code && (
            <div style={{
              color: accentColor,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
              fontFamily: "monospace",
              background: accentColor + "12",
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 5,
            }}>
              {code}
            </div>
          )}
        </div>

        {/* Lien explorer */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 14,
          paddingTop: 14,
          borderTop: `1px solid ${theme.border}`,
        }}>
          <span style={{
            color: hovered ? accentColor : theme.textMuted,
            fontSize: 12,
            fontWeight: 600,
            transition: "color 0.2s",
          }}>
            Explorer
          </span>
          <div style={{
            color: hovered ? accentColor : theme.textMuted,
            display: "flex",
            alignItems: "center",
            transition: "all 0.2s",
            transform: hovered ? "translateX(4px)" : "translateX(0)",
          }}>
            <IconArrowRight size={15} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

const Breadcrumb = ({ items }) => (
  <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
    {items.map((item, idx) => (
      <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {idx > 0 && (
          <span style={{ color: theme.textMuted, display: "flex", alignItems: "center" }}>
            <IconChevronRight size={11} />
          </span>
        )}
        <button
          onClick={item.onClick}
          disabled={!item.onClick || idx === items.length - 1}
          style={{
            background: "none",
            border: "none",
            padding: "3px 8px",
            borderRadius: 6,
            color: idx === items.length - 1 ? theme.text : theme.primary,
            fontWeight: idx === items.length - 1 ? 700 : 500,
            fontSize: 13,
            cursor: idx === items.length - 1 ? "default" : "pointer",
            fontFamily: theme.fontFamily,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { if (idx < items.length - 1) e.currentTarget.style.background = theme.primaryBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
        >
          {item.label}
        </button>
      </span>
    ))}
  </nav>
);

// ─── Section header ───────────────────────────────────────────────────────────

const SectionHeader = ({ title, subtitle, color }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
      <div style={{
        width: 4,
        height: 28,
        background: color,
        borderRadius: 2,
      }} />
      <h2 style={{
        color: theme.text,
        fontWeight: 800,
        fontSize: 20,
        margin: 0,
        fontFamily: theme.fontFamily,
      }}>
        {title}
      </h2>
    </div>
    <p style={{
      color: theme.textSecondary,
      fontSize: 13,
      margin: "0 0 0 16px",
      fontFamily: theme.fontFamily,
    }}>
      {subtitle}
    </p>
  </div>
);

// ─── Composant principal ──────────────────────────────────────────────────────

const Employees = () => {
  const [view, setView] = useState("directions");
  const [selectedDirection, setSelectedDirection] = useState(null);
  const [selectedDepartement, setSelectedDepartement] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [directions, setDirections] = useState([]);
  const [departements, setDepartements] = useState([]);
  const [services, setServices] = useState([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [hierarchyKey, setHierarchyKey] = useState(0);

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("q") || "";
  const statut = searchParams.get("statut") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const ordering = searchParams.get("ordering") || "nom";

  const setSearch = (val) => setSearchParams((p) => { const n = new URLSearchParams(p); if (val) n.set("q", val); else n.delete("q"); n.set("page", "1"); return n; }, { replace: true });
  const setStatut = (val) => setSearchParams((p) => { const n = new URLSearchParams(p); if (val) n.set("statut", val); else n.delete("statut"); n.set("page", "1"); return n; }, { replace: true });
  const setPage = (val) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("page", String(typeof val === "function" ? val(page) : val)); return n; }, { replace: true });
  const setOrdering = (val) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set("ordering", typeof val === "function" ? val(ordering) : val); n.set("page", "1"); return n; }, { replace: true });

  const PAGE_SIZE = 25;

  useEffect(() => { setSelected(new Set()); }, [search, statut, ordering]);

  // ─── Fetch hierarchy data ─────────────────────────────────────────────────

  useEffect(() => {
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const res = await api.get("/ref/directions/");
        setDirections(res.data.results || res.data);
      } catch { setDirections([]); }
      finally { setHierarchyLoading(false); }
    };
    fetch();
  }, []);

  useEffect(() => {
    if (!selectedDirection) return;
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const res = await api.get("/ref/departements/", { params: { direction: selectedDirection.id } });
        setDepartements(res.data.results || res.data);
      } catch { setDepartements([]); }
      finally { setHierarchyLoading(false); }
    };
    fetch();
  }, [selectedDirection]);

  useEffect(() => {
    if (!selectedDepartement) return;
    const fetch = async () => {
      setHierarchyLoading(true);
      try {
        const res = await api.get("/ref/services/", { params: { departement: selectedDepartement.id } });
        setServices(res.data.results || res.data);
      } catch { setServices([]); }
      finally { setHierarchyLoading(false); }
    };
    fetch();
  }, [selectedDepartement]);

  // ─── Fetch employees ──────────────────────────────────────────────────────

  const fetchEmployees = useCallback(async () => {
    if (view !== "employees") return;
    setLoading(true);
    try {
      const params = { page };
      if (search) params.q = search;
      if (statut) params.statut = statut;
      if (ordering) params.ordering = ordering;
      if (selectedService) params.service = selectedService.id;
      const response = await api.get("/employees/", { params });
      setEmployees(response.data.results || response.data);
      setTotalCount(response.data.count || 0);
      setTotalPages(Math.ceil((response.data.count || 0) / PAGE_SIZE));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [view, search, statut, page, ordering, selectedService]);

  useEffect(() => {
    if (view !== "employees") return;
    const delay = setTimeout(fetchEmployees, 300);
    return () => clearTimeout(delay);
  }, [fetchEmployees]);

  // ─── Navigation ───────────────────────────────────────────────────────────

  const goToDirections = () => { setView("directions"); setSelectedDirection(null); setSelectedDepartement(null); setSelectedService(null); setHierarchyKey(k => k + 1); };
  const selectDirection = (dir) => { setSelectedDirection(dir); setSelectedDepartement(null); setSelectedService(null); setView("departements"); setHierarchyKey(k => k + 1); };
  const selectDepartement = (dept) => { setSelectedDepartement(dept); setSelectedService(null); setView("services"); setHierarchyKey(k => k + 1); };
  const selectService = (svc) => { setSelectedService(svc); setView("employees"); setPage(1); setHierarchyKey(k => k + 1); };
  const goToAllEmployees = () => { setSelectedService(null); setView("employees"); setPage(1); };

  // ─── Bulk actions ─────────────────────────────────────────────────────────

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => selected.size === employees.length ? setSelected(new Set()) : setSelected(new Set(employees.map(e => e.id)));

  const handleBulkAction = async (action) => {
    if (selected.size === 0) return;
    const msg = action === "delete"
      ? `Supprimer définitivement ${selected.size} employé(s) ? Cette action est irréversible.`
      : `Archiver ${selected.size} employé(s) ?`;
    if (!window.confirm(msg)) return;
    setDeleting(true);
    try {
      const response = await api.post("/employees/bulk-delete/", { ids: Array.from(selected), action });
      const nb = response.data.nb_supprimes || response.data.nb_archives;
      setMessage({ type: "success", text: action === "delete" ? `${nb} employé(s) supprimé(s).` : `${nb} employé(s) archivé(s).` });
      setSelected(new Set());
      fetchEmployees();
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur lors de l'opération." });
    } finally {
      setDeleting(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  const allSelected = employees.length > 0 && selected.size === employees.length;
  const someSelected = selected.size > 0;

  // ─── Recherche globale (visible sur toutes les vues) ──────────────────────
  const [globalInput, setGlobalInput] = useState("");

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    const q = globalInput.trim();
    if (!q) return;
    setSelectedService(null);
    setView("employees");
    setSearchParams((p) => {
      const n = new URLSearchParams(p);
      n.set("q", q);
      n.set("page", "1");
      return n;
    }, { replace: true });
    setHierarchyKey((k) => k + 1);
  };

  // ─── Breadcrumb items ─────────────────────────────────────────────────────

  const breadcrumbItems = [
    { label: "Toutes les directions", onClick: view !== "directions" ? goToDirections : null },
    ...(selectedDirection ? [{ label: selectedDirection.nom, onClick: view !== "departements" ? () => { setView("departements"); setSelectedDepartement(null); setSelectedService(null); setHierarchyKey(k => k + 1); } : null }] : []),
    ...(selectedDepartement ? [{ label: selectedDepartement.nom, onClick: view !== "services" ? () => { setView("services"); setSelectedService(null); setHierarchyKey(k => k + 1); } : null }] : []),
    ...(selectedService ? [{ label: selectedService.nom, onClick: null }] : []),
    ...(view === "employees" && !selectedService ? [{ label: "Tous les employés", onClick: null }] : []),
  ];

  const delayClass = (i) => ["", "delay-1", "delay-2", "delay-3", "delay-4", "delay-5", "delay-6", "delay-7"][Math.min(i, 7)];

  // ─── Render hierarchy ─────────────────────────────────────────────────────

  const renderHierarchy = () => {
    if (hierarchyLoading) {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: theme.surface, borderRadius: theme.cardRadius, minHeight: 240, border: `1px solid ${theme.border}`, animation: "somizFadeIn 1s ease infinite alternate", opacity: 0.5 }} />
          ))}
        </div>
      );
    }

    const configs = {
      directions: {
        title: "Directions",
        subtitle: "Sélectionnez une direction pour explorer ses départements",
        items: directions,
        color: theme.directionColor,
        gradient: theme.directionGrad,
        accent: theme.directionAccent,
        icon: <IconDirection size={28} />,
        countLabel: "département(s)",
        countKey: "nb_departements",
        onSelect: selectDirection,
      },
      departements: {
        title: `Départements · ${selectedDirection?.nom}`,
        subtitle: "Sélectionnez un département pour voir ses services",
        items: departements,
        color: theme.departementColor,
        gradient: theme.departementGrad,
        accent: theme.departementAccent,
        icon: <IconDepartement size={28} />,
        countLabel: "service(s)",
        countKey: "nb_services",
        onSelect: selectDepartement,
      },
      services: {
        title: `Services · ${selectedDepartement?.nom}`,
        subtitle: "Sélectionnez un service pour voir ses employés",
        items: services,
        color: theme.serviceColor,
        gradient: theme.serviceGrad,
        accent: theme.serviceAccent,
        icon: <IconService size={28} />,
        countLabel: "employé(s)",
        countKey: "nb_employes",
        onSelect: selectService,
      },
    };

    const cfg = configs[view];
    if (!cfg) return null;

    return (
      <div key={hierarchyKey} className="anim-fade-in">
        <SectionHeader title={cfg.title} subtitle={cfg.subtitle} color={cfg.color} />

        {cfg.items.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "64px 24px",
            background: theme.surface,
            border: `2px dashed ${theme.border}`,
            borderRadius: theme.cardRadius,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.25 }}>◈</div>
            <div style={{ fontWeight: 700, color: theme.text, fontSize: 15, fontFamily: theme.fontFamily }}>Aucun élément configuré</div>
            <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 6 }}>Configurez les référentiels dans Paramètres</div>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 20,
          }}>
            {cfg.items.map((item, idx) => (
              <HierarchyCard
                key={item.id}
                icon={cfg.icon}
                name={item.nom}
                code={item.code}
                count={item[cfg.countKey] != null ? item[cfg.countKey] : undefined}
                countLabel={cfg.countLabel}
                gradient={cfg.gradient}
                accentColor={cfg.color}
                animClass={`anim-pop ${delayClass(idx)}`}
                onClick={() => cfg.onSelect(item)}
              />
            ))}
          </div>
        )}

        {view === "directions" && (
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${theme.border}` }}>
            <button
              onClick={goToAllEmployees}
              className="btn-lift"
              style={{
                background: theme.surface,
                border: `1.5px solid ${theme.border}`,
                color: theme.textSecondary,
                borderRadius: 12,
                padding: "12px 24px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                fontFamily: theme.fontFamily,
              }}
            >
              <IconUsers size={18} color={theme.textSecondary} />
              Voir tous les employés sans filtre
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Render employees table ───────────────────────────────────────────────

  const renderEmployeesTable = () => (
    <div className="anim-fade-in">
      {/* Bannière filtre service actif */}
      {selectedService && (
        <div style={{
          background: theme.serviceColor + "0D",
          border: `1px solid ${theme.serviceColor}25`,
          borderRadius: 12,
          padding: "12px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: theme.serviceColor, display: "flex" }}><IconService size={16} /></div>
            <span style={{ color: theme.serviceColor, fontWeight: 600, fontSize: 13, fontFamily: theme.fontFamily }}>
              Filtré par service : <strong>{selectedService.nom}</strong>
            </span>
          </div>
          <button onClick={goToAllEmployees} style={{ background: "none", border: `1px solid ${theme.serviceColor}30`, color: theme.serviceColor, borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            Retirer le filtre
          </button>
        </div>
      )}

      {/* Filtres */}
      <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", boxShadow: theme.shadow }}>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: theme.textMuted, pointerEvents: "none", display: "flex" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, prénom, matricule..."
            className="input-focus"
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: `1.5px solid ${theme.border}`,
              borderRadius: 10,
              padding: "10px 14px 10px 40px",
              color: theme.text,
              fontSize: 14,
              outline: "none",
              background: theme.bg,
              fontFamily: theme.fontFamily,
            }}
          />
        </div>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="input-focus"
          style={{
            border: `1.5px solid ${theme.border}`,
            borderRadius: 10,
            padding: "10px 14px",
            color: theme.text,
            fontSize: 14,
            outline: "none",
            background: theme.bg,
            cursor: "pointer",
            fontFamily: theme.fontFamily,
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="actif">Actif</option>
          <option value="inactif">Inactif</option>
          <option value="archive">Archivé</option>
        </select>
      </div>

      {/* Barre actions bulk */}
      {someSelected && user?.role === "ADMIN" && (
        <div className="anim-slide-down" style={{ background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, borderRadius: 12, padding: "12px 20px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: theme.shadow }}>
          <span style={{ color: theme.primary, fontWeight: 600, fontSize: 14, fontFamily: theme.fontFamily }}>{selected.size} employé(s) sélectionné(s)</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setSelected(new Set())} style={{ background: "transparent", border: `1px solid ${theme.border}`, color: theme.textSecondary, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: theme.fontFamily }}>Désélectionner</button>
            <button onClick={() => handleBulkAction("archive")} disabled={deleting} style={{ background: "#FFFBEB", border: `1px solid #FDE68A`, color: "#92400E", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", fontFamily: theme.fontFamily }}>Archiver ({selected.size})</button>
            <button onClick={() => handleBulkAction("delete")} disabled={deleting} style={{ background: theme.danger, border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer", fontFamily: theme.fontFamily }}>Supprimer ({selected.size})</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", boxShadow: theme.shadowMd }}>
        {loading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 0" }}>
                <Skeleton width={36} height={36} radius={18} />
                <div style={{ flex: 1 }}>
                  <Skeleton width="30%" height={13} style={{ marginBottom: 6 }} />
                  <Skeleton width="50%" height={11} />
                </div>
              </div>
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div style={{ padding: 80, textAlign: "center", color: theme.textMuted }}>
            <div style={{ marginBottom: 16, opacity: 0.35 }}><IconUsers size={56} color={theme.textMuted} /></div>
            <div style={{ fontFamily: theme.fontFamily, fontWeight: 700, fontSize: 16, color: theme.text, marginBottom: 6 }}>Aucun employé trouvé</div>
            <div style={{ fontFamily: theme.fontFamily, fontSize: 13 }}>{search ? "Essayez un autre terme de recherche." : "Ce service ne contient pas encore d'employés."}</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: theme.fontFamily }}>
              <thead>
                <tr style={{ background: theme.bg, borderBottom: `2px solid ${theme.border}` }}>
                  {user?.role === "ADMIN" && (
                    <th style={{ padding: "13px 16px", width: 40 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} style={{ cursor: "pointer", width: 15, height: 15, accentColor: theme.primary }} />
                    </th>
                  )}
                  {[
                    { label: "Matricule", key: "matricule" },
                    { label: "N° Contrat", key: null },
                    { label: "Nom & Prénom", key: "nom" },
                    { label: "Direction", key: "direction__nom" },
                    { label: "Département", key: "departement__nom" },
                    { label: "Service", key: "service__nom" },
                    { label: "Poste", key: "poste__nom" },
                    { label: "Type contrat", key: "type_contrat__nom" },
                    { label: "Statut", key: "statut" },
                    { label: "Dossier", key: null },
                    { label: "", key: null },
                  ].map((h) => (
                    <th
                      key={h.label}
                      onClick={() => { if (!h.key) return; setOrdering(prev => prev === h.key ? `-${h.key}` : h.key); }}
                      style={{
                        padding: "13px 16px",
                        textAlign: "left",
                        color: theme.textSecondary,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                        cursor: h.key ? "pointer" : "default",
                        userSelect: "none",
                      }}
                    >
                      {h.label}
                      {h.key && (
                        <span style={{ marginLeft: 4, opacity: ordering === h.key || ordering === `-${h.key}` ? 1 : 0.3, fontSize: 10 }}>
                          {ordering === `-${h.key}` ? "↓" : "↑"}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => (
                  <tr
                    key={emp.id}
                    className="table-row-hover"
                    style={{
                      borderBottom: `1px solid ${theme.borderLight}`,
                      background: selected.has(emp.id) ? theme.primaryBg : idx % 2 === 0 ? theme.surface : "#FAFBFC",
                    }}
                  >
                    {user?.role === "ADMIN" && (
                      <td style={{ padding: "13px 16px" }} onClick={(e) => { e.stopPropagation(); toggleSelect(emp.id); }}>
                        <input type="checkbox" checked={selected.has(emp.id)} onChange={() => toggleSelect(emp.id)} style={{ cursor: "pointer", width: 15, height: 15, accentColor: theme.primary }} />
                      </td>
                    )}
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", cursor: "pointer" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: theme.primary, background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, borderRadius: 6, padding: "3px 8px" }}>
                        {emp.matricule}
                      </span>
                    </td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", whiteSpace: "nowrap", cursor: "pointer" }}>
                      {emp.numero_contrat_actif
                        ? <span style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12, color: theme.departementColor, background: theme.departementAccent || "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 8px" }}>{emp.numero_contrat_actif}</span>
                        : <span style={{ color: theme.textMuted, fontSize: 12 }}>—</span>}
                    </td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.text, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", fontSize: 14 }}>
                      {emp.nom} {emp.prenom}
                    </td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13, cursor: "pointer" }}>{emp.direction_nom || <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13, cursor: "pointer" }}>{emp.departement_nom || <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13, cursor: "pointer" }}>{emp.service_nom || <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13, cursor: "pointer" }}>{emp.poste_nom || <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", color: theme.textSecondary, fontSize: 13, cursor: "pointer" }}>{emp.type_contrat_nom || <span style={{ color: theme.textMuted }}>—</span>}</td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", cursor: "pointer" }}>
                      <span style={{
                        background: emp.statut === "actif" ? theme.primaryBg : emp.statut === "archive" ? "#F8FAFC" : theme.dangerBg,
                        color: emp.statut === "actif" ? theme.primary : emp.statut === "archive" ? "#64748B" : theme.danger,
                        border: `1px solid ${emp.statut === "actif" ? theme.primaryBorder : emp.statut === "archive" ? theme.border : theme.dangerBorder}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {emp.statut}
                      </span>
                    </td>
                    <td onClick={() => navigate(`/employees/${emp.id}`)} style={{ padding: "13px 16px", cursor: "pointer" }}>
                      <span style={{
                        background: emp.dossier_complet ? theme.primaryBg : "#FFFBEB",
                        color: emp.dossier_complet ? theme.primary : "#92400E",
                        border: `1px solid ${emp.dossier_complet ? theme.primaryBorder : "#FDE68A"}`,
                        borderRadius: 20,
                        padding: "3px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {emp.dossier_complet ? "✓ Complet" : `${emp.taux_completude}%`}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => navigate(`/employees/${emp.id}`)} className="btn-lift" style={{ background: theme.primary, border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: theme.fontFamily }}>
                        Voir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderTop: `1px solid ${theme.border}`, background: theme.bg, fontFamily: theme.fontFamily }}>
            <div style={{ color: theme.textSecondary, fontSize: 13 }}>
              {(page - 1) * PAGE_SIZE + 1} — {Math.min(page * PAGE_SIZE, totalCount)} sur {totalCount}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[
                { label: "«", action: () => setPage(1), disabled: page === 1 },
                { label: "‹ Précédent", action: () => setPage(p => Math.max(1, p - 1)), disabled: page === 1 },
              ].map(b => (
                <button key={b.label} onClick={b.action} disabled={b.disabled} style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textSecondary, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: b.disabled ? "not-allowed" : "pointer", opacity: b.disabled ? 0.4 : 1 }}>{b.label}</button>
              ))}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2))
                .map((p, idx, arr) => (
                  <span key={p}>
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span style={{ color: theme.textMuted, padding: "0 4px" }}>…</span>}
                    <button onClick={() => setPage(p)} style={{ background: p === page ? theme.primary : theme.surface, border: `1.5px solid ${p === page ? theme.primary : theme.border}`, color: p === page ? "#fff" : theme.textSecondary, borderRadius: 8, padding: "6px 11px", fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: "pointer", minWidth: 36 }}>{p}</button>
                  </span>
                ))}
              {[
                { label: "Suivant ›", action: () => setPage(p => Math.min(totalPages, p + 1)), disabled: page === totalPages },
                { label: "»", action: () => setPage(totalPages), disabled: page === totalPages },
              ].map(b => (
                <button key={b.label} onClick={b.action} disabled={b.disabled} style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textSecondary, borderRadius: 8, padding: "6px 12px", fontSize: 13, cursor: b.disabled ? "not-allowed" : "pointer", opacity: b.disabled ? 0.4 : 1 }}>{b.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: theme.textSecondary, fontSize: 13 }}>Aller à</span>
              <input type="number" min="1" max={totalPages} defaultValue={page} onKeyDown={(e) => { if (e.key === "Enter") { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) setPage(v); } }} className="input-focus" style={{ width: 56, border: `1.5px solid ${theme.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, color: theme.text, background: theme.surface, outline: "none", textAlign: "center", fontFamily: theme.fontFamily }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: "36px 32px 40px",
        position: "relative",
        overflow: "hidden",
      }}>
        <HeroDecor />
        <div style={{ maxWidth: 1300, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "8px 10px", display: "flex", color: "#fff" }}>
                  <IconUsers size={22} color="#fff" />
                </div>
                <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  Dossiers Employés
                </h1>
              </div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, paddingLeft: 52 }}>
                {view === "employees"
                  ? `${totalCount} employé(s)${selectedService ? ` — Service : ${selectedService.nom}` : " au total"}`
                  : "Naviguez par direction, département et service"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {/* Barre de recherche globale */}
              <form onSubmit={handleGlobalSearch} style={{ display: "flex", gap: 0 }}>
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.5)", pointerEvents: "none", display: "flex" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </div>
                  <input
                    type="text"
                    value={globalInput}
                    onChange={(e) => setGlobalInput(e.target.value)}
                    placeholder="Matricule, N° contrat, nom, prénom..."
                    className="input-focus"
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      border: "1px solid rgba(255,255,255,0.25)",
                      borderRight: "none",
                      borderRadius: "10px 0 0 10px",
                      padding: "10px 14px 10px 36px",
                      color: "#fff",
                      fontSize: 13,
                      outline: "none",
                      width: 260,
                      fontFamily: theme.fontFamily,
                    }}
                  />
                </div>
                <button type="submit" style={{ background: "#fff", border: "none", borderRadius: "0 10px 10px 0", padding: "10px 16px", color: theme.primary, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  Chercher
                </button>
              </form>
              {user?.role === "ADMIN" && (
                <>
                  <button onClick={() => navigate("/import")} className="btn-lift" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(4px)" }}>
                    <IconImport size={15} />
                    Import CSV
                  </button>
                  <button onClick={() => navigate("/employees/nouveau")} className="btn-lift" style={{ background: theme.accent, border: "none", borderRadius: 10, padding: "10px 20px", color: theme.text, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    <IconPlus size={15} />
                    Nouvel employé
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ padding: "28px 32px", maxWidth: 1300, margin: "0 auto" }}>

        {/* Breadcrumb */}
        {breadcrumbItems.length > 1 && (
          <div className="anim-slide-down" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "10px 16px", marginBottom: 24, boxShadow: theme.shadow }}>
            <Breadcrumb items={breadcrumbItems} />
          </div>
        )}

        {/* Notification */}
        {message && (
          <div className="notif-banner" style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 14, fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {view === "employees" ? renderEmployeesTable() : renderHierarchy()}
      </div>
    </PageBackground>
  );
};

export default Employees;

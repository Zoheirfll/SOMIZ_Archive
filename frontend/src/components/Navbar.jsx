import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { logout } from "../services/auth";
import api from "../services/api";
import { useTheme, useThemeMode } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import { KeyboardIcon, SunIcon, MoonIcon, SearchIcon } from "./icons";
import NotificationBell from "./NotificationBell";
import NavDropdown from "./NavDropdown";
import { canSeeAttestations, canSeeConges, canSeeConsultations, canSeeRegistres } from "../config/accesSections";

const MenuIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const XIcon = ({ size = 22, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const Navbar = () => {
  const { user, logoutSuccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  // Desktop étroit (769–1500 px, ex. portable 1366 px) : la barre ne tient
  // pas sur une ligne avec nom + rôle, 5 icônes et le bouton Déconnexion.
  // On masque le bloc texte (l'avatar reste cliquable, avec infobulle) et on
  // resserre les marges plutôt que de laisser la page défiler à l'horizontale.
  const isCompact = useIsMobile(1500);
  // Sous ~1300 px, même l'étiquette de rôle abrégée ferait déborder la barre.
  const isNarrow = useIsMobile(1300);
  const ROLE_SHORT = { SUPERADMIN: "SUPER", ADMIN: "ADMIN", CONSULTANT: "CONSULT.", GESTIONNAIRE: "GEST." };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { openHelp, openPalette } = useKeyboardShortcutsHelp();
  const theme = useTheme();
  const { mode, toggleMode } = useThemeMode();

  const ThemeToggleButton = ({ style = {} }) => (
    <button
      onClick={toggleMode}
      aria-label={mode === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      title={mode === "dark" ? "Mode clair" : "Mode sombre"}
      style={{
        background: "transparent",
        border: `1px solid ${theme.border}`,
        color: theme.textSecondary,
        width: 36,
        height: 36,
        borderRadius: 8,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s",
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.primaryBg;
        e.currentTarget.style.borderColor = theme.primaryBorder;
        e.currentTarget.style.color = theme.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = theme.border;
        e.currentTarget.style.color = theme.textSecondary;
      }}
    >
      {mode === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
    </button>
  );

  const handleLogout = async () => {
    await logout();
    logoutSuccess();
    navigate("/login");
  };

  const [pendingAttestations, setPendingAttestations] = useState(0);
  // SUPERADMIN toujours, ADMIN seulement si chargé des attestations (voir
  // User.can_manage_attestations côté backend) — un ADMIN non chargé n'a
  // plus aucun accès à /attestations, ni lien navbar ni badge.
  const seesAttestations = canSeeAttestations(user);

  const [pendingConsultations, setPendingConsultations] = useState(0);
  // Demandeurs (GESTIONNAIRE/CONSULTANT) et traiteurs uniquement — un ADMIN
  // non chargé des consultations n'a ni lien ni badge.
  const seesConsultations = canSeeConsultations(user);

  const [pendingConges, setPendingConges] = useState(0);
  // Demandeurs autorisés (peut_demander_conge) et traiteurs (SUPERADMIN / ADMIN
  // charge_conge) — un ADMIN non chargé des congés n'a ni lien ni badge.
  const seesConges = canSeeConges(user);

  useEffect(() => {
    // Badge « N à traiter » : traiteurs uniquement (pour un demandeur, le
    // paramètre `pending` n'a pas de sens côté serveur).
    if (!user?.can_manage_consultations) { setPendingConsultations(0); return undefined; }
    let cancelled = false;
    api.get("/consultations/demandes/", { params: { pending: 1 } })
      .then((res) => {
        if (cancelled) return;
        setPendingConsultations(res.data?.count ?? (res.data?.results || res.data || []).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Recharge à chaque navigation, comme le badge des attestations.
  }, [user?.can_manage_consultations, location.pathname]);

  useEffect(() => {
    // Traiteurs (SUPERADMIN/ADMIN chargé) : comptent les demandes Reçues à
    // traiter. GESTIONNAIRE (et SUPERADMIN en tant que demandeur) : compte
    // ses propres demandes Prêtes à récupérer — même endpoint
    // (`pending=1`), la branche demandeur/traiteur du backend
    // (`get_queryset`) choisit le bon filtre. Voir
    // DemandeAttestationListCreateView.get_queryset.
    if (!seesAttestations) return;
    let cancelled = false;
    api.get("/attestations/demandes/", { params: { pending: 1 } })
      .then((res) => {
        if (cancelled) return;
        // `count` si paginé (DRF), sinon la longueur d'un tableau brut —
        // res.data.results.length sous-comptait dès que le nombre de
        // demandes en attente dépassait une page.
        const count = res.data?.count ?? (res.data?.results || res.data || []).length;
        setPendingAttestations(count);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Recharge à chaque changement de page — le badge doit refléter les
    // changements de statut faits sur /attestations/:id, jamais rechargés
    // sinon puisque Navbar ne se démonte pas entre deux pages de l'app.
  }, [user?.role, location.pathname]);

  useEffect(() => {
    // Même principe que les attestations : le traiteur compte les demandes
    // Reçues, un demandeur compte ses titres Prêts à récupérer (la branche est
    // choisie côté serveur par `pending=1`, voir DemandeCongeListCreateView).
    if (!seesConges) { setPendingConges(0); return undefined; }
    let cancelled = false;
    api.get("/conges/demandes/", { params: { pending: 1 } })
      .then((res) => {
        if (cancelled) return;
        setPendingConges(res.data?.count ?? (res.data?.results || res.data || []).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Recharge à chaque changement de page : le badge suit les changements de
    // statut faits sur /conges/:ref (Navbar ne se démonte pas entre deux pages).
  }, [seesConges, location.pathname]);

  // Entrée « Demandes » : menu déroulant Attestations / Consultations, chaque
  // section avec son propre badge « à traiter ». Si le compte n'a accès qu'à
  // une seule section, un déroulant à un seul choix n'a pas de sens : l'entrée
  // mène directement à cette section.
  const demandesSections = [
    { path: "/attestations", label: "Attestations de travail", visible: seesAttestations, badge: pendingAttestations },
    { path: "/consultations", label: "Consultations d'archives", visible: seesConsultations, badge: pendingConsultations },
    { path: "/conges", label: "Congés", visible: seesConges, badge: pendingConges },
  ].filter((s) => s.visible);
  const navLinks = [
    { path: "/employees", label: "Personnel" },
    { path: "/organigramme", label: "Organigramme" },
    {
      path: demandesSections[0]?.path, label: "Demandes",
      show: demandesSections.length > 0,
      children: demandesSections.length > 1 ? demandesSections : undefined,
      match: (p) => p.startsWith("/attestations") || p.startsWith("/consultations") || p.startsWith("/conges"),
      badge: demandesSections.reduce((total, s) => total + s.badge, 0),
    },
    {
      path: "/registres", label: "Registres",
      show: canSeeRegistres(user),
    },
    { path: "/dashboard", label: "Tableau de bord", adminOnly: true },
    { path: "/statistiques", label: "Statistiques", adminOnly: true },
    { path: "/recherche-documents", label: "Recherche OCR", adminOnly: true },
  ].filter((item) =>
    item.show !== undefined ? item.show : (!item.adminOnly || ["ADMIN", "SUPERADMIN"].includes(user?.role))
  );

  const adminMenuLinks = [
    { path: "/import", label: "Import" },
    { path: "/users", label: "Utilisateurs" },
    { path: "/parametres", label: "Configuration" },
    { path: "/audit", label: "Journal" },
  ];
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);

  const goTo = (path) => {
    setDrawerOpen(false);
    navigate(path);
  };

  return (
    <nav
      style={{
        background: theme.surface,
        borderBottom: `1px solid ${theme.border}`,
        padding: isMobile ? "0 16px" : isCompact ? "0 20px" : "0 32px",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: theme.shadow,
        position: "sticky",
        top: 0,
        zIndex: 100,
        fontFamily: theme.fontFamily,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <img
          src="/logo_somiz.png"
          alt="SOMIZ"
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            objectFit: "contain",
            flexShrink: 0,
          }}
        />
        {/* Masqué en desktop étroit : le logo suffit à identifier l'application et
            la barre (8 entrées + 5 icônes + Déconnexion) ne tient pas en 1366 px. */}
        {!isMobile && !isCompact && (
          <div>
            <div style={{ color: theme.text, fontWeight: 800, fontSize: 15, lineHeight: 1, letterSpacing: "-0.02em" }}>
              SOMIZ
            </div>
            <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
              Dossiers RH
            </div>
          </div>
        )}
      </div>

      {/* Navigation desktop */}
      {!isMobile && (
        <div style={{ display: "flex", gap: 2 }}>
          {navLinks.map((item) => {
            if (item.children) {
              return (
                <NavDropdown
                  key={item.label}
                  label={item.label}
                  items={item.children}
                  badge={item.badge}
                  padding={isCompact ? "7px 10px" : "7px 14px"}
                />
              );
            }
            const isActive = item.match ? item.match(location.pathname) : location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: isActive ? theme.primaryBg : "transparent",
                  border: "none",
                  borderRadius: 8,
                  color: theme.text,
                  padding: isCompact ? "7px 10px" : "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: theme.fontFamily,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = theme.navHover;
                    e.currentTarget.style.color = theme.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = theme.text;
                  }
                }}
              >
                {item.label}
                {item.badge > 0 && (
                  <span style={{
                    marginLeft: 6, background: theme.danger, color: "#fff",
                    borderRadius: 999, fontSize: 10, fontWeight: 700,
                    padding: "1px 6px", display: "inline-block",
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {isAdmin && (
            <NavDropdown
              label="Administration"
              items={adminMenuLinks}
              align="right"
              padding={isCompact ? "7px 10px" : "7px 14px"}
            />
          )}
        </div>
      )}

      {/* Profil (desktop) / hamburger (mobile) */}
      <div style={{ display: "flex", alignItems: "center", gap: isCompact ? 8 : 10, flexShrink: 0 }}>
        {!isMobile && (
          <>
            {!isCompact && (
            <div
              onClick={() => navigate("/profil")}
              style={{ textAlign: "right", cursor: "pointer" }}
            >
              <div style={{ color: theme.text, fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                {user?.prenom} {user?.nom}
              </div>
              <div
                style={{
                  color: theme.primary,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginTop: 2,
                }}
              >
                {user?.role}
              </div>
            </div>
            )}

            <div
              role="button"
              tabIndex={0}
              aria-label={`Mon profil — ${user?.prenom || ""} ${user?.nom || ""} (${user?.role || ""})`}
              title={`${user?.prenom || ""} ${user?.nom || ""} — ${user?.role || ""}`}
              onClick={() => navigate("/profil")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("/profil");
                }
              }}
              style={{
                cursor: "pointer",
                width: 36,
                height: 36,
                background: theme.primaryBg,
                border: `2px solid ${theme.primaryBorder}`,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.primary,
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: "-0.01em",
                flexShrink: 0,
              }}
            >
              {user?.prenom?.[0]}
              {user?.nom?.[0]}
            </div>

            {isCompact && !isNarrow && user?.role && (
              <span
                title={user.role}
                style={{
                  color: theme.primary,
                  background: theme.primaryBg,
                  border: `1px solid ${theme.primaryBorder}`,
                  borderRadius: 6,
                  padding: "2px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {ROLE_SHORT[user.role] || user.role}
              </span>
            )}

            <NotificationBell />
            <button
              onClick={openPalette}
              aria-label="Recherche rapide"
              title="Recherche rapide (Ctrl+K)"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                width: 36,
                height: 36,
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.primaryBg;
                e.currentTarget.style.borderColor = theme.primaryBorder;
                e.currentTarget.style.color = theme.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.color = theme.textSecondary;
              }}
            >
              <SearchIcon size={16} />
            </button>

            <button
              onClick={openHelp}
              aria-label="Raccourcis clavier"
              title="Raccourcis clavier (?)"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                width: 36,
                height: 36,
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.primaryBg;
                e.currentTarget.style.borderColor = theme.primaryBorder;
                e.currentTarget.style.color = theme.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.color = theme.textSecondary;
              }}
            >
              <KeyboardIcon size={16} />
            </button>

            <ThemeToggleButton />

            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                padding: isCompact ? "7px 10px" : "7px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontFamily: theme.fontFamily,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = theme.dangerBg;
                e.currentTarget.style.borderColor = theme.dangerBorder;
                e.currentTarget.style.color = theme.danger;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.color = theme.textSecondary;
              }}
            >
              Déconnexion
            </button>
          </>
        )}

        {isMobile && (
          <>
            <div
              onClick={() => navigate("/profil")}
              style={{
                width: 34,
                height: 34,
                background: theme.primaryBg,
                border: `2px solid ${theme.primaryBorder}`,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.primary,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: "-0.01em",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              {user?.prenom?.[0]}
              {user?.nom?.[0]}
            </div>
            <NotificationBell size={38} />
            <button
              onClick={openPalette}
              aria-label="Recherche rapide"
              title="Recherche rapide"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                color: theme.text,
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <SearchIcon size={17} />
            </button>
            <ThemeToggleButton style={{ width: 38, height: 38 }} />
            <button
              aria-label={drawerOpen ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setDrawerOpen((v) => !v)}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                color: theme.text,
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {drawerOpen ? <XIcon /> : <MenuIcon />}
            </button>
          </>
        )}
      </div>

      {/* Drawer mobile */}
      {isMobile && drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              top: 64,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(15,23,42,0.45)",
              zIndex: 90,
            }}
            className="anim-fade-in"
          />
          <div
            className="anim-slide-down"
            style={{
              position: "fixed",
              top: 64,
              left: 0,
              right: 0,
              background: theme.surface,
              borderBottom: `1px solid ${theme.border}`,
              boxShadow: theme.shadowLg,
              zIndex: 95,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                marginBottom: 4,
                borderBottom: `1px solid ${theme.borderLight}`,
              }}
            >
              <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>
                {user?.prenom} {user?.nom}
              </div>
              <div
                style={{
                  color: theme.primary,
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginTop: 2,
                }}
              >
                {user?.role}
              </div>
            </div>

            {[...navLinks, ...(isAdmin ? adminMenuLinks : [])]
              .flatMap((item) => (item.children
                ? item.children.map((c) => ({
                    ...c,
                    label: `${item.label} · ${c.label}`,
                    match: (p) => p.startsWith(c.path),
                  }))
                : [item]))
              .map((item) => {
              const isActive = item.match ? item.match(location.pathname) : location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => goTo(item.path)}
                  style={{
                    background: isActive ? theme.primaryBg : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: theme.text,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: theme.fontFamily,
                  }}
                >
                  {item.label}
                  {item.badge > 0 && (
                    <span style={{
                      marginLeft: 6, background: theme.danger, color: "#fff",
                      borderRadius: 999, fontSize: 10, fontWeight: 700,
                      padding: "1px 6px", display: "inline-block",
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              onClick={() => {
                setDrawerOpen(false);
                openHelp();
              }}
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 8,
                color: theme.textSecondary,
                padding: "12px 14px",
                textAlign: "left",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
                fontFamily: theme.fontFamily,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <KeyboardIcon size={15} />
              Raccourcis clavier
            </button>

            <button
              onClick={handleLogout}
              style={{
                background: theme.dangerBg,
                border: `1px solid ${theme.dangerBorder}`,
                color: theme.danger,
                padding: "12px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: theme.fontFamily,
                textAlign: "left",
                marginTop: 8,
              }}
            >
              Déconnexion
            </button>
          </div>
        </>
      )}
    </nav>
  );
};

export default Navbar;

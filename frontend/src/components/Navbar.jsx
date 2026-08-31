import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { logout } from "../services/auth";
import { theme } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import { KeyboardIcon } from "./icons";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { openHelp } = useKeyboardShortcutsHelp();

  const handleLogout = async () => {
    await logout();
    logoutSuccess();
    navigate("/login");
  };

  const navLinks = [
    { path: "/employees", label: "Employés" },
    { path: "/organigramme", label: "Organigramme" },
    { path: "/import", label: "Import", adminOnly: true },
    { path: "/dashboard", label: "Dashboard", adminOnly: true },
    { path: "/users", label: "Utilisateurs", adminOnly: true },
    { path: "/parametres", label: "Paramètres", adminOnly: true },
    { path: "/audit", label: "Journal", adminOnly: true },
  ].filter((item) => !item.adminOnly || ["ADMIN", "SUPERADMIN"].includes(user?.role));

  const goTo = (path) => {
    setDrawerOpen(false);
    navigate(path);
  };

  return (
    <nav
      style={{
        background: "#FFFFFF",
        borderBottom: `1px solid ${theme.border}`,
        padding: isMobile ? "0 16px" : "0 32px",
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
        {!isMobile && (
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
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: isActive ? theme.primaryBg : "transparent",
                  border: "none",
                  borderRadius: 8,
                  color: isActive ? theme.primary : theme.textSecondary,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  fontFamily: theme.fontFamily,
                  transition: "background 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = theme.bg;
                    e.currentTarget.style.color = theme.text;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = theme.textSecondary;
                  }
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Profil (desktop) / hamburger (mobile) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isMobile && (
          <>
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

            <div
              style={{
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

            <button
              onClick={handleLogout}
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                padding: "7px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
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

            {navLinks.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => goTo(item.path)}
                  style={{
                    background: isActive ? theme.primaryBg : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: isActive ? theme.primary : theme.textSecondary,
                    padding: "12px 14px",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: isActive ? 700 : 500,
                    fontFamily: theme.fontFamily,
                  }}
                >
                  {item.label}
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

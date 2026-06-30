import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { logout } from "../services/auth";
import { theme } from "../styles/theme";

const Navbar = () => {
  const { user, logoutSuccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    logoutSuccess();
    navigate("/login");
  };

  const navLinks = [
    { path: "/employees", label: "Employés" },
    { path: "/import", label: "Import", adminOnly: true },
    { path: "/dashboard", label: "Dashboard", adminOnly: true },
    { path: "/users", label: "Utilisateurs", adminOnly: true },
    { path: "/parametres", label: "Paramètres", adminOnly: true },
    { path: "/audit", label: "Journal", adminOnly: true },
  ].filter((item) => !item.adminOnly || user?.role === "ADMIN");

  return (
    <nav
      style={{
        background: "#FFFFFF",
        borderBottom: `1px solid ${theme.border}`,
        padding: "0 32px",
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
        <div
          style={{
            background: "linear-gradient(135deg, #052e16 0%, #166534 100%)",
            borderRadius: 10,
            width: 38,
            height: 38,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: "-0.02em",
            flexShrink: 0,
          }}
        >
          S
        </div>
        <div>
          <div style={{ color: theme.text, fontWeight: 800, fontSize: 15, lineHeight: 1, letterSpacing: "-0.02em" }}>
            SOMIZ
          </div>
          <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
            Dossiers RH
          </div>
        </div>
      </div>

      {/* Navigation */}
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

      {/* Profil */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
      </div>
    </nav>
  );
};

export default Navbar;

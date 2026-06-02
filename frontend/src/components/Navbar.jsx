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
    { path: "/employees", label: "👥 Employés" },
    { path: "/import", label: "📥 Import", adminOnly: true },
    { path: "/dashboard", label: "📊 Dashboard", adminOnly: true },
    { path: "/users", label: "⚙️ Utilisateurs", adminOnly: true },
    { path: "/parametres", label: "⚙️ Paramètres", adminOnly: true },
    { path: "/audit", label: "📋 Journal", adminOnly: true },
  ].filter((item) => !item.adminOnly || user?.role === "ADMIN");

  return (
    <nav
      style={{
        background: theme.surface,
        borderBottom: `2px solid ${theme.primaryBorder}`,
        padding: "0 32px",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: theme.shadow,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            background: theme.primary,
            borderRadius: 10,
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 900,
            color: "#fff",
            boxShadow: `0 2px 8px ${theme.primary}44`,
          }}
        >
          S
        </div>
        <div>
          <div
            style={{
              color: theme.primary,
              fontWeight: 800,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            SOMIZ
          </div>
          <div style={{ color: theme.textMuted, fontSize: 11 }}>
            Archivage RH
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 2 }}>
        {navLinks.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              background:
                location.pathname === item.path
                  ? theme.primaryBg
                  : "transparent",
              border: "none",
              borderRadius: 8,
              color:
                location.pathname === item.path
                  ? theme.primary
                  : theme.textSecondary,
              padding: "8px 16px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: location.pathname === item.path ? 700 : 400,
              transition: "all 0.15s",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Profil */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>
            {user?.prenom} {user?.nom}
          </div>
          <div
            style={{
              color: theme.primary,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
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
            fontSize: 14,
          }}
        >
          {user?.prenom?.[0]}
          {user?.nom?.[0]}
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: `1px solid ${theme.primaryBorder}`,
            color: theme.textSecondary,
            padding: "7px 14px",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            transition: "all 0.15s",
          }}
        >
          Déconnexion
        </button>
      </div>
    </nav>
  );
};

export default Navbar;

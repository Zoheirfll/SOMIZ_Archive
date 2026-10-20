import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";

// Menu déroulant de la navbar desktop (« Demandes », « Administration »).
// `items` : [{ path, label, badge? }]. Le `badge` global s'affiche sur le
// bouton tant que le menu est fermé, pour qu'une demande à traiter reste
// visible sans l'ouvrir.
export default function NavDropdown({ label, items, align = "left", padding = "7px 14px", badge = 0 }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Fermeture à chaque navigation et à Échap.
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isMenuActive = items.some((item) => location.pathname.startsWith(item.path));
  const highlighted = isMenuActive || open;

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: highlighted ? theme.primaryBg : "transparent",
          border: "none",
          borderRadius: 8,
          color: theme.text,
          padding,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          fontFamily: theme.fontFamily,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 4,
          transition: "background 0.15s, color 0.15s",
        }}
        onMouseEnter={(e) => { if (!highlighted) e.currentTarget.style.background = theme.navHover; }}
        onMouseLeave={(e) => { if (!highlighted) e.currentTarget.style.background = "transparent"; }}
      >
        {label}
        {badge > 0 && !open && (
          <span style={{
            marginLeft: 2, background: theme.danger, color: "#fff",
            borderRadius: 999, fontSize: 10, fontWeight: 700,
            padding: "1px 6px", display: "inline-block",
          }}>
            {badge}
          </span>
        )}
        <span style={{ fontSize: 10, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
          <div
            role="menu"
            className="anim-slide-down"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              [align]: 0,
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              boxShadow: theme.shadowMd,
              padding: 6,
              minWidth: 190,
              zIndex: 200,
            }}
          >
            {items.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  role="menuitem"
                  onClick={() => navigate(item.path)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    background: isActive ? theme.primaryBg : "transparent",
                    border: "none",
                    borderRadius: 8,
                    color: theme.text,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: theme.fontFamily,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = theme.navHover; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  {item.label}
                  {item.badge > 0 && (
                    <span style={{
                      background: theme.danger, color: "#fff", borderRadius: 999,
                      fontSize: 10, fontWeight: 700, padding: "1px 6px",
                    }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

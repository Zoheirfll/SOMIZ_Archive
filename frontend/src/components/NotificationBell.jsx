import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import useIsMobile from "../hooks/useIsMobile";
import useNotifications from "../hooks/useNotifications";
import { formatDateTime } from "../utils/employeeDocsDisplay";
import { BellIcon } from "./icons";

const SEVERITY_COLOR_KEY = { info: "primary", warning: "warning", critical: "danger" };

const NotificationBell = ({ size = 36 }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const { count, items, loaded, fetchItems, markRead, markAllRead } = useNotifications();

  // Charge la liste à l'ouverture ; si le compteur change panneau ouvert
  // (nouvelle notification arrivée par polling), la liste se met à jour en
  // silence, sans réinitialiser le scroll.
  useEffect(() => {
    if (open) fetchItems();
  }, [open, count, fetchItems]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const handleClick = (n) => {
    if (!n.read_at) markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const label = count > 0
    ? `Notifications, ${count} non lue${count > 1 ? "s" : ""}`
    : "Notifications";

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        title="Notifications"
        style={{
          position: "relative",
          background: open ? theme.primaryBg : "transparent",
          border: `1px solid ${open ? theme.primaryBorder : theme.border}`,
          color: open ? theme.primary : theme.textSecondary,
          width: size,
          height: size,
          borderRadius: 8,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        <BellIcon size={16} />
        {count > 0 && (
          <span
            data-testid="notification-badge"
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              boxSizing: "border-box",
              background: theme.danger,
              color: theme.surface,
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: isMobile ? "fixed" : "absolute",
            top: isMobile ? 70 : size + 8,
            right: isMobile ? 8 : 0,
            left: isMobile ? 8 : "auto",
            width: isMobile ? "auto" : 360,
            maxHeight: 480,
            display: "flex",
            flexDirection: "column",
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 12,
            boxShadow: theme.shadowLg,
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: `1px solid ${theme.border}`,
          }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: theme.text }}>Notifications</span>
            {count > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: theme.primary, fontSize: 12, fontWeight: 600, padding: 0,
                }}
              >
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto" }}>
            {loaded && items.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: theme.textSecondary, fontSize: 13 }}>
                Aucune notification
              </div>
            )}
            {items.map((n) => {
              const color = theme[SEVERITY_COLOR_KEY[n.severity] || "primary"];
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: "flex", gap: 10, width: "100%", textAlign: "left",
                    padding: "12px 16px", cursor: "pointer",
                    background: n.read_at ? "transparent" : theme.primaryBg,
                    border: "none", borderBottom: `1px solid ${theme.borderLight}`,
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 5,
                      background: n.read_at ? "transparent" : color,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: "block", fontSize: 13, color: theme.text,
                      fontWeight: n.read_at ? 500 : 700,
                    }}>
                      {n.message}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                      {formatDateTime(n.created_at)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

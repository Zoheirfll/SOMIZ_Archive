import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { InfoIcon } from "./icons";

const POPOVER_WIDTH = 260;

export default function InfoNotice({ text, variant = "hero", size = 18 }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);

  const VARIANTS = {
    hero: {
      background: theme.primaryLight,
      border: "1px solid rgba(255,255,255,0.6)",
      color: "#fff",
    },
    field: {
      background: theme.primaryBg,
      border: `1px solid ${theme.primaryBorder}`,
      color: theme.primary,
    },
  };

  if (!text) return null;

  const colors = VARIANTS[variant] || VARIANTS.hero;

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      let left = rect.left;
      if (left + POPOVER_WIDTH > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - 12 - POPOVER_WIDTH);
      }
      setCoords({ top: rect.bottom + 8, left });
    }
    setOpen((o) => !o);
  };

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label="Aide"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: colors.border,
          background: colors.background,
          color: colors.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      >
        <InfoIcon size={Math.round(size * 0.6)} />
      </button>
      {open && coords &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 2000 }}
            />
            <div
              className="anim-scale-in"
              style={{
                position: "fixed",
                top: coords.top,
                left: coords.left,
                background: theme.surface,
                border: `1.5px solid ${theme.primaryBorder}`,
                borderTop: `3px solid ${theme.primary}`,
                borderRadius: 12,
                boxShadow: theme.shadowLg,
                padding: "12px 14px",
                zIndex: 2001,
                width: POPOVER_WIDTH,
                color: theme.textSecondary,
                fontSize: 13,
                lineHeight: 1.5,
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: "normal",
                fontFamily: theme.fontFamily,
              }}
            >
              {text}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

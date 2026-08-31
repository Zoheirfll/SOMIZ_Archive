import { useState } from "react";
import { theme } from "../styles/theme";
import { InfoIcon } from "./icons";

const VARIANTS = {
  hero: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
  },
  field: {
    background: theme.bg,
    color: theme.textSecondary,
  },
};

export default function InfoNotice({ text, variant = "hero", size = 18 }) {
  const [open, setOpen] = useState(false);

  if (!text) return null;

  const colors = VARIANTS[variant] || VARIANTS.hero;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Aide"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          border: "none",
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
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
          />
          <div
            className="anim-scale-in"
            style={{
              position: "absolute",
              left: 0,
              top: "calc(100% + 8px)",
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              boxShadow: theme.shadowMd,
              padding: "12px 14px",
              zIndex: 11,
              width: 260,
              color: theme.textSecondary,
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            {text}
          </div>
        </>
      )}
    </div>
  );
}

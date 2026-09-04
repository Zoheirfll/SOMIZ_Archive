import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import { IconArrowRight } from "./icons";

// Carte hiérarchique premium (Direction/Département/Service/Pôle/Cellule/
// Section) utilisée dans le drill-down organisationnel de /employees —
// extraite de Employees.jsx pour garder la page principale sous 1000 lignes.
const HierarchyCard = ({
  icon,
  name,
  code,
  count,
  countLabel,
  gradient,
  accentColor,
  animClass,
  onClick,
}) => {
  const theme = useTheme();
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
        transform: hovered
          ? "translateY(-6px) scale(1.01)"
          : "translateY(0) scale(1)",
        transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
        display: "flex",
        flexDirection: "column",
        minHeight: 240,
        border: `1px solid ${hovered ? accentColor + "40" : theme.border}`,
      }}
    >
      {/* Zone gradient supérieure */}
      <div
        style={{
          background: gradient,
          padding: "28px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Cercle décoratif */}
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -20,
            left: "30%",
            width: 70,
            height: 70,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            pointerEvents: "none",
          }}
        />

        {/* Avatar : abréviation du code si disponible, sinon icône générique */}
        <div
          style={{
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
            fontWeight: 800,
            fontSize: 15,
            letterSpacing: "-0.02em",
          }}
        >
          {code ? code.slice(0, 4).toUpperCase() : icon}
        </div>

        {/* Compteur */}
        {count != null && (
          <div
            style={{
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
            }}
          >
            {count} {countLabel}
          </div>
        )}
      </div>

      {/* Zone informations basse */}
      <div
        style={{
          padding: "18px 24px 20px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              color: theme.text,
              fontWeight: 700,
              fontSize: 16,
              lineHeight: 1.3,
              marginBottom: code ? 8 : 0,
              fontFamily: theme.fontFamily,
            }}
          >
            {name}
          </div>
          {code && (
            <div
              style={{
                color: accentColor,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                fontFamily: "monospace",
                background: accentColor + "12",
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 5,
              }}
            >
              {code}
            </div>
          )}
        </div>

        {/* Lien explorer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            paddingTop: 14,
            borderTop: `1px solid ${theme.border}`,
          }}
        >
          <span
            style={{
              color: hovered ? accentColor : theme.textMuted,
              fontSize: 12,
              fontWeight: 600,
              transition: "color 0.2s",
            }}
          >
            Explorer
          </span>
          <div
            style={{
              color: hovered ? accentColor : theme.textMuted,
              display: "flex",
              alignItems: "center",
              transition: "all 0.2s",
              transform: hovered ? "translateX(4px)" : "translateX(0)",
            }}
          >
            <IconArrowRight size={15} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HierarchyCard;

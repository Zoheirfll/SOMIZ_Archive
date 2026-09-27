import { useTheme } from "../../context/ThemeContext";
import { IconChevronRight } from "./icons";

const Breadcrumb = ({ items, variant = "default" }) => {
  const theme = useTheme();
  const isHero = variant === "hero";
  const colors = isHero
    ? {
        link: "rgba(255,255,255,0.8)",
        current: "rgba(255,255,255,0.95)",
        separator: "rgba(255,255,255,0.4)",
        hoverBg: "rgba(255,255,255,0.12)",
      }
    : {
        link: theme.primary,
        current: theme.text,
        separator: theme.textMuted,
        hoverBg: theme.primaryBg,
      };
  return (
  <nav
    style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}
  >
    {items.map((item, idx) => (
      <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {idx > 0 && (
          <span
            style={{
              color: colors.separator,
              display: "flex",
              alignItems: "center",
            }}
          >
            <IconChevronRight size={11} />
          </span>
        )}
        <button
          onClick={item.onClick}
          disabled={!item.onClick || idx === items.length - 1}
          style={{
            background: isHero ? "rgba(255,255,255,0.12)" : "none",
            border: isHero ? "none" : "none",
            padding: isHero ? "5px 12px" : "3px 8px",
            borderRadius: isHero ? 6 : 6,
            color: idx === items.length - 1 ? colors.current : colors.link,
            fontWeight: idx === items.length - 1 ? 700 : 500,
            fontSize: isHero ? 12 : 13,
            cursor: idx === items.length - 1 ? "default" : "pointer",
            fontFamily: theme.fontFamily,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (idx < items.length - 1)
              e.currentTarget.style.background = colors.hoverBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isHero ? "rgba(255,255,255,0.12)" : "none";
          }}
        >
          {item.label}
        </button>
      </span>
    ))}
  </nav>
  );
};

export default Breadcrumb;

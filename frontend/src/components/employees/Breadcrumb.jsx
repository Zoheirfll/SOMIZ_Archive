import { useTheme } from "../../context/ThemeContext";
import { IconChevronRight } from "./icons";
import LienNav, { LienAction } from "../LienNav";

// Un élément peut porter `to` (vrai lien : clic droit / Ctrl+clic = nouvel
// onglet — à préférer dès que la destination est une URL) ou `onClick`
// (action sans URL). Le dernier élément est la page courante, jamais cliquable.
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
  const reposBg = isHero ? "rgba(255,255,255,0.12)" : "none";
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {items.map((item, idx) => {
        const dernier = idx === items.length - 1;
        const style = {
          background: reposBg,
          border: "none",
          padding: isHero ? "5px 12px" : "3px 8px",
          borderRadius: 6,
          color: dernier ? colors.current : colors.link,
          fontWeight: dernier ? 700 : 500,
          fontSize: isHero ? 12 : 13,
          cursor: dernier ? "default" : "pointer",
          fontFamily: theme.fontFamily,
          transition: "background 0.15s",
        };
        const survol = {
          onMouseEnter: (e) => { if (!dernier) e.currentTarget.style.background = colors.hoverBg; },
          onMouseLeave: (e) => { e.currentTarget.style.background = reposBg; },
        };
        return (
          <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {idx > 0 && (
              <span style={{ color: colors.separator, display: "flex", alignItems: "center" }}>
                <IconChevronRight size={11} />
              </span>
            )}
            {item.href && item.onClick && !dernier ? (
              <LienAction href={item.href} onAction={item.onClick} style={{ ...style, display: "inline-block" }} {...survol}>
                {item.label}
              </LienAction>
            ) : item.to && !dernier ? (
              <LienNav to={item.to} style={style} {...survol}>{item.label}</LienNav>
            ) : (
              <button onClick={item.onClick} disabled={!item.onClick || dernier} style={style} {...survol}>
                {item.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;

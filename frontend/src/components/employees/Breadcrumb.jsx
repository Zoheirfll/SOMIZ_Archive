import { useTheme } from "../../context/ThemeContext";
import { IconChevronRight } from "./icons";

const Breadcrumb = ({ items }) => {
  const theme = useTheme();
  return (
  <nav
    style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}
  >
    {items.map((item, idx) => (
      <span key={idx} style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {idx > 0 && (
          <span
            style={{
              color: theme.textMuted,
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
            background: "none",
            border: "none",
            padding: "3px 8px",
            borderRadius: 6,
            color: idx === items.length - 1 ? theme.text : theme.primary,
            fontWeight: idx === items.length - 1 ? 700 : 500,
            fontSize: 13,
            cursor: idx === items.length - 1 ? "default" : "pointer",
            fontFamily: theme.fontFamily,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (idx < items.length - 1)
              e.currentTarget.style.background = theme.primaryBg;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
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

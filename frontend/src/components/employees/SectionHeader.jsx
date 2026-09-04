import { useTheme } from "../../context/ThemeContext";

const SectionHeader = ({ title, subtitle, color }) => {
  const theme = useTheme();
  return (
  <div style={{ marginBottom: 28 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 6,
      }}
    >
      <div
        style={{
          width: 4,
          height: 28,
          background: color,
          borderRadius: 2,
        }}
      />
      <h2
        style={{
          color: theme.text,
          fontWeight: 800,
          fontSize: 20,
          margin: 0,
          fontFamily: theme.fontFamily,
        }}
      >
        {title}
      </h2>
    </div>
    <p
      style={{
        color: theme.textSecondary,
        fontSize: 13,
        margin: "0 0 0 16px",
        fontFamily: theme.fontFamily,
      }}
    >
      {subtitle}
    </p>
  </div>
  );
};

export default SectionHeader;

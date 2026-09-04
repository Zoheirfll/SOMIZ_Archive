export const getInputStyle = (theme) => ({
  width: "100%",
  border: `1px solid ${theme.primaryBorder}`,
  borderRadius: 8,
  padding: "9px 14px",
  color: theme.text,
  fontSize: 13,
  outline: "none",
  background: theme.bg,
  boxSizing: "border-box",
  marginBottom: 12,
});

export const getLabelStyle = (theme) => ({
  color: theme.text,
  fontSize: 12,
  fontWeight: 600,
  display: "block",
  marginBottom: 5,
});

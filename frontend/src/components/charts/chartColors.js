// Palette cyclique pour les graphiques multi-catégories (donuts, radar...).
// Réutilise les tokens de thème existants en priorité, complétée par des
// teintes supplémentaires pour les listes plus longues (ex. Par Fonction).
export const paletteFor = (theme) => [
  theme.primary,
  theme.departementColor,
  theme.serviceColor,
  theme.accent,
  theme.danger,
  "#0891b2", // cyan-600
  "#db2777", // pink-600
  "#65a30d", // lime-600
  "#7c3aed", // violet-600
  "#ea580c", // orange-600
];

export const colorAt = (theme, index) => {
  const palette = paletteFor(theme);
  return palette[index % palette.length];
};

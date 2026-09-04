export const lightTheme = {
  // ─── Police ──────────────────────────────────────────────────────────────
  fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",

  // ─── Palette principale (vert SOMIZ — brand identity) ────────────────────
  primary: "#166534",          // green-800
  primaryLight: "#16a34a",     // green-600
  primaryBg: "#f0fdf4",        // green-50
  primaryBorder: "#bbf7d0",    // green-200

  // ─── Couleurs de page ─────────────────────────────────────────────────────
  bg: "#F1F5F9",               // slate-100 — fond général
  surface: "#FFFFFF",
  surfaceHover: "#F8FAFC",
  surfaceElevated: "#FFFFFF",

  // ─── Textes ───────────────────────────────────────────────────────────────
  text: "#0F172A",             // slate-900
  textSecondary: "#475569",    // slate-600
  textMuted: "#1E293B",        // slate-800 (assombri à la demande — labels type "Matricule")

  // ─── Bordures ─────────────────────────────────────────────────────────────
  border: "#E2E8F0",           // slate-200
  borderLight: "#F1F5F9",      // slate-100

  // ─── États ────────────────────────────────────────────────────────────────
  success: "#166534",
  warning: "#B45309",
  danger: "#DC2626",
  dangerBg: "#FEF2F2",
  dangerBorder: "#FECACA",

  // ─── Accent chaleureux (identité "vivante") ──────────────────────────────
  accent: "#F59E0B",        // amber-500
  accentLight: "#FBBF24",   // amber-400
  accentBg: "#FFFBEB",      // amber-50
  accentBorder: "#FDE68A",  // amber-200

  // ─── Ombres (élévation) ───────────────────────────────────────────────────
  shadow:    "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
  shadowMd:  "0 4px 12px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)",
  shadowLg:  "0 12px 32px rgba(15,23,42,0.12), 0 4px 8px rgba(15,23,42,0.06)",
  shadowXl:  "0 24px 48px rgba(15,23,42,0.16), 0 8px 16px rgba(15,23,42,0.08)",

  // ─── Cartes hiérarchiques ─────────────────────────────────────────────────
  cardRadius: 20,
  cardHover: "#F8FAFC",

  // Couleurs par niveau + dégradés
  directionColor:   "#166534",
  directionGrad:    "linear-gradient(135deg, #052e16 0%, #166534 60%, #15803d 100%)",
  directionAccent:  "#f0fdf4",

  departementColor:  "#1e40af",
  departementGrad:   "linear-gradient(135deg, #1e1b4b 0%, #1e40af 60%, #2563eb 100%)",
  departementAccent: "#eff6ff",

  serviceColor:  "#6d28d9",
  serviceGrad:   "linear-gradient(135deg, #2e1065 0%, #6d28d9 60%, #7c3aed 100%)",
  serviceAccent: "#f5f3ff",

  // Badges
  badgeBg:    "rgba(22,101,52,0.08)",
  badgeColor: "#166534",

  // ─── Fond de page vivant ──────────────────────────────────────────────────
  pageBg: "#F1F5F9",             // base — identique à bg, les halos sont en CSS
  // ─── Cartes — liseré supérieur dégradé ───────────────────────────────────
  cardBorderTopGrad: "linear-gradient(90deg, #166534 0%, #F59E0B 100%)",

  mode: "light",
};

export const darkTheme = {
  // ─── Police ──────────────────────────────────────────────────────────────
  fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif",

  // ─── Palette principale (vert SOMIZ — brand identity) ────────────────────
  primary: "#4ade80",          // green-400 — plus clair pour contraster sur fond sombre
  primaryLight: "#22c55e",     // green-500
  primaryBg: "#0D2818",        // vert très sombre (fond de badge/bloc)
  primaryBorder: "#22633D",    // vert moyen — visible sur fond sombre (pas trop foncé)

  // ─── Couleurs de page — échelle d'élévation (Material dark theme : plus la
  // surface est "haute", plus elle est claire, jamais d'ombre pure sur noir) ─
  bg: "#0A0F1A",               // fond général — proche noir, pas OLED pur (moins de halo)
  surface: "#131B2B",          // niveau 1 — cartes, tables
  surfaceElevated: "#1B2538",
  surfaceHover: "#212D45",

  // ─── Textes ───────────────────────────────────────────────────────────────
  text: "#F1F5F9",             // slate-100 — ~15.5:1 sur bg (AAA)
  textSecondary: "#A3AFC2",    // ~7.3:1 sur bg (AAA) — plus clair que l'ancien slate-400 (4.9:1, limite)
  textMuted: "#CBD5E1",        // slate-300

  // ─── Bordures ─────────────────────────────────────────────────────────────
  border: "#2E3A52",           // visible sans dominer (contraste ~1.6:1 sur bg, suffisant pour un liseré)
  borderLight: "#212D45",

  // ─── États ────────────────────────────────────────────────────────────────
  success: "#4ade80",
  warning: "#fbbf24",
  danger: "#f87171",
  dangerBg: "#2C1417",
  dangerBorder: "#5C2328",

  // ─── Accent chaleureux (identité "vivante") ──────────────────────────────
  accent: "#fbbf24",         // amber-400
  accentLight: "#fcd34d",    // amber-300
  accentBg: "#2A2110",       // ambre très sombre
  accentBorder: "#78350f",   // amber-900

  // ─── Ombres (élévation) — renforcées : sur fond déjà sombre, l'ombre seule
  // ne suffit pas à distinguer les niveaux, elle reste utile pour les
  // éléments flottants (modales, dropdowns) au-dessus du contenu ──────────
  shadow:    "0 1px 3px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)",
  shadowMd:  "0 4px 14px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)",
  shadowLg:  "0 16px 36px rgba(0,0,0,0.65), 0 6px 12px rgba(0,0,0,0.45)",
  shadowXl:  "0 28px 56px rgba(0,0,0,0.7), 0 10px 20px rgba(0,0,0,0.5)",

  // ─── Cartes hiérarchiques ─────────────────────────────────────────────────
  cardRadius: 20,
  cardHover: "#212D45",

  // Couleurs par niveau + dégradés (gradients déjà sombres — inchangés,
  // les couleurs "plates" sont éclaircies pour rester lisibles en texte/icône)
  directionColor:   "#4ade80",
  directionGrad:    "linear-gradient(135deg, #052e16 0%, #166534 60%, #15803d 100%)",
  directionAccent:  "#0D2818",

  departementColor:  "#60a5fa",
  departementGrad:   "linear-gradient(135deg, #1e1b4b 0%, #1e40af 60%, #2563eb 100%)",
  departementAccent: "#101A33",

  serviceColor:  "#a78bfa",
  serviceGrad:   "linear-gradient(135deg, #2e1065 0%, #6d28d9 60%, #7c3aed 100%)",
  serviceAccent: "#1A1130",

  // Badges
  badgeBg:    "rgba(74,222,128,0.14)",
  badgeColor: "#4ade80",

  // ─── Fond de page vivant ──────────────────────────────────────────────────
  pageBg: "#0A0F1A",
  // ─── Cartes — liseré supérieur dégradé ───────────────────────────────────
  cardBorderTopGrad: "linear-gradient(90deg, #4ade80 0%, #fbbf24 100%)",

  mode: "dark",
};

export const getTheme = (mode) => (mode === "dark" ? darkTheme : lightTheme);

// ─── Helpers responsives (voir hooks/useIsMobile.js) ───────────────────────
// Pattern hero header commun à toutes les pages (CLAUDE.md) : padding fixe
// 40px/32px en desktop, réduit sur mobile pour ne pas manger l'espace des
// petits écrans (~360-390px). Réutiliser plutôt que dupliquer ces valeurs.
export const heroPadding = (isMobile) =>
  isMobile ? "24px 16px 20px" : "40px 32px 32px";

export const contentPadding = (isMobile) =>
  isMobile ? "16px" : "32px";

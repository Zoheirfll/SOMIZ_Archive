export const theme = {
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
  textMuted: "#94A3B8",        // slate-400

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
};

// ─── Helpers responsives (voir hooks/useIsMobile.js) ───────────────────────
// Pattern hero header commun à toutes les pages (CLAUDE.md) : padding fixe
// 40px/32px en desktop, réduit sur mobile pour ne pas manger l'espace des
// petits écrans (~360-390px). Réutiliser plutôt que dupliquer ces valeurs.
export const heroPadding = (isMobile) =>
  isMobile ? "24px 16px 20px" : "40px 32px 32px";

export const contentPadding = (isMobile) =>
  isMobile ? "16px" : "32px";

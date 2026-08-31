// Registre central des raccourcis clavier de l'application — un seul
// tableau, consommé par GlobalShortcuts (liaison réelle), Employees.jsx
// (pagination) et KeyboardShortcutsHelp (aide + personnalisation). Ajouter
// un raccourci ici suffit à le faire apparaître dans l'aide et le rendre
// personnalisable.
export const DEFAULT_SHORTCUTS = [
  { id: "nav-back", combo: "Alt+ArrowLeft", label: "Retour (page précédente)", category: "navigation" },
  { id: "nav-forward", combo: "Alt+ArrowRight", label: "Avancer (page suivante)", category: "navigation" },
  { id: "help-toggle", combo: "?", label: "Afficher / masquer cette aide", category: "navigation" },

  { id: "nav-employees", combo: "Alt+E", label: "Employés", path: "/employees", category: "quick" },
  { id: "nav-organigramme", combo: "Alt+O", label: "Organigramme", path: "/organigramme", category: "quick" },
  { id: "nav-dashboard", combo: "Alt+D", label: "Dashboard", path: "/dashboard", category: "quick", adminOnly: true },
  { id: "nav-users", combo: "Alt+U", label: "Utilisateurs", path: "/users", category: "quick", adminOnly: true },
  { id: "nav-parametres", combo: "Alt+P", label: "Paramètres", path: "/parametres", category: "quick", adminOnly: true },
  { id: "nav-audit", combo: "Alt+J", label: "Journal d'audit", path: "/audit", category: "quick", adminOnly: true },
  { id: "nav-import", combo: "Alt+I", label: "Import", path: "/import", category: "quick", adminOnly: true },
  { id: "nav-profil", combo: "Alt+M", label: "Mon profil", path: "/profil", category: "quick" },

  { id: "pagination-next", combo: "ArrowRight", label: "Page suivante (listes)", category: "pagination" },
  { id: "pagination-prev", combo: "ArrowLeft", label: "Page précédente (listes)", category: "pagination" },
];

export const SHORTCUTS_STORAGE_KEY = "somiz_keyboard_shortcuts_overrides";

export const resolveCombo = (shortcut, overrides) => overrides[shortcut.id] || shortcut.combo;

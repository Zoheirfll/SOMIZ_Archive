import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useKeyboardShortcutsHelp } from "../context/KeyboardShortcutsContext";
import { useShortcut } from "../hooks/useKeyboardShortcuts";
import { DEFAULT_SHORTCUTS, resolveCombo } from "../config/keyboardShortcuts";
import KeyboardShortcutsHelp from "./KeyboardShortcutsHelp";

const isAdmin = (role) => ["ADMIN", "SUPERADMIN"].includes(role);

// Fixe (filtré par catégorie, pas par rôle) : le nombre de hooks appelés
// doit rester constant à chaque rendu — voir règle des Hooks React.
const NAV_SHORTCUTS = DEFAULT_SHORTCUTS.filter((s) => s.category !== "pagination");

/**
 * Raccourcis clavier globaux (navigation rapide + aide) — monté une seule
 * fois dans App.js, à l'intérieur du BrowserRouter (a besoin de useNavigate).
 * Désactivé sur /login et /consentement pour ne pas court-circuiter ces flux.
 * Les combos réels sont résolus depuis les personnalisations de l'utilisateur
 * (KeyboardShortcutsContext#overrides), avec repli sur les valeurs par défaut.
 */
export default function GlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { helpOpen, toggleHelp, closeHelp, overrides } = useKeyboardShortcutsHelp();

  const disabled = !user || location.pathname === "/login" || location.pathname === "/consentement";

  NAV_SHORTCUTS.forEach((s) => {
    const combo = resolveCombo(s, overrides);
    const enabled = !disabled && (!s.adminOnly || isAdmin(user?.role));
    let handler;
    if (s.id === "nav-back") handler = () => navigate(-1);
    else if (s.id === "nav-forward") handler = () => navigate(1);
    else if (s.id === "help-toggle") handler = toggleHelp;
    else handler = () => navigate(s.path);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useShortcut(combo, handler, { enabled });
  });

  useShortcut("Escape", closeHelp, { enabled: helpOpen, allowInInputs: true });

  return helpOpen ? <KeyboardShortcutsHelp onClose={closeHelp} /> : null;
}

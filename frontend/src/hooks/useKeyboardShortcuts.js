import { useEffect, useRef } from "react";

const isTypingTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

// Symboles obtenus via Shift sur un clavier standard (ex. "?" = Shift+/) —
// e.key reflète déjà le symbole produit, donc on ne doit pas en plus exiger
// shiftKey===true/false : ça casserait la correspondance selon la disposition
// clavier de l'utilisateur.
const SHIFT_PRODUCED_SYMBOLS = new Set([
  "?", "!", "@", "#", "$", "%", "^", "&", "*", "(", ")",
  "_", "+", "~", "{", "}", "|", ":", '"', "<", ">",
]);

/**
 * Enregistre un raccourci clavier local à un composant (nettoyé au démontage).
 * combo: "ArrowRight" | "Alt+ArrowRight" | "?" | "Escape" ...
 * Ignoré par défaut si le focus est dans un champ de saisie, pour ne pas
 * interférer avec la frappe (recherche, formulaires) — voir allowInInputs.
 */
export function useShortcut(combo, handler, { enabled = true, allowInInputs = false } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled || !combo) return;
    const parts = combo.split("+");
    const key = parts.pop().toLowerCase();
    const needsAlt = parts.includes("Alt");
    const needsCtrl = parts.includes("Ctrl");
    const needsShift = parts.includes("Shift");
    const shiftIsAmbiguous = key.length === 1 && SHIFT_PRODUCED_SYMBOLS.has(key);

    const onKeyDown = (e) => {
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() !== key) return;
      if (needsAlt !== e.altKey) return;
      if (needsCtrl !== e.ctrlKey) return;
      if (!shiftIsAmbiguous && needsShift !== e.shiftKey) return;
      e.preventDefault();
      handlerRef.current(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, enabled, allowInInputs]);
}

/**
 * Raccourcis de pagination (← page précédente / → page suivante) pour toute
 * liste paginée — les combos sont personnalisables (voir
 * config/keyboardShortcuts.js), à passer via comboNext/comboPrev résolus
 * depuis KeyboardShortcutsContext#overrides.
 */
export function usePaginationShortcuts({
  page,
  totalPages,
  onNext,
  onPrev,
  enabled = true,
  comboNext = "ArrowRight",
  comboPrev = "ArrowLeft",
}) {
  useShortcut(comboNext, () => onNext(), { enabled: enabled && page < totalPages });
  useShortcut(comboPrev, () => onPrev(), { enabled: enabled && page > 1 });
}

/**
 * Construit une chaîne de combo ("Alt+Shift+E") à partir d'un KeyboardEvent,
 * pour la capture d'un nouveau raccourci pendant la personnalisation.
 * Renvoie null si la touche pressée est un modificateur seul (à ignorer).
 */
export function comboFromEvent(e) {
  const MODIFIER_KEYS = new Set(["Alt", "Control", "Shift", "Meta"]);
  if (MODIFIER_KEYS.has(e.key)) return null;

  const parts = [];
  if (e.altKey) parts.push("Alt");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey && !(e.key.length === 1 && SHIFT_PRODUCED_SYMBOLS.has(e.key))) {
    parts.push("Shift");
  }

  let key = e.key;
  if (key === " ") key = "Space";
  else if (key.length === 1) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}

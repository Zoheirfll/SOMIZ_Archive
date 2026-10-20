import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Comportement clavier/focus d'une modale (WAI-ARIA « dialog ») :
 *  - mémorise l'élément qui avait le focus à l'ouverture et le lui rend à la
 *    fermeture (sinon le focus retombe sur <body> et un utilisateur clavier
 *    perd sa place dans la page) ;
 *  - Échap appelle `onEscape` ;
 *  - Tab / Shift+Tab bouclent à l'intérieur de la modale ;
 *  - `initialFocus` (sélecteur CSS dans la modale) reçoit le focus à
 *    l'ouverture ; à défaut, le premier élément focalisable.
 *
 * Usage : `const ref = useModalA11y({ isOpen, onEscape, initialFocus })` puis
 * `<div role="dialog" aria-modal="true" ref={ref}>`.
 */
export default function useModalA11y({ isOpen, onEscape, initialFocus }) {
  const containerRef = useRef(null);
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!isOpen) return undefined;
    const declencheur = document.activeElement;

    const container = containerRef.current;
    const cible =
      (initialFocus && container?.querySelector(initialFocus)) ||
      container?.querySelector(FOCUSABLE);
    cible?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const items = Array.from(containerRef.current.querySelectorAll(FOCUSABLE));
      if (items.length === 0) return;
      const premier = items[0];
      const dernier = items[items.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (declencheur && typeof declencheur.focus === "function" && document.contains(declencheur)) {
        declencheur.focus();
      }
    };
  }, [isOpen, initialFocus]);

  return containerRef;
}

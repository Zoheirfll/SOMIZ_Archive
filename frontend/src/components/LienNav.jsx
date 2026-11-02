// frontend/src/components/LienNav.jsx
import { Link } from "react-router-dom";

// Vrai lien de navigation interne (2026-11-01) : à utiliser à la place d'un
// <button onClick={() => navigate(...)}> dès qu'un élément MÈNE à une autre
// page. Clic normal = navigation sans rechargement (react-router) ; Ctrl/Cmd
// +clic, clic molette et clic droit « Ouvrir dans un nouvel onglet » marchent
// comme sur n'importe quel site. Le style d'un bouton est conservé (`style`
// passé tel quel) ; le soulignement natif du lien est retiré.
// Clic « simple » (gauche, sans modificateur) : le seul cas où l'on remplace la
// navigation native par l'action d'état de la page.
export const clicSimple = (e) =>
  e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

// Lien natif (href) dont le clic simple déclenche `onAction` au lieu de recharger
// la page — pour les écrans pilotés par un état local (drill-down) qui ont aussi
// une URL : clic droit « Ouvrir dans un nouvel onglet », Ctrl/molette = nouvel
// onglet, clic simple = comportement habituel sans rechargement.
export function LienAction({ href, onAction, style, children, ...rest }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        if (!clicSimple(e)) return;
        e.preventDefault();
        onAction?.(e);
      }}
      style={{ textDecoration: "none", color: "inherit", cursor: "pointer", ...style }}
      {...rest}
    >
      {children}
    </a>
  );
}

export default function LienNav({ to, state, style, children, ...rest }) {
  return (
    <Link
      to={to}
      state={state}
      style={{ textDecoration: "none", display: "inline-block", cursor: "pointer", ...style }}
      {...rest}
    >
      {children}
    </Link>
  );
}

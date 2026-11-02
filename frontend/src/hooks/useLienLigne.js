// frontend/src/hooks/useLienLigne.js
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ouvrirMenuLien } from "../components/MenuLien";

// Ligne / cellule de tableau cliquable qui mène à une page (2026-11-01) : un
// <tr>/<td> ne peut pas être un vrai lien, mais doit quand même s'ouvrir dans
// un nouvel onglet au Ctrl/Cmd+clic ou au clic molette. Pour le clic droit
// « Ouvrir dans un nouvel onglet », poser en plus un <LienNav> sur l'élément
// principal de la ligne (matricule, référence, bouton « Voir »).
//
//   const lienLigne = useLienLigne();
//   <td {...lienLigne(`/employees/${slug}`)}>…</td>
//
// Un clic sur un vrai lien (<a>) ou un contrôle (bouton, case à cocher) dans la
// ligne est ignoré ici : il gère sa propre action (sinon double ouverture).
const INTERACTIF = "a, button, input, select, textarea, label";

// Contrôle interactif placé DANS l'élément qui porte le lien (cellule, ligne) :
// il gère sa propre action. L'élément porteur lui-même peut être un bouton
// (<button {...lienLigne(url)}>) : son propre clic doit naviguer.
const dansUnControle = (e) => {
  const controle = e.target.closest?.(INTERACTIF);
  return !!controle && controle !== e.currentTarget && e.currentTarget.contains(controle);
};

export const ouvrirOnglet = (url) => window.open(url, "_blank", "noopener");

export default function useLienLigne() {
  const navigate = useNavigate();
  return useCallback((url) => ({
    onClick: (e) => {
      if (e.defaultPrevented || dansUnControle(e)) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        ouvrirOnglet(url);
        return;
      }
      navigate(url);
    },
    onAuxClick: (e) => {
      if (e.button !== 1 || dansUnControle(e)) return;
      e.preventDefault();
      ouvrirOnglet(url);
    },
    // Clic droit : menu « Ouvrir dans un nouvel onglet » (sauf sur un contrôle de la
    // ligne, qui garde le menu natif du navigateur).
    onContextMenu: (e) => {
      if (dansUnControle(e)) return;
      e.preventDefault();
      ouvrirMenuLien(e.clientX, e.clientY, url);
    },
    // Empêche le défilement automatique du clic molette sur la ligne.
    onMouseDown: (e) => { if (e.button === 1) e.preventDefault(); },
  }), [navigate]);
}

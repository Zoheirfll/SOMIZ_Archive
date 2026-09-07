import { useEffect } from "react";

// Titre d'onglet dynamique par page (ex. "Employés — SOMIZ") — le
// <title> statique de public/index.html ("SOMIZ — Dossiers RH") reste
// le titre par défaut au premier chargement, avant que React ne monte.
const usePageTitle = (title) => {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — SOMIZ` : "SOMIZ — Dossiers RH";
    return () => {
      document.title = previous;
    };
  }, [title]);
};

export default usePageTitle;

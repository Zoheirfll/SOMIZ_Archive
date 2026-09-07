import { Spinner } from "./icons";

// Affiché brièvement pendant le téléchargement du chunk JS d'une page
// lazy-loadée (voir App.js) — la plupart des pages sont déjà en cache
// après le premier accès, donc ce fallback n'apparaît en pratique qu'une
// fois par page sur toute une session.
const RouteFallback = () => (
  <div
    style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#166534",
    }}
  >
    <Spinner size={28} />
  </div>
);

export default RouteFallback;

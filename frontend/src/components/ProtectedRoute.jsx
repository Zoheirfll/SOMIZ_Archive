import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, adminOnly = false, allowedRoles = null, requireFn = null }) => {
  const { user, authenticated, authChecked } = useAuth();
  const location = useLocation();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  // Mot de passe temporaire : tout est bloqué (côté API aussi) jusqu'à son remplacement.
  if (user?.must_change_password && location.pathname !== "/mot-de-passe") {
    return <Navigate to="/mot-de-passe" replace />;
  }
  // Un compte neuf cumule mot de passe temporaire ET consentement à donner :
  // le mot de passe passe en premier, donc on ne renvoie pas vers
  // /consentement depuis /mot-de-passe (sinon boucle de redirection infinie
  // entre les deux pages → page blanche).
  if (user?.needs_consent && location.pathname !== "/consentement" && location.pathname !== "/mot-de-passe") {
    return <Navigate to="/consentement" state={{ from: location.pathname }} replace />;
  }
  if (adminOnly && !["ADMIN", "SUPERADMIN"].includes(user?.role)) return <Navigate to="/employees" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/employees" replace />;
  // Vérification additionnelle au-delà du rôle brut — ex. un ADMIN non
  // chargé des attestations (User.can_manage_attestations) reste dans
  // allowedRoles mais ne doit pas accéder à /attestations.
  if (requireFn && !requireFn(user)) return <Navigate to="/employees" replace />;
  return children;
};

export default ProtectedRoute;

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, adminOnly = false, allowedRoles = null, requireFn = null }) => {
  const { user, authenticated, authChecked } = useAuth();
  const location = useLocation();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.needs_consent && location.pathname !== "/consentement") {
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

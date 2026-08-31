import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, authenticated, authChecked } = useAuth();
  const location = useLocation();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  if (user?.needs_consent && location.pathname !== "/consentement") {
    return <Navigate to="/consentement" state={{ from: location.pathname }} replace />;
  }
  if (adminOnly && !["ADMIN", "SUPERADMIN"].includes(user?.role)) return <Navigate to="/employees" replace />;
  return children;
};

export default ProtectedRoute;

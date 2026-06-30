import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, authenticated, authChecked } = useAuth();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== "ADMIN") return <Navigate to="/employees" replace />;
  return children;
};

export default ProtectedRoute;

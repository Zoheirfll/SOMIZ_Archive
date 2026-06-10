import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { authenticated, authChecked } = useAuth();
  if (!authChecked) return null; // Attendre la vérification cookie avant de rediriger
  if (!authenticated) return <Navigate to="/login" replace />;
  return children;
};

export default ProtectedRoute;

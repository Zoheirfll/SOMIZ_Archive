import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = sessionStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const refreshUser = useCallback(() => {
    return api.get("/auth/me/")
      .then((res) => {
        setUser(res.data);
        setAuthenticated(true);
        sessionStorage.setItem("user", JSON.stringify(res.data));
      })
      .catch(() => {
        setUser(null);
        setAuthenticated(false);
        sessionStorage.removeItem("user");
      });
  }, []);

  useEffect(() => {
    // Vérifier la session via le cookie (invisible JS)
    refreshUser().finally(() => setAuthChecked(true));
  }, [refreshUser]);

  const loginSuccess = (userData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  const logoutSuccess = () => {
    setUser(null);
    setAuthenticated(false);
    sessionStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, authenticated, authChecked, loginSuccess, logoutSuccess, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

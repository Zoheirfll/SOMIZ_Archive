import { createContext, useContext, useState } from "react";
import { getUser, isAuthenticated } from "../services/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getUser());
  const [authenticated, setAuthenticated] = useState(isAuthenticated());

  const loginSuccess = (userData) => {
    setUser(userData);
    setAuthenticated(true);
  };

  const logoutSuccess = () => {
    setUser(null);
    setAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{ user, authenticated, loginSuccess, logoutSuccess }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

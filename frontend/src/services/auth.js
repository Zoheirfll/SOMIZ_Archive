import api from "./api";

export const login = async (username, password) => {
  const response = await api.post("/auth/login/", { username, password });
  // Les tokens sont dans les cookies httpOnly — on retourne juste les infos user
  return response.data;
};

export const logout = async () => {
  try {
    await api.post("/auth/logout/");
  } catch {
    // On déconnecte côté client même si la requête échoue
  }
};

export const getUser = () => {
  const user = sessionStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

export const isAuthenticated = () => {
  return !!sessionStorage.getItem("user");
};

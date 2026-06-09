import api from "./api";

export const login = async (username, password) => {
  const response = await api.post("/auth/login/", { username, password });
  return response.data;
};

export const logout = async () => {
  const refresh =
    localStorage.getItem("refresh_token") ||
    sessionStorage.getItem("refresh_token");
  try {
    await api.post("/auth/logout/", { refresh });
  } finally {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
    sessionStorage.removeItem("user");
  }
};

export const getUser = () => {
  const user = localStorage.getItem("user") || sessionStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

export const isAuthenticated = () => {
  return !!(
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token")
  );
};

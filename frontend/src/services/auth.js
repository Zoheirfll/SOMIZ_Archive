import api from "./api";

export const login = async (username, password) => {
  const response = await api.post("/auth/login/", { username, password });
  localStorage.setItem("access_token", response.data.access);
  localStorage.setItem("refresh_token", response.data.refresh);
  localStorage.setItem("user", JSON.stringify(response.data.user));
  return response.data;
};

export const logout = async () => {
  const refresh = localStorage.getItem("refresh_token");
  try {
    await api.post("/auth/logout/", { refresh });
  } finally {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
  }
};

export const getUser = () => {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};

export const isAuthenticated = () => {
  return !!localStorage.getItem("access_token");
};

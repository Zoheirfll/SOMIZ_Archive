import axios from "axios";

const API_URL = "/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Ajoute automatiquement le token à chaque requête
api.interceptors.request.use((config) => {
  // 🔴 LA CORRECTION EST ICI : On lit le local ET la session
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si token expiré ou accès refusé — redirige vers login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Empêche la boucle infinie si c'est juste un mauvais mot de passe
    const isLoginRequest = error.config.url.includes("/auth/login");

    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default api;

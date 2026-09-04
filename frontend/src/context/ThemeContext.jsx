import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getTheme } from "../styles/theme";

const STORAGE_KEY = "somiz_theme_mode";

const ThemeModeContext = createContext(null);

const readInitialMode = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage indisponible (mode privé strict, etc.)
  }
  // Pas de choix explicite enregistré → clair par défaut (ne suit pas
  // prefers-color-scheme, pour ne pas surprendre un utilisateur dont l'OS
  // est en sombre alors qu'il n'a jamais activé le mode sombre sur SOMIZ).
  return "light";
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(readInitialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // stockage indisponible — le mode reste actif pour la session en cours
    }
  }, [mode]);

  const toggleMode = () => setMode((m) => (m === "dark" ? "light" : "dark"));

  const value = useMemo(
    () => ({ mode, toggleMode, theme: getTheme(mode) }),
    [mode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      {children}
    </ThemeModeContext.Provider>
  );
}

const useThemeContext = () => {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) {
    throw new Error("useTheme/useThemeMode doit être utilisé sous ThemeProvider");
  }
  return ctx;
};

export const useTheme = () => useThemeContext().theme;

export const useThemeMode = () => {
  const { mode, toggleMode } = useThemeContext();
  return { mode, toggleMode };
};

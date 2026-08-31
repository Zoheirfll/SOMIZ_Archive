import { createContext, useCallback, useContext, useState } from "react";
import { SHORTCUTS_STORAGE_KEY } from "../config/keyboardShortcuts";

const KeyboardShortcutsContext = createContext(null);

const loadOverrides = () => {
  try {
    const raw = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const persistOverrides = (overrides) => {
  try {
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // stockage indisponible (navigation privée...) — les personnalisations
    // restent actives pour la session en cours seulement
  }
};

/**
 * Partage l'état d'ouverture de la modale d'aide "Raccourcis clavier" et les
 * personnalisations de combos (par navigateur, localStorage — même pattern
 * que somiz_employees_column_overrides) entre le raccourci global ("?"), le
 * bouton dédié de la Navbar, et tout composant qui a besoin de résoudre le
 * combo actif d'un raccourci (ex. Employees.jsx pour la pagination).
 */
export function KeyboardShortcutsProvider({ children }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [overrides, setOverrides] = useState(loadOverrides);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const toggleHelp = useCallback(() => setHelpOpen((v) => !v), []);

  const setOverride = useCallback((id, combo) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: combo };
      persistOverrides(next);
      return next;
    });
  }, []);

  const resetOverride = useCallback((id) => {
    setOverrides((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      persistOverrides(next);
      return next;
    });
  }, []);

  const resetAllOverrides = useCallback(() => {
    setOverrides({});
    persistOverrides({});
  }, []);

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        helpOpen,
        openHelp,
        closeHelp,
        toggleHelp,
        overrides,
        setOverride,
        resetOverride,
        resetAllOverrides,
      }}
    >
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcutsHelp() {
  const ctx = useContext(KeyboardShortcutsContext);
  if (!ctx) {
    throw new Error("useKeyboardShortcutsHelp doit être utilisé sous KeyboardShortcutsProvider");
  }
  return ctx;
}

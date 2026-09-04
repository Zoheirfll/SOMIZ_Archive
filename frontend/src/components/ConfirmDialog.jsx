import { useCallback, useState } from "react";
import { useTheme } from "../context/ThemeContext";

/**
 * Remplace window.prompt() par une modale stylée avec un champ texte,
 * même usage (await prompt(message, defaultValue)) — renvoie null si
 * annulé, sinon la valeur saisie (trim).
 *
 * const { prompt, PromptDialog } = usePrompt();
 * ...
 * const newName = await prompt("Nouveau nom :", file.file_name);
 * if (newName === null) return;
 * ...
 * return <>{PromptDialog}...</>;
 */
export function usePrompt() {
  const theme = useTheme();
  const [state, setState] = useState(null); // { message, value, resolve }

  const prompt = useCallback((message, defaultValue = "") => {
    return new Promise((resolve) => {
      setState({ message, value: defaultValue, resolve });
    });
  }, []);

  const settle = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const PromptDialog = state ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={() => settle(null)}
    >
      <div
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 28,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            color: theme.text,
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {state.message}
        </div>
        <input
          autoFocus
          value={state.value}
          onChange={(e) => setState({ ...state, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") settle(state.value.trim());
            if (e.key === "Escape") settle(null);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 14,
            fontFamily: "inherit",
            marginBottom: 24,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => settle(null)}
            style={{
              background: theme.surface,
              border: `1.5px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: 10,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => settle(state.value.trim())}
            style={{
              background: theme.primary,
              border: "none",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 24px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Renommer
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { prompt, PromptDialog };
}

/**
 * Remplace window.confirm() par une modale stylée cohérente avec le design
 * system, tout en gardant un usage similaire (await confirm(message)).
 *
 * const { confirm, ConfirmDialog } = useConfirm();
 * ...
 * if (!(await confirm("Supprimer ?"))) return;
 * ...
 * return <>{ConfirmDialog}...</>;
 */
export function useConfirm() {
  const theme = useTheme();
  const [state, setState] = useState(null); // { message, danger, resolve }

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({ message, danger: options.danger !== false, resolve });
    });
  }, []);

  const settle = (result) => {
    state?.resolve(result);
    setState(null);
  };

  const ConfirmDialog = state ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        backdropFilter: "blur(2px)",
      }}
      onClick={() => settle(false)}
    >
      <div
        style={{
          background: theme.surface,
          borderRadius: 16,
          padding: 28,
          width: 420,
          maxWidth: "90vw",
          boxShadow: "0 16px 48px rgba(15,23,42,0.25)",
          border: `1px solid ${theme.border}`,
          fontFamily: theme.fontFamily,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            color: theme.text,
            fontSize: 14,
            fontWeight: 600,
            lineHeight: 1.5,
            marginBottom: 24,
            whiteSpace: "pre-line",
          }}
        >
          {state.message}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => settle(false)}
            style={{
              background: theme.surface,
              border: `1.5px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: 10,
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => settle(true)}
            style={{
              background: state.danger ? theme.danger : theme.primary,
              border: "none",
              color: "#fff",
              borderRadius: 10,
              padding: "9px 24px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}

import { useEffect, useState, useCallback } from "react";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { useConfirm } from "./ConfirmDialog";

export default function OcrSuggestionsPanel({ employeeId }) {
  const theme = useTheme();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  const fetchSuggestions = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const response = await api.get(`/ocr/employees/${employeeId}/suggestions/`);
        setSuggestions(Array.isArray(response?.data) ? response.data : []);
      } catch {
        setSuggestions([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [employeeId]
  );

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleAction = async (suggestion, action) => {
    if (action === "appliquer") {
      const ok = await confirm(
        `Appliquer la valeur détectée (${suggestion.valeur}) au champ ${suggestion.champ_code} ?`,
        { danger: false }
      );
      if (!ok) return;
    }
    setError("");
    try {
      await api.post(
        `/ocr/suggestions/${suggestion.ocr_result_id}/${suggestion.field_index}/${action}/`
      );
    } catch (err) {
      if (err?.response?.status === 404) {
        // Le document/fichier source a été supprimé entre-temps (hard
        // delete, voir CLAUDE.md section "Documents employés — suppression
        // définitive") — la suggestion affichée est obsolète, pas une
        // vraie erreur à remonter à l'utilisateur.
        setError("Ce document a été supprimé — la suggestion n'est plus disponible.");
      } else {
        setError("Une erreur est survenue, réessayez.");
      }
    }
    fetchSuggestions(true);
  };

  if (loading) {
    return (
      <div style={{ padding: 16, color: theme.textSecondary, fontSize: 13 }}>
        Chargement des suggestions OCR...
      </div>
    );
  }

  if (suggestions.length === 0 && !error) {
    return null;
  }

  return (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        boxShadow: theme.shadowMd,
        padding: 20,
        marginTop: 24,
        background: theme.surface,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: theme.textSecondary,
          fontWeight: 700,
          marginBottom: 12,
        }}
      >
        Suggestions OCR
      </div>
      {error && (
        <div style={{ color: theme.danger, fontSize: 12, marginBottom: 10 }}>
          {error}
        </div>
      )}
      {suggestions.map((s) => (
        <div
          key={`${s.ocr_result_id}-${s.field_index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderBottom: `1px solid ${theme.border}`,
            gap: 12,
          }}
        >
          <div style={{ color: theme.text, fontSize: 13 }}>
            <strong>{s.champ_code}</strong> : {s.valeur}{" "}
            <span style={{ fontSize: 11, color: theme.textSecondary }}>
              ({Math.round(s.confiance)}%)
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => handleAction(s, "appliquer")}
              style={{
                background: theme.primary,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Appliquer
            </button>
            <button
              onClick={() => handleAction(s, "ignorer")}
              style={{
                background: theme.surface,
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ignorer
            </button>
          </div>
        </div>
      ))}
      {ConfirmDialog}
    </div>
  );
}

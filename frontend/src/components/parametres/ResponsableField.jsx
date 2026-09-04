import { useState, useEffect } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { getInputStyle, getLabelStyle } from "./formStyles";

// Sélection d'un employé responsable — recherche serveur par nom/matricule
// (même pattern que la recherche de grant ponctuel dans Users.jsx), pas un
// <select> listant potentiellement des milliers d'employés.
const ResponsableField = ({ label, value, currentLabel, onChange }) => {
  const theme = useTheme();
  const inputStyle = getInputStyle(theme);
  const labelStyle = getLabelStyle(theme);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      api
        .get(`/employees/search/?q=${encodeURIComponent(query.trim())}`)
        .then((res) => setResults(res.data || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <>
      <label style={labelStyle}>{label}</label>
      {value ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            border: `1px solid ${theme.primaryBorder}`,
            borderRadius: 8,
            padding: "9px 14px",
            marginBottom: 12,
            fontSize: 13,
            color: theme.text,
            background: theme.bg,
          }}
        >
          <span>{currentLabel || "Employé sélectionné"}</span>
          <button
            type="button"
            onClick={() => onChange(null, null)}
            style={{
              background: "none",
              border: "none",
              color: theme.danger,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Retirer
          </button>
        </div>
      ) : (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un employé (nom, prénom, matricule)…"
            className="input-focus"
            style={{ ...inputStyle, marginBottom: 0 }}
          />
          {query.trim().length >= 2 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 10,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                marginTop: 4,
                maxHeight: 180,
                overflowY: "auto",
                boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
              }}
            >
              {loading ? (
                <div
                  style={{ padding: 10, fontSize: 12, color: theme.textMuted }}
                >
                  Recherche…
                </div>
              ) : results.length === 0 ? (
                <div
                  style={{ padding: 10, fontSize: 12, color: theme.textMuted }}
                >
                  Aucun résultat.
                </div>
              ) : (
                results.map((emp) => (
                  <div
                    key={emp.id}
                    onClick={() => {
                      onChange(emp.id, `${emp.prenom} ${emp.nom}`);
                      setQuery("");
                      setResults([]);
                    }}
                    style={{
                      padding: "8px 12px",
                      cursor: "pointer",
                      fontSize: 13,
                      borderBottom: `1px solid ${theme.borderLight}`,
                    }}
                  >
                    {emp.prenom} {emp.nom}{" "}
                    <span
                      style={{
                        color: theme.textMuted,
                        fontFamily: "monospace",
                        fontSize: 11,
                      }}
                    >
                      ({emp.matricule})
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ResponsableField;

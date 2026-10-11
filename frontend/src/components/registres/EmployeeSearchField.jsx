import { useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";

const LONGUEUR_MIN_RECHERCHE = 2;

// Autocomplétion d'employé (même endpoint que /consultations/nouvelle :
// /employees/search/, déjà borné au périmètre de l'utilisateur côté serveur).
// `value` = employé choisi ({ id, prenom, nom, matricule, poste_nom, … }) ou null.
export default function EmployeeSearchField({ id, label, value, onChange }) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  const rechercher = async (texte) => {
    setQuery(texte);
    if (texte.trim().length < LONGUEUR_MIN_RECHERCHE) { setSuggestions([]); return; }
    try {
      const res = await api.get("/employees/search/", { params: { q: texte } });
      setSuggestions(res.data || []);
    } catch {
      setSuggestions([]);
    }
  };

  const choisir = (employe) => {
    onChange(employe);
    setSuggestions([]);
    setQuery("");
  };

  const labelStyle = { display: "block", fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 4 };

  if (value) {
    return (
      <div>
        <span style={labelStyle}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: theme.text }}>
            <div style={{ fontWeight: 700 }}>{value.prenom} {value.nom}</div>
            <div style={{ fontSize: 12, color: theme.textSecondary }}>
              {[value.matricule, value.poste_nom, value.service_nom].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button
            type="button" onClick={() => onChange(null)}
            style={{ background: "none", border: "none", color: theme.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}
          >
            Changer l'employé
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input
        id={id} value={query} onChange={(e) => rechercher(e.target.value)}
        placeholder="Nom, prénom ou matricule…" autoComplete="off"
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg, color: theme.text, fontFamily: theme.fontFamily }}
      />
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Employés trouvés" style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: theme.shadowLg, maxHeight: 220, overflowY: "auto" }}>
          {suggestions.map((s) => (
            <button
              key={s.id} type="button" role="option" aria-selected="false" onClick={() => choisir(s)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "transparent", border: "none", borderBottom: `1px solid ${theme.borderLight}`, cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily }}
            >
              <span style={{ fontWeight: 600 }}>{s.prenom} {s.nom}</span>
              <span style={{ color: theme.textSecondary }}> — {s.matricule}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { TYPES_DEMANDE, slugDepuisReference } from "../utils/consultations";

export default function ConsultationNouvelle() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [type, setType] = useState("document");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async (value) => {
    setQuery(value);
    setEmployee(null);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    try {
      const res = await api.get("/employees/search/", { params: { q: value } });
      setSuggestions(res.data || []);
    } catch {
      setSuggestions([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Décrivez ce que vous souhaitez consulter."); return; }
    setSubmitting(true);
    try {
      const payload = { type_demande: type, description: description.trim() };
      if (employee) payload.employee = employee.id;
      const res = await api.post("/consultations/demandes/", payload);
      navigate(`/consultations/${slugDepuisReference(res.data.reference)}`);
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail || data?.error || data?.employee?.[0] || data?.description?.[0] ||
        data?.type_demande?.[0] || data?.non_field_errors?.[0] || "Impossible de créer la demande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const champ = {
    width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    marginTop: 4, marginBottom: 14, fontSize: 14, background: theme.bg, color: theme.text,
    fontFamily: theme.fontFamily, boxSizing: "border-box",
  };
  const etiquette = { fontSize: 12, fontWeight: 700, color: theme.text };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link to="/consultations" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
          <h1 style={{ color: "#fff", fontSize: 24, margin: "8px 0 0", fontWeight: 800 }}>Nouvelle demande de consultation</h1>
        </div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 560, margin: "0 auto" }}>
        <form onSubmit={handleSubmit} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd, padding: 24 }}>
          <label htmlFor="type-demande" style={etiquette}>Type de demande</label>
          <select id="type-demande" value={type} onChange={(e) => setType(e.target.value)} style={champ}>
            {TYPES_DEMANDE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <label htmlFor="description" style={etiquette}>Que souhaitez-vous consulter ?</label>
          <textarea
            id="description" rows={4} value={description} maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. : le contrat de travail signé en 2019"
            style={{ ...champ, resize: "vertical" }}
          />

          <label htmlFor="employe-search" style={etiquette}>Employé concerné (optionnel)</label>
          <div style={{ position: "relative" }}>
            <input
              id="employe-search" autoComplete="off" value={employee ? `${employee.prenom} ${employee.nom}` : query}
              onChange={(e) => handleSearch(e.target.value)} placeholder="Nom, prénom ou matricule…"
              style={{ ...champ, marginBottom: 14, borderColor: employee ? theme.primaryBorder : theme.border, background: employee ? theme.primaryBg : theme.bg }}
            />
            {suggestions.length > 0 && !employee && (
              <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", marginTop: -10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: theme.shadowLg, maxHeight: 240, overflowY: "auto" }}>
                {suggestions.map((s) => (
                  <div
                    key={s.id} role="option" aria-selected="false" tabIndex={0}
                    onClick={() => { setEmployee(s); setSuggestions([]); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setEmployee(s); setSuggestions([]); } }}
                    style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, color: theme.text, borderBottom: `1px solid ${theme.borderLight}` }}
                  >
                    {s.prenom} {s.nom} <span style={{ color: theme.textSecondary }}>· {s.matricule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: 11, marginTop: -8, marginBottom: 14 }}>
            Seuls les employés de votre périmètre peuvent être sélectionnés.
          </div>

          {error && (
            <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button
            type="submit" disabled={submitting} className="btn-lift"
            style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 9, padding: "11px 22px", fontWeight: 700, fontSize: 13, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}

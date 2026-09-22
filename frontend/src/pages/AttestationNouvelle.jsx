import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";

export default function AttestationNouvelle() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [contrats, setContrats] = useState([]);
  const [contratId, setContratId] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const employeeId = location.state?.employeeId;
    if (!employeeId) return;
    api.get(`/employees/${employeeId}/`).then((res) => setEmployee(res.data));
  }, [location.state]);

  useEffect(() => {
    if (!employee) { setContrats([]); setContratId(""); return; }
    api.get(`/employees/${employee.id}/contrats/`).then((res) => {
      const results = res.data?.results || res.data || [];
      setContrats(results);
    });
  }, [employee]);

  const handleSearch = async (value) => {
    setQuery(value);
    setEmployee(null);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    const res = await api.get("/employees/search/", { params: { q: value } });
    setSuggestions(res.data || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employee) { setError("Sélectionnez un employé dans la liste."); return; }
    setSubmitting(true);
    try {
      const payload = { employee: employee.id, motif, commentaire };
      if (contratId) payload.contrat = contratId;
      const res = await api.post("/attestations/demandes/", payload);
      navigate(`/attestations/${res.data.id}`);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.motif?.[0] ||
        err.response?.data?.employee?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        "Impossible de créer la demande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>Nouvelle demande d'attestation</h1>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 600, margin: "0 auto" }}>
        <form onSubmit={handleSubmit}>
          <label htmlFor="employe-search" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Employé</label>
          <input
            id="employe-search"
            className="input-focus"
            value={employee ? `${employee.prenom} ${employee.nom}` : query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nom, prénom ou matricule..."
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 8 }}
          />
          {suggestions.length > 0 && !employee && (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, marginBottom: 12 }}>
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setEmployee(s); setSuggestions([]); }}
                  style={{ padding: 8, cursor: "pointer", borderBottom: `1px solid ${theme.borderLight}` }}
                >
                  {s.prenom} {s.nom} — {s.matricule}
                </div>
              ))}
            </div>
          )}

          {contrats.length > 1 && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Contrat concerné</label>
              <select
                value={contratId}
                onChange={(e) => setContratId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12 }}
              >
                <option value="">-- Sélectionner --</option>
                {contrats.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero_contrat}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="motif" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Motif</label>
          <input
            id="motif"
            className="input-focus"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. Dossier administratif, Banque..."
            required
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12 }}
          />

          <label htmlFor="commentaire" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Commentaire (optionnel)</label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 16 }}
          />

          {error && <div style={{ color: theme.danger, marginBottom: 12 }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-lift"
            style={{
              background: theme.primary, color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontWeight: 700, cursor: submitting ? "default" : "pointer",
            }}
          >
            Envoyer la demande
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import EmployeeAvatar from "../components/EmployeeAvatar";
import { formatDateFR } from "../utils/formatDate";

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
  const [motifs, setMotifs] = useState([]);
  const [motif, setMotif] = useState("");
  const [motifAutre, setMotifAutre] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const employeeId = location.state?.employeeId;
    if (!employeeId) return;
    api.get(`/employees/${employeeId}/`).then((res) => setEmployee(res.data));
  }, [location.state]);

  useEffect(() => {
    api.get("/ref/motifs-attestation/").then((res) => {
      const list = res.data.results || res.data;
      setMotifs(list.filter((m) => m.is_active));
    });
  }, []);

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
      const payload = { employee: employee.id, commentaire };
      if (motif === "__autre__") payload.motif_autre = motifAutre.trim();
      else payload.motif = motif;
      if (contratId) payload.contrat = contratId;
      const res = await api.post("/attestations/demandes/", payload);
      navigate(`/attestations/${res.data.reference.replace("/", "-")}`);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.motif?.[0] ||
        err.response?.data?.motif_autre?.[0] ||
        err.response?.data?.employee?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        "Impossible de créer la demande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link to="/attestations" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
          <h1 style={{ color: "#fff", fontSize: 24, margin: "8px 0 0", fontWeight: 800 }}>Nouvelle demande d'attestation</h1>
        </div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 560, margin: "0 auto" }}>
        <form onSubmit={handleSubmit} style={{
          background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowMd, padding: 24,
        }}>
          <label htmlFor="employe-search" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Employé</label>
          <div style={{ position: "relative" }}>
            <input
              id="employe-search"
              className="input-focus"
              value={employee ? `${employee.prenom} ${employee.nom}` : query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nom, prénom ou matricule..."
              autoComplete="off"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${employee ? theme.primaryBorder : theme.border}`, marginTop: 4, marginBottom: 8, background: employee ? theme.primaryBg : theme.bg, fontSize: 14 }}
            />
            {suggestions.length > 0 && !employee && (
              <div style={{
                position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%",
                background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8,
                boxShadow: theme.shadowLg, marginTop: -4,
                maxHeight: 280, overflowY: "auto",
              }}>
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => { setEmployee(s); setSuggestions([]); }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.primaryBg; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    style={{ padding: "9px 12px", cursor: "pointer", borderBottom: `1px solid ${theme.borderLight}`, fontSize: 13, transition: "background 0.1s" }}
                  >
                    <span style={{ fontWeight: 600, color: theme.text }}>{s.prenom} {s.nom}</span>
                    <span style={{ color: theme.textMuted }}> — {s.matricule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {employee && (
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 10, padding: "12px 14px", marginBottom: 16,
            }}>
              <EmployeeAvatar employee={employee} size={48} shape="square" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: theme.text, fontSize: 14, fontWeight: 700 }}>
                  {employee.prenom} {employee.nom}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                  {employee.matricule}
                  {employee.poste_nom && <> · {employee.poste_nom}</>}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                  {[employee.direction_nom, employee.departement_nom, employee.service_nom]
                    .filter(Boolean)
                    .join(" › ")}
                </div>
                {employee.date_embauche && (
                  <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}>
                    Recruté(e) le {formatDateFR(employee.date_embauche)}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setEmployee(null); setQuery(""); }}
                title="Changer d'employé"
                style={{
                  background: "none", border: "none", color: theme.textMuted,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
              >
                Changer
              </button>
            </div>
          )}

          {contrats.length > 1 && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Contrat concerné</label>
              <select
                value={contratId}
                onChange={(e) => setContratId(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12, fontSize: 14 }}
              >
                <option value="">-- Sélectionner --</option>
                {contrats.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero_contrat}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="motif" style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginTop: 4, display: "block" }}>Motif</label>
          <select
            id="motif"
            className="input-focus"
            value={motif}
            onChange={(e) => { setMotif(e.target.value); if (e.target.value !== "__autre__") setMotifAutre(""); }}
            required
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: motif === "__autre__" ? 8 : 12, fontSize: 14 }}
          >
            <option value="">-- Sélectionner --</option>
            {motifs.map((m) => (
              <option key={m.id} value={m.id}>{m.nom}</option>
            ))}
            <option value="__autre__">Autre...</option>
          </select>
          {motif === "__autre__" && (
            <input
              className="input-focus"
              value={motifAutre}
              onChange={(e) => setMotifAutre(e.target.value)}
              placeholder="Précisez le motif"
              required
              autoFocus
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12, fontSize: 14 }}
            />
          )}

          <label htmlFor="commentaire" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Commentaire (optionnel)</label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 16, fontSize: 14, resize: "vertical" }}
          />

          {error && (
            <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-lift"
            style={{
              background: theme.primary, color: "#fff", border: "none", borderRadius: 9,
              padding: "11px 22px", fontWeight: 700, fontSize: 13, cursor: submitting ? "default" : "pointer",
              opacity: submitting ? 0.7 : 1, width: isMobile ? "100%" : "auto",
            }}
          >
            {submitting ? "Envoi..." : "Envoyer la demande"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}

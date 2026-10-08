import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import EmployeeAvatar from "../components/EmployeeAvatar";
import { IMPORTANCES } from "../components/attestations/ImportanceBadge";
import DureeSelect from "../components/consultations/DureeSelect";
import { formatDateFR } from "../utils/formatDate";
import { TYPES_DEMANDE, slugDepuisReference } from "../utils/consultations";

export default function ConsultationNouvelle() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [type, setType] = useState("document");
  const [importance, setImportance] = useState("moyenne");
  const [description, setDescription] = useState("");
  // Souhaits du demandeur : le traiteur les accorde tels quels ou les modifie.
  const [duree, setDuree] = useState(24);
  const [telechargement, setTelechargement] = useState(false);
  const [impression, setImpression] = useState(false);
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
      const payload = {
        type_demande: type, description: description.trim(), importance,
        duree_souhaitee_heures: duree,
        telechargement_souhaite: telechargement,
        impression_souhaitee: impression,
      };
      if (employee) payload.employee = employee.id;
      const res = await api.post("/consultations/demandes/", payload);
      navigate(`/consultations/${slugDepuisReference(res.data.reference)}`);
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail || data?.error || data?.employee?.[0] || data?.description?.[0] ||
        data?.type_demande?.[0] || data?.importance?.[0] || data?.duree_souhaitee_heures?.[0] ||
        data?.non_field_errors?.[0] ||
        "Impossible de créer la demande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const select = {
    width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    marginTop: 4, marginBottom: 12, fontSize: 14, background: theme.bg, color: theme.text,
    fontFamily: theme.fontFamily, boxSizing: "border-box",
  };

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
        <form onSubmit={handleSubmit} style={{
          background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`,
          boxShadow: theme.shadowMd, padding: 24,
        }}>
          <label htmlFor="employe-search" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Employé concerné (optionnel)</label>
          <div style={{ position: "relative" }}>
            <input
              id="employe-search"
              className="input-focus"
              value={employee ? `${employee.prenom} ${employee.nom}` : query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nom, prénom ou matricule..."
              autoComplete="off"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${employee ? theme.primaryBorder : theme.border}`, marginTop: 4, marginBottom: 8, background: employee ? theme.primaryBg : theme.bg, color: theme.text, fontSize: 14, boxSizing: "border-box" }}
            />
            {suggestions.length > 0 && !employee && (
              <div style={{
                position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%",
                background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8,
                boxShadow: theme.shadowLg, marginTop: -4, maxHeight: 280, overflowY: "auto",
              }}>
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    role="option"
                    aria-selected="false"
                    tabIndex={0}
                    onClick={() => { setEmployee(s); setSuggestions([]); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setEmployee(s); setSuggestions([]); } }}
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
                style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                Changer
              </button>
            </div>
          )}

          <label htmlFor="type-demande" style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginTop: 4, display: "block" }}>Type de demande</label>
          <select id="type-demande" className="input-focus" value={type} onChange={(e) => setType(e.target.value)} style={select}>
            {TYPES_DEMANDE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <label htmlFor="importance" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Importance</label>
          <select id="importance" className="input-focus" value={importance} onChange={(e) => setImportance(e.target.value)} style={select}>
            {IMPORTANCES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>

          <div style={{
            border: `1px solid ${theme.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14,
            background: theme.bg,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 8 }}>
              Durée et usage souhaités
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: theme.textSecondary }}>Je souhaite consulter pendant</span>
              <DureeSelect value={duree} onChange={setDuree} ariaLabel="Durée souhaitée" />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer", marginBottom: 6 }}>
              <input type="checkbox" checked={telechargement} onChange={(e) => setTelechargement(e.target.checked)} />
              Pouvoir télécharger le document
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, cursor: "pointer" }}>
              <input type="checkbox" checked={impression} onChange={(e) => setImpression(e.target.checked)} />
              Pouvoir imprimer le document
            </label>
            <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 8 }}>
              Ce sont des souhaits : la personne qui traite votre demande peut les accorder ou les modifier.
            </div>
          </div>

          <label htmlFor="description" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Que souhaitez-vous consulter ?</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ex. : le contrat de travail signé en 2019"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 16, fontSize: 14, resize: "vertical", background: theme.bg, color: theme.text, fontFamily: theme.fontFamily, boxSizing: "border-box" }}
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

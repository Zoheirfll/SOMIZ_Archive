import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import { formatDateFR } from "../utils/formatDate";
import { TYPES_DEMANDE, slugDepuisReference, tempsRestant } from "../utils/consultations";

const STATUTS = [
  { value: "", label: "Tous les statuts" },
  { value: "en_cours", label: "En cours de validation" },
  { value: "validee", label: "Validée" },
  { value: "expiree", label: "Expirée" },
  { value: "rejetee", label: "Rejetée" },
  { value: "revoquee", label: "Révoquée" },
];

export default function Consultations() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const estTraiteur = !!user?.can_manage_consultations;
  const peutDemander = ["GESTIONNAIRE", "CONSULTANT"].includes(user?.role);
  const [demandes, setDemandes] = useState([]);
  const [statut, setStatut] = useState("");
  const [type, setType] = useState("");
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const charger = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statut) params.statut = statut;
      if (type) params.type_demande = type;
      if (recherche) params.q = recherche;
      const res = await api.get("/consultations/demandes/", { params });
      setDemandes(res.data.results || res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger les demandes.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statut, type, recherche]);

  useEffect(() => { charger(); }, [charger]);

  const champ = {
    padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.surface, color: theme.text, fontSize: 13, fontFamily: theme.fontFamily,
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Consultations d'archives</h1>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 }}>
              {estTraiteur ? "Demandes à traiter et consultations en cours" : "Suivi de vos demandes de consultation"}
            </div>
          </div>
          {peutDemander && (
            <Link
              to="/consultations/nouvelle"
              style={{ background: theme.surface, color: theme.primary, borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              + Nouvelle demande
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1000, margin: "0 auto" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); setRecherche(saisie.trim()); }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
        >
          <input
            aria-label="Rechercher"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Référence, description…"
            style={{ ...champ, flex: "1 1 200px" }}
          />
          <select aria-label="Statut" value={statut} onChange={(e) => setStatut(e.target.value)} style={champ}>
            {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} style={champ}>
            <option value="">Tous les types</option>
            {TYPES_DEMANDE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </form>

        {error && (
          <div style={{ color: theme.danger, background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}
        {loading && <div style={{ color: theme.textSecondary, fontSize: 13 }}>Chargement…</div>}
        {!loading && !error && demandes.length === 0 && (
          <div style={{ color: theme.textSecondary, fontSize: 13 }}>Aucune demande.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {demandes.map((d) => (
            <Link
              key={d.id}
              to={`/consultations/${slugDepuisReference(d.reference)}`}
              style={{
                display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center",
                gap: 12, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12,
                padding: "14px 18px", textDecoration: "none", color: theme.text, boxShadow: theme.shadow,
              }}
            >
              <div style={{ minWidth: 110 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: theme.primary }}>{d.reference}</div>
                <div style={{ fontSize: 11, color: theme.textSecondary }}>{formatDateFR(d.created_at)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textSecondary }}>
                  {d.type_demande_label}
                </div>
                <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.description}
                </div>
                {estTraiteur && (
                  <div style={{ fontSize: 12, color: theme.textSecondary }}>Demandeur : {d.demandeur_nom}</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end", gap: 4 }}>
                <StatutConsultationBadge statut={d.statut_effectif} />
                {d.statut_effectif === "validee" && (
                  <span style={{ fontSize: 11, color: theme.textSecondary }}>
                    Expire dans {tempsRestant(d.date_echeance)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageBackground>
  );
}

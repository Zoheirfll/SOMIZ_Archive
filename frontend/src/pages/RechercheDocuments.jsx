import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import useIsMobile from "../hooks/useIsMobile";

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

// Met en évidence la portion du snippet correspondant à la recherche —
// purement cosmétique, la recherche elle-même est faite côté serveur.
function highlight(snippet, query, theme) {
  if (!query) return snippet;
  const idx = snippet.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark style={{ background: theme.primaryBg, color: theme.primary, fontWeight: 700, padding: "0 2px", borderRadius: 3 }}>
        {snippet.slice(idx, idx + query.length)}
      </mark>
      {snippet.slice(idx + query.length)}
    </>
  );
}

export default function RechercheDocuments() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError("Tapez au moins 2 caractères.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await api.get("/ocr/search/", { params: { q } });
      setResults(response.data.results);
      setTotal(response.data.total);
      setTruncated(response.data.truncated);
      setLastQuery(q);
      setSearched(true);
    } catch (err) {
      setError("La recherche a échoué, réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />

      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: isMobile ? "20px 16px 24px" : "32px 32px 36px", position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
            Recherche documentaire
          </h1>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
            Recherche plein texte dans le contenu OCR de tous les documents — retrouve une
            personne même si elle n'est mentionnée que dans le document d'un tiers (ex. un
            conjoint ou un enfant cité dans un acte de naissance).
          </div>
        </div>
      </div>

      <div className="anim-fade-in" style={{ padding: isMobile ? "16px" : "32px", maxWidth: 1000, margin: "0 auto" }}>
        <form
          onSubmit={handleSearch}
          style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: "16px 20px",
            marginBottom: 20,
            display: "flex",
            gap: 12,
            boxShadow: theme.shadowMd,
          }}
        >
          <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 12, color: theme.textMuted, pointerEvents: "none", display: "flex" }}>
              <IconSearch />
            </span>
            <input
              autoFocus
              className="input-focus"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nom, prénom, numéro, mot-clé..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "9px 14px 9px 36px",
                color: theme.text,
                fontSize: 13,
                outline: "none",
                background: theme.bg,
                fontFamily: theme.fontFamily,
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              background: theme.primary,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "0 22px",
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Recherche..." : "Rechercher"}
          </button>
        </form>

        {error && (
          <div style={{ color: theme.danger, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {searched && !error && (
          <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 12 }}>
            {total === 0
              ? "Aucun résultat."
              : `${total} document${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}${truncated ? " (affichage limité aux 100 premiers)" : ""}.`}
          </div>
        )}

        {results.map((r) => (
          <div
            key={r.file_id}
            onClick={() => navigate(`/employees/${r.employee_matricule}?tab=dossier`)}
            className="card-lift"
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: "14px 18px",
              marginBottom: 10,
              cursor: "pointer",
              boxShadow: theme.shadowMd,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontWeight: 700, color: theme.text, fontSize: 14 }}>
                {r.employee_prenom} {r.employee_nom}{" "}
                <span style={{ color: theme.textSecondary, fontWeight: 400, fontSize: 12 }}>
                  ({r.employee_matricule})
                </span>
              </div>
              <div style={{ fontSize: 12, color: theme.primary, fontWeight: 600 }}>
                {r.type_doc_nom} — {r.file_name}
              </div>
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
              {highlight(r.snippet, lastQuery, theme)}
            </div>
          </div>
        ))}
      </div>
    </PageBackground>
  );
}

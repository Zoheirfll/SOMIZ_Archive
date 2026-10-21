import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import CongeStatutBadge from "../components/conges/CongeStatutBadge";
import ImportanceBadge from "../components/attestations/ImportanceBadge";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { ClipboardIcon, FileTextIcon } from "../components/icons";
import StatDonutChart from "../components/charts/StatDonutChart";
import StatAreaChart from "../components/charts/StatAreaChart";
import { canRequestConges } from "../config/accesSections";
import { formatDateFR } from "../utils/formatDate";
import { refVersUrl } from "../utils/conges";

// Mêmes préréglages de période que /statistiques et /attestations.
const presetToRange = (preset) => {
  const fin = new Date();
  const debut = new Date();
  if (preset === "30j") debut.setDate(fin.getDate() - 30);
  else if (preset === "3m") debut.setMonth(fin.getMonth() - 3);
  else if (preset === "12m") debut.setFullYear(fin.getFullYear() - 1);
  else if (preset === "annee") { debut.setMonth(0); debut.setDate(1); }
  else if (preset === "tout") return null;
  const toIso = (d) => d.toISOString().slice(0, 10);
  return { date_debut: toIso(debut), date_fin: toIso(fin) };
};

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "recue", label: "Reçue" },
  { value: "prete", label: "Prête" },
  { value: "recuperee", label: "Récupérée" },
  { value: "rejetee", label: "Rejetée" },
  { value: "annulee", label: "Annulée" },
  { value: "interrompue", label: "Interrompue" },
];

const SectionHeader = ({ children, theme }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <div style={{ width: 4, height: 16, borderRadius: 2, background: theme.primary }} />
    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textSecondary }}>
      {children}
    </span>
  </div>
);

export default function Conges() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  // SUPERADMIN, ou ADMIN portant charge_conge (User.can_manage_conges).
  const isTraiteur = !!user?.can_manage_conges;
  const [demandes, setDemandes] = useState([]);
  const [statutFiltre, setStatutFiltre] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sousOnglet, setSousOnglet] = useState("liste");
  const [stats, setStats] = useState(null);
  const [statsFilters, setStatsFilters] = useState({ preset: "12m", dateDebut: "", dateFin: "" });

  const fetchDemandes = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statutFiltre) params.statut = statutFiltre;
      if (search) params.q = search;
      const res = await api.get("/conges/demandes/", { params });
      setDemandes(res.data?.results || res.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemandes(); }, [statutFiltre, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = (range) => {
    api.get("/conges/stats/", { params: range || {} }).then((res) => setStats(res.data));
  };

  useEffect(() => {
    if (sousOnglet === "stats" && isTraiteur && !stats) fetchStats(presetToRange(statsFilters.preset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sousOnglet, isTraiteur, stats]);

  const handleStatsPresetClick = (preset) => {
    setStatsFilters({ preset, dateDebut: "", dateFin: "" });
    fetchStats(presetToRange(preset));
  };

  const handleStatsDateChange = (field, value) => {
    const next = { ...statsFilters, preset: null, [field]: value };
    setStatsFilters(next);
    if (next.dateDebut && next.dateFin) fetchStats({ date_debut: next.dateDebut, date_fin: next.dateFin });
  };

  const cardStyle = {
    background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd,
  };

  if (loading) return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>Chargement...</div>
    </PageBackground>
  );

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              Dossier RH
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Demandes de congé</h1>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "6px 0 0" }}>
              {isTraiteur ? "Suivi et traitement des demandes, titres de congé et soldes" : "Vos demandes en cours et leur avancement"}
            </p>
          </div>
          {canRequestConges(user) && (
            <Link to="/conges/nouvelle" className="btn-lift" style={{
              display: "flex", alignItems: "center", gap: 8, background: "#fff", color: theme.primary,
              borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none",
              boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nouvelle demande
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        {isTraiteur && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: theme.bg, borderRadius: 10, padding: 4, width: "fit-content" }}>
            {[{ key: "liste", label: "Liste" }, { key: "stats", label: "Statistiques" }].map((t) => (
              <button
                key={t.key}
                onClick={() => setSousOnglet(t.key)}
                style={{
                  padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, transition: "all 0.15s",
                  background: sousOnglet === t.key ? theme.surface : "transparent",
                  color: sousOnglet === t.key ? theme.primary : theme.textSecondary,
                  boxShadow: sousOnglet === t.key ? theme.shadow : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {sousOnglet === "stats" && isTraiteur ? (
          <div>
            <div style={{ ...cardStyle, padding: "10px 12px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {[
                { key: "30j", label: "30 jours" }, { key: "3m", label: "3 mois" }, { key: "12m", label: "12 mois" },
                { key: "annee", label: "Année en cours" }, { key: "tout", label: "Tout" },
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => handleStatsPresetClick(p.key)}
                  style={{
                    background: statsFilters.preset === p.key ? theme.primaryBg : "transparent",
                    border: `1px solid ${statsFilters.preset === p.key ? theme.primaryBorder : theme.border}`,
                    color: statsFilters.preset === p.key ? theme.primary : theme.textSecondary,
                    borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: theme.fontFamily,
                  }}
                >
                  {p.label}
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: isMobile ? 0 : "auto" }}>
                <label htmlFor="cg-stats-debut" style={{ fontSize: 12, color: theme.textSecondary }}>Date début</label>
                <input id="cg-stats-debut" type="date" value={statsFilters.dateDebut}
                  onChange={(e) => handleStatsDateChange("dateDebut", e.target.value)}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }} />
                <label htmlFor="cg-stats-fin" style={{ fontSize: 12, color: theme.textSecondary }}>Date fin</label>
                <input id="cg-stats-fin" type="date" value={statsFilters.dateFin}
                  onChange={(e) => handleStatsDateChange("dateFin", e.target.value)}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }} />
              </div>
            </div>

            {!stats ? (
              <div style={{ ...cardStyle, padding: 40, textAlign: "center", color: theme.textSecondary }}>Chargement...</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Total demandes</div>
                    <div style={{ color: theme.text, fontSize: 26, fontWeight: 800, marginTop: 4 }}>{stats.total ?? 0}</div>
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>En attente (reçues)</div>
                    <div style={{ color: theme.text, fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                      {stats.par_statut?.find((s) => s.id === "recue")?.count ?? 0}
                    </div>
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Délai moyen de traitement</div>
                    <div style={{ color: theme.primary, fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                      {stats.delai_moyen_jours != null ? `${stats.delai_moyen_jours} j` : "—"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par statut</SectionHeader>
                    <StatDonutChart data={stats.par_statut} height={200} />
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par gestionnaire</SectionHeader>
                    <StatDonutChart data={stats.par_gestionnaire} height={200} />
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par employé</SectionHeader>
                    <StatDonutChart data={stats.par_employe} height={200} />
                  </div>
                </div>
                <div style={{ ...cardStyle, padding: 24 }}>
                  <SectionHeader theme={theme}>Évolution mensuelle — reçues vs récupérées</SectionHeader>
                  <StatAreaChart
                    data={stats.evolution_mensuelle}
                    xKey="mois"
                    series={[
                      { key: "recues", label: "Reçues", color: theme.primary },
                      { key: "recuperees", label: "Récupérées", color: theme.departementColor },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {isTraiteur && (
              <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }} style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <input
                  type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Rechercher par référence, employé, demandeur..."
                  aria-label="Rechercher une demande"
                  className="input-focus"
                  style={{
                    flex: 1, minWidth: 220, boxSizing: "border-box", border: `1.5px solid ${theme.border}`,
                    borderRadius: 10, padding: "10px 14px", color: theme.text, fontSize: 14, outline: "none",
                    background: theme.bg, fontFamily: theme.fontFamily,
                  }}
                />
                <button type="submit" className="btn-lift" style={{
                  background: theme.primary, border: "none", borderRadius: 10, padding: "10px 20px",
                  color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: theme.fontFamily,
                }}>
                  Rechercher
                </button>
                {search && (
                  <button type="button" onClick={() => { setSearchInput(""); setSearch(""); }} style={{
                    border: `1.5px solid ${theme.border}`, borderRadius: 10, padding: "10px 16px",
                    color: theme.textSecondary, fontSize: 13, fontWeight: 600, background: theme.surface,
                    cursor: "pointer", fontFamily: theme.fontFamily,
                  }}>
                    Effacer
                  </button>
                )}
              </form>
            )}

            {isTraiteur && (
              <div style={{ ...cardStyle, padding: "10px 12px", marginBottom: 20, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textMuted, padding: "0 4px 0 2px" }}>
                  Statut
                </span>
                {STATUTS.map((s) => {
                  const actif = statutFiltre === s.value;
                  return (
                    <button
                      key={s.value || "tous"}
                      onClick={() => setStatutFiltre(s.value)}
                      style={{
                        padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "none",
                        background: actif ? theme.primary : "transparent",
                        color: actif ? "#fff" : theme.textSecondary, cursor: "pointer",
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {demandes.length === 0 ? (
              <div style={{ ...cardStyle, padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ color: theme.textMuted, marginBottom: 14 }}><ClipboardIcon size={40} /></div>
                <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  Aucune demande {search ? "pour cette recherche" : statutFiltre ? "pour ce statut" : ""}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 340 }}>
                  {search
                    ? "Essayez un autre nom, matricule ou référence."
                    : isTraiteur
                      ? "Les demandes envoyées par les gestionnaires apparaîtront ici."
                      : "Créez une nouvelle demande de congé pour un employé de votre périmètre."}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {demandes.map((d) => (
                  <Link
                    key={d.id}
                    to={`/conges/${refVersUrl(d.reference)}`}
                    className="card-lift"
                    style={{
                      ...cardStyle, padding: "14px 18px", textDecoration: "none",
                      display: "flex", alignItems: "center", gap: 14, flexWrap: isMobile ? "wrap" : "nowrap",
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, background: theme.primaryBg, color: theme.primary,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <FileTextIcon size={17} />
                    </div>
                    <div style={{ flex: isMobile ? "1 1 100%" : "0 0 110px", fontWeight: 700, color: theme.primary, fontSize: 13 }}>
                      {d.reference}
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>{d.employee_nom}</div>
                      <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>Demandé par {d.demandeur_nom}</div>
                    </div>
                    <div style={{ color: theme.textSecondary, fontSize: 12, minWidth: 170 }}>
                      {formatDateFR(d.date_depart)} → {formatDateFR(d.date_retour)} · {d.nb_jours} j
                    </div>
                    <ImportanceBadge importance={d.importance} />
                    <CongeStatutBadge statut={d.statut} />
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageBackground>
  );
}

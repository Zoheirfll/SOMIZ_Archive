import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import ImportanceBadge from "../components/attestations/ImportanceBadge";
import FiltresPeriode from "../components/demandes/FiltresPeriode";
import TableDemandes from "../components/demandes/TableDemandes";
import { dateCourte, heureRecue } from "../utils/listeDemandes";
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import { ClipboardIcon } from "../components/icons";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import StatDonutChart from "../components/charts/StatDonutChart";
import StatAreaChart from "../components/charts/StatAreaChart";
import { slugDepuisReference, tempsRestant } from "../utils/consultations";
import { canRequestConsultations } from "../config/accesSections";

// Mêmes préréglages de période que /attestations et /statistiques.
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
  { value: "en_cours", label: "En cours" },
  { value: "validee", label: "Validée" },
  { value: "expiree", label: "Expirée" },
  { value: "rejetee", label: "Rejetée" },
  { value: "revoquee", label: "Révoquée" },
];

// Même code couleur que StatutConsultationBadge.
const STATUT_DOT_COLORS = {
  en_cours: (theme) => theme.accent,
  validee: (theme) => theme.primary,
  expiree: (theme) => theme.textMuted,
  rejetee: (theme) => theme.danger,
  revoquee: (theme) => theme.danger,
};

const OPTIONS_TRI = [
  { value: "-created_at", label: "Date de demande (récentes d'abord)" },
  { value: "created_at", label: "Date de demande (anciennes d'abord)" },
  { value: "-date_validation", label: "Date de validation (récentes d'abord)" },
  { value: "date_echeance", label: "Échéance la plus proche" },
  { value: "employee", label: "Employé (A → Z)" },
  { value: "type_demande", label: "Type (A → Z)" },
  { value: "importance", label: "Importance" },
  { value: "statut", label: "Statut" },
];

const SectionHeader = ({ children, theme }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <div style={{ width: 4, height: 16, borderRadius: 2, background: theme.primary }} />
    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textSecondary }}>
      {children}
    </span>
  </div>
);

export default function Consultations() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  // SUPERADMIN toujours, ADMIN seulement si chargé des consultations.
  const isAdmin = !!user?.can_manage_consultations;
  // Le SUPERADMIN peut aussi demander (comme pour les attestations).
  const peutDemander = canRequestConsultations(user);
  const [demandes, setDemandes] = useState([]);
  const maintenant = new Date();
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1); // null = toute l'année
  const [statutFiltre, setStatutFiltre] = useState("");
  const [importance, setImportance] = useState("");
  const [tri, setTri] = useState("-created_at");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sousOnglet, setSousOnglet] = useState("liste");
  const [stats, setStats] = useState(null);
  const [statsFilters, setStatsFilters] = useState({ preset: "12m", dateDebut: "", dateFin: "" });
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  const fetchDemandes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = { annee, tri };
      if (mois) params.mois = mois;
      if (importance) params.importance = importance;
      if (statutFiltre) params.statut = statutFiltre;
      if (search) params.q = search;
      const res = await api.get("/consultations/demandes/", { params });
      setDemandes(res.data?.results || res.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger les demandes.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statutFiltre, search, annee, mois, importance, tri]);

  useEffect(() => { fetchDemandes(); }, [fetchDemandes]);

  // La sélection perd son sens si la liste change sous ses pieds (filtre,
  // recherche, refresh après action) : on repart de zéro plutôt que de garder
  // des ids qui ne correspondent plus aux lignes affichées.
  useEffect(() => { setSelected(new Set()); }, [demandes]);

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedDemandes = demandes.filter((d) => selected.has(d.id));
  const canBulkRejeter = selectedDemandes.length > 0 && selectedDemandes.every((d) => d.statut === "en_cours");
  const canBulkRevoquer = selectedDemandes.length > 0 && selectedDemandes.every((d) => d.statut_effectif === "validee");

  const lancerGroupe = async (action, corps) => {
    setBulkLoading(true);
    setBulkMessage("");
    try {
      const res = await api.post("/consultations/demandes/bulk/", {
        ids: selectedDemandes.map((d) => d.id), action, ...corps,
      });
      if (res.data?.errors?.length) {
        setBulkMessage(res.data.errors.map((e) => `${e.reference} : ${e.error}`).join(" — "));
      }
      setSelected(new Set());
      await fetchDemandes(true);
    } catch (err) {
      setBulkMessage(err.response?.data?.error || "Action groupée impossible.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkRejeter = async () => {
    const motif = await prompt(`Motif du rejet de ${selectedDemandes.length} demande(s) :`, "");
    if (motif === null) return;
    if (!motif.trim()) { setBulkMessage("Le motif du rejet est obligatoire."); return; }
    await lancerGroupe("rejeter", { motif_rejet: motif.trim() });
  };

  const handleBulkRevoquer = async () => {
    if (!(await confirm(
      `Révoquer ${selectedDemandes.length} consultation(s) ? L'accès des demandeurs sera coupé immédiatement.`,
    ))) return;
    await lancerGroupe("revoquer", {});
  };

  const fetchStats = (range) => {
    api.get("/consultations/stats/", { params: range || {} }).then((res) => setStats(res.data));
  };

  useEffect(() => {
    if (sousOnglet === "stats" && isAdmin && !stats) fetchStats(presetToRange(statsFilters.preset));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sousOnglet, isAdmin, stats]);

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

  const filtresActifs = !!(importance || statutFiltre || search);
  const reinitialiser = () => { setImportance(""); setStatutFiltre(""); setSearchInput(""); setSearch(""); };
  const dateEtape = (iso) => (
    <span style={{ fontSize: 12, color: iso ? theme.textSecondary : theme.textMuted }}>{dateCourte(iso)}</span>
  );
  const colonnes = [
    {
      label: "Référence", cle: "created_at", width: "84px",
      cell: (d) => (
        <div>
          <div style={{ fontWeight: 700, color: theme.primary, fontSize: 13 }}>{d.reference}</div>
          <div style={{ fontSize: 11, color: theme.textMuted }}>{heureRecue(d.created_at)}</div>
        </div>
      ),
    },
    {
      label: "Objet", cle: "employee", width: "minmax(160px, 1.5fr)",
      cell: (d) => (
        <div>
          <div style={{ color: theme.text, fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" }}>{d.employee_nom || d.description}</div>
          <div style={{ color: theme.textMuted, fontSize: 12 }}>Demandé par {d.demandeur_nom}</div>
        </div>
      ),
    },
    { label: "Type", cle: "type_demande", width: "minmax(100px, 1fr)", cell: (d) => <span style={{ color: theme.textSecondary, fontSize: 13 }}>{d.type_demande_label}</span> },
    { label: "Reçue", cle: "created_at", width: "66px", cell: (d) => dateEtape(d.created_at) },
    { label: "Validée", cle: "date_validation", width: "66px", cell: (d) => dateEtape(d.date_validation) },
    {
      label: "Échéance", cle: "date_echeance", width: "92px",
      cell: (d) => (
        <div>
          {dateEtape(d.date_echeance)}
          {d.statut_effectif === "validee" && (
            <div style={{ fontSize: 11, color: theme.textMuted }}>dans {tempsRestant(d.date_echeance)}</div>
          )}
        </div>
      ),
    },
    { label: "Importance", cle: "importance", width: "84px", cell: (d) => <ImportanceBadge importance={d.importance} /> },
    { label: "Statut", cle: "statut", width: "118px", cell: (d) => <StatutConsultationBadge statut={d.statut_effectif} /> },
  ];

  if (loading) return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>Chargement...</div>
    </PageBackground>
  );

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              Dossier RH
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Demandes de consultation d'archives</h1>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "6px 0 0" }}>
              {isAdmin ? "Suivi et traitement des demandes de consultation" : "Vos demandes en cours et leur avancement"}
            </p>
          </div>
          {peutDemander && (
            <Link to="/consultations/nouvelle" className="btn-lift" style={{
              display: "flex", alignItems: "center", gap: 8, background: theme.surface, color: theme.primary,
              borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 13, textDecoration: "none",
              boxShadow: theme.shadowMd,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nouvelle demande
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        {isAdmin && (
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

        {error && (
          <div style={{ color: theme.danger, background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {sousOnglet === "stats" && isAdmin ? (
          <div>
            <div style={{ ...cardStyle, padding: "10px 12px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              {[
                { key: "30j", label: "30 jours" },
                { key: "3m", label: "3 mois" },
                { key: "12m", label: "12 mois" },
                { key: "annee", label: "Année en cours" },
                { key: "tout", label: "Tout" },
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
                <label htmlFor="cons-stats-debut" style={{ fontSize: 12, color: theme.textSecondary }}>Date début</label>
                <input
                  id="cons-stats-debut" type="date" value={statsFilters.dateDebut}
                  onChange={(e) => handleStatsDateChange("dateDebut", e.target.value)}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
                />
                <label htmlFor="cons-stats-fin" style={{ fontSize: 12, color: theme.textSecondary }}>Date fin</label>
                <input
                  id="cons-stats-fin" type="date" value={statsFilters.dateFin}
                  onChange={(e) => handleStatsDateChange("dateFin", e.target.value)}
                  style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
                />
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
                    <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>En attente de validation</div>
                    <div style={{ color: theme.text, fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                      {stats.par_statut?.find((s) => s.id === "en_cours")?.count ?? 0}
                    </div>
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>Délai moyen de validation</div>
                    <div style={{ color: theme.primary, fontSize: 26, fontWeight: 800, marginTop: 4 }}>
                      {stats.delai_moyen_heures != null ? `${stats.delai_moyen_heures} h` : "—"}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par statut</SectionHeader>
                    <StatDonutChart data={stats.par_statut} height={200} />
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par demandeur</SectionHeader>
                    <StatDonutChart data={stats.par_demandeur} height={200} />
                  </div>
                  <div style={{ ...cardStyle, padding: 20 }}>
                    <SectionHeader theme={theme}>Par employé</SectionHeader>
                    <StatDonutChart data={stats.par_employe} height={200} />
                  </div>
                </div>

                <div style={{ ...cardStyle, padding: 24 }}>
                  <SectionHeader theme={theme}>Évolution mensuelle — demandées vs validées</SectionHeader>
                  <StatAreaChart
                    data={stats.evolution_mensuelle}
                    xKey="mois"
                    series={[
                      { key: "demandees", label: "Demandées", color: theme.primary },
                      { key: "validees", label: "Validées", color: theme.departementColor },
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {isAdmin && (
              <form
                onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}
                style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}
              >
                <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                  <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: theme.textMuted, display: "flex", pointerEvents: "none" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="text" aria-label="Rechercher" value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Rechercher par référence, employé, demandeur..."
                    className="input-focus"
                    style={{
                      width: "100%", boxSizing: "border-box", border: `1.5px solid ${theme.border}`,
                      borderRadius: 10, padding: "10px 14px 10px 40px", color: theme.text,
                      fontSize: 14, outline: "none", background: theme.bg, fontFamily: theme.fontFamily,
                    }}
                  />
                </div>
                <button
                  type="submit" className="btn-lift"
                  style={{ background: theme.primary, border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: theme.fontFamily, whiteSpace: "nowrap" }}
                >
                  Rechercher
                </button>
                {search && (
                  <button
                    type="button" onClick={() => { setSearchInput(""); setSearch(""); }}
                    style={{ border: `1.5px solid ${theme.border}`, borderRadius: 10, padding: "10px 16px", color: theme.textSecondary, fontSize: 13, fontWeight: 600, background: theme.surface, cursor: "pointer", fontFamily: theme.fontFamily }}
                  >
                    Effacer
                  </button>
                )}
              </form>
            )}

            {isAdmin && (
              <div style={{ ...cardStyle, padding: "10px 12px", marginBottom: 20, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textMuted, padding: "0 4px 0 2px", flexShrink: 0 }}>
                  Statut
                </span>
                {STATUTS.map((s) => {
                  const actif = statutFiltre === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setStatutFiltre(s.value)}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, border: "none",
                        background: actif ? theme.primary : "transparent",
                        color: actif ? "#fff" : theme.textSecondary,
                        cursor: "pointer", transition: "background 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => { if (!actif) e.currentTarget.style.background = theme.bg; }}
                      onMouseLeave={(e) => { if (!actif) e.currentTarget.style.background = "transparent"; }}
                    >
                      {s.value && (
                        <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: actif ? "#fff" : STATUT_DOT_COLORS[s.value](theme) }} />
                      )}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {isAdmin && demandes.length > 0 && (
              <div style={{ ...cardStyle, padding: "10px 12px", marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: theme.textSecondary, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === demandes.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(demandes.map((d) => d.id)) : new Set())}
                  />
                  {selected.size > 0 ? `${selected.size} sélectionnée(s)` : "Tout sélectionner"}
                </label>
                <div style={{ flex: 1 }} />
                <button
                  disabled={!canBulkRejeter || bulkLoading}
                  onClick={handleBulkRejeter}
                  style={{
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700,
                    background: canBulkRejeter ? theme.danger : theme.bg,
                    color: canBulkRejeter ? "#fff" : theme.textMuted,
                    cursor: canBulkRejeter && !bulkLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Rejeter {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
                <button
                  disabled={!canBulkRevoquer || bulkLoading}
                  onClick={handleBulkRevoquer}
                  style={{
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700,
                    background: canBulkRevoquer ? theme.danger : theme.bg,
                    color: canBulkRevoquer ? "#fff" : theme.textMuted,
                    cursor: canBulkRevoquer && !bulkLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Révoquer {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
                {selected.size > 0 && !canBulkRejeter && !canBulkRevoquer && (
                  <span style={{ fontSize: 11, color: theme.textMuted, width: "100%" }}>
                    Sélection mixte — regroupez des demandes de même statut ("En cours" pour rejeter, "Validée" pour révoquer).
                    La validation se fait demande par demande (chacune exige son scan).
                  </span>
                )}
                {bulkMessage && (
                  <span style={{ fontSize: 12, color: theme.danger, width: "100%" }}>{bulkMessage}</span>
                )}
              </div>
            )}

            <FiltresPeriode
              idPrefix="con" annee={annee} setAnnee={setAnnee} mois={mois} setMois={setMois}
              importance={importance} setImportance={setImportance} tri={tri} setTri={setTri}
              optionsTri={OPTIONS_TRI} total={demandes.length}
              filtresActifs={filtresActifs} onReset={reinitialiser}
            />

            {demandes.length === 0 && !error ? (
              <div style={{ ...cardStyle, padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                <div style={{ color: theme.textMuted, marginBottom: 14 }}><ClipboardIcon size={40} /></div>
                <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  Aucune demande {search ? "pour cette recherche" : statutFiltre ? "pour ce statut" : ""}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 340 }}>
                  {search
                    ? "Essayez un autre nom, matricule ou référence."
                    : isAdmin
                      ? "Les demandes de consultation apparaîtront ici."
                      : "Créez une demande pour consulter un dossier, un document ou une information archivés."}
                </div>
              </div>
            ) : (
              <TableDemandes
                demandes={demandes} colonnes={colonnes} tri={tri} setTri={setTri}
                lien={(d) => `/consultations/${slugDepuisReference(d.reference)}`}
                aTraiter={isAdmin ? (d) => d.statut === "en_cours" : undefined}
                selection={isAdmin ? { selected, toggle: toggleSelected, ariaLabel: (d) => `Sélectionner ${d.reference}` } : undefined}
              />
            )}
          </>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { heroPadding, contentPadding } from "../styles/theme";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import "../styles/animations.css";
import Skeleton from "../components/Skeleton";
import HeroDecor from "../components/HeroDecor";
import PageBackground from "../components/PageBackground";
import InfoNotice from "../components/InfoNotice";
import { PAGE_NOTICES } from "../config/notices";
import useCountUp from "../hooks/useCountUp";
import useIsMobile from "../hooks/useIsMobile";
import usePageTitle from "../hooks/usePageTitle";
import StatAreaChart from "../components/charts/StatAreaChart";
import StatDonutChart from "../components/charts/StatDonutChart";
import StatRadarChart from "../components/charts/StatRadarChart";
import StatHistogram from "../components/charts/StatHistogram";
import StatSparkline from "../components/charts/StatSparkline";

const KpiCard = ({ label, value, variationPct, className, sparklineData, sparklineKey, color }) => {
  const theme = useTheme();
  const hasVariation = variationPct !== null && variationPct !== undefined;
  const isPositive = hasVariation && variationPct >= 0;
  return (
    <div
      className={`card-lift${className ? ` ${className}` : ""}`}
      style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: "20px 24px",
        boxShadow: theme.shadowMd,
        fontFamily: theme.fontFamily,
        overflow: "hidden",
      }}
    >
      <div style={{
        color: theme.textSecondary, fontSize: 11, textTransform: "uppercase",
        letterSpacing: "0.06em", fontWeight: 700, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ color: theme.primary, fontSize: 32, fontWeight: 800 }}>
          {value ?? "—"}
        </div>
        {hasVariation ? (
          <span style={{
            color: isPositive ? theme.primary : theme.danger,
            fontSize: 13, fontWeight: 700,
          }}>
            {isPositive ? "+" : ""}{variationPct}%
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: 13 }}>—</span>
        )}
      </div>
      {sparklineData && sparklineData.length >= 2 && (
        <div style={{ marginTop: 8, marginLeft: -4, marginRight: -4 }}>
          <StatSparkline data={sparklineData} dataKey={sparklineKey} color={color || theme.primary} />
        </div>
      )}
    </div>
  );
};

const RepartitionBar = ({ label, count, displayValue, max, color, onClick, sub }) => {
  const theme = useTheme();
  return (
  <div onClick={onClick} style={{ marginBottom: 14, cursor: onClick ? "pointer" : "default" }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: theme.text, fontSize: 13 }}>
        {label}
        {sub && <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>({sub})</span>}
      </span>
      <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700 }}>{displayValue ?? count}</span>
    </div>
    <div style={{ background: theme.borderLight, borderRadius: 6, height: 8, overflow: "hidden", border: `1px solid ${theme.border}` }}>
      <div style={{ height: "100%", width: `${max ? Math.max((count / max) * 100, count > 0 ? 2 : 0) : 0}%`, background: color, borderRadius: 6, transition: "width 0.6s ease" }} />
    </div>
  </div>
  );
};

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

const ECHEANCE_PRESETS = [30, 60, 90, 120, 180, 365];

// Lien pré-filtré vers /audit (utilisateur + période) — l'endpoint
// AuditLogListView ne filtre que sur un `action` unique, jamais sur le
// contenu de `details` : impossible de pointer précisément vers, par
// exemple, "les archivages" (répartis entre MODIFY_EMP et DELETE_EMP
// selon qu'ils viennent d'une action unitaire ou en masse — voir
// audit/stats.py _categorize_emp_log) — le lien ouvre donc le journal de
// ce compte sur la période, non filtré par type d'action.
const buildAuditLink = (username, periode, categorie) => {
  if (!username || !periode) return null;
  const params = new URLSearchParams({ user: username, date_debut: periode.debut, date_fin: periode.fin });
  if (categorie) params.set("categorie", categorie);
  return `/audit?${params.toString()}`;
};

// Regroupe les compteurs de "Mon activité" par entité concernée
// (Employé/Contrat/Document/Compte) — un même champ "modifié" peut
// recouvrir des choses très différentes (transfert de service, photo,
// champ personnalisé...), voir audit/stats.py _categorize_emp_log.
const ACTIVITY_ENTITY_GROUPS = [
  {
    label: "Employés",
    tiles: [
      { key: "employes_crees", label: "Créés" },
      { key: "employes_transferts", label: "Transférés (organisation)" },
      { key: "employes_carriere", label: "Carrière (fonction/catégorie/échelle)" },
      { key: "employes_champs", label: "Champs mis à jour (dont OCR)" },
      { key: "employes_photo", label: "Photo modifiée" },
      { key: "employes_archives", label: "Archivés" },
      { key: "employes_restaures", label: "Restaurés" },
      { key: "employes_supprimes", label: "Supprimés définitivement" },
      { key: "employes_autres", label: "Autres modifications" },
    ],
  },
  {
    label: "Contrats",
    tiles: [
      { key: "contrats_crees_modifies", label: "Créés / modifiés" },
      { key: "contrats_supprimes", label: "Supprimés" },
    ],
  },
  {
    label: "Documents",
    tiles: [
      { key: "documents_uploades", label: "Uploadés" },
      { key: "documents_supprimes", label: "Supprimés" },
      { key: "documents_modifies", label: "Modifiés (renommage, rotation, pages...)" },
    ],
  },
  {
    label: "Compte",
    tiles: [
      { key: "comptes_mdp", label: "Mots de passe modifiés" },
    ],
  },
];

const ActivityTile = ({ theme, label, value, href, navigate, title }) => (
  <div>
    <div style={{ color: theme.textMuted, fontSize: 11, marginBottom: 4 }}>{label}</div>
    {href ? (
      <a
        href={href}
        title={title}
        onClick={(e) => { e.preventDefault(); navigate(href); }}
        style={{ color: theme.primary, fontSize: 22, fontWeight: 800, textDecoration: "none", cursor: "pointer" }}
      >
        {value}
      </a>
    ) : (
      <div style={{ color: theme.primary, fontSize: 22, fontWeight: 800 }}>{value}</div>
    )}
  </div>
);

const ActivityGroups = ({ activity, theme, isMobile, username, periode, navigate }) => {
  const groups = ACTIVITY_ENTITY_GROUPS
    .map((g) => ({ ...g, tiles: g.tiles.filter((t) => activity[t.key] > 0) }))
    .filter((g) => g.tiles.length > 0);

  if (groups.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune activité sur cette période.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {groups.map((g) => (
        <div key={g.label}>
          <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>
            {g.label}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(g.tiles.length, 4)}, 1fr)`, gap: 16 }}>
            {g.tiles.map(({ key, label }) => (
              <ActivityTile
                key={key}
                theme={theme}
                label={label}
                value={activity[key]}
                href={buildAuditLink(username, periode, key)}
                navigate={navigate}
                title={
                  key === "documents_uploades"
                    ? "Ce lien liste les uploads du journal — un document supprimé depuis reste dans cette liste mais plus dans le compteur ci-dessus."
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const Statistiques = () => {
  usePageTitle("Statistiques");
  const theme = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ preset: "12m", dateDebut: "", dateFin: "" });
  const [echeanceJours, setEcheanceJours] = useState(90);
  const [echeanceCustomMode, setEcheanceCustomMode] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isSuperadmin = user?.role === "SUPERADMIN";

  const fetchStats = useCallback(async (params = {}, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await api.get("/reporting/stats-detail/", { params });
      setStats(response.data);
    } catch (err) {
      setError("Impossible de charger les statistiques.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!["ADMIN", "SUPERADMIN"].includes(user?.role)) {
      navigate("/employees");
      return;
    }
    fetchStats({ ...(presetToRange("12m") || {}), echeance_jours: echeanceJours });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate, fetchStats]);

  const handlePresetClick = (preset) => {
    setFilters({ preset, dateDebut: "", dateFin: "" });
    const range = presetToRange(preset);
    fetchStats({ ...(range || {}), echeance_jours: echeanceJours }, true);
  };

  const handleDateChange = (field, value) => {
    const next = { ...filters, preset: null, [field]: value };
    setFilters(next);
    if (next.dateDebut && next.dateFin) {
      fetchStats({ date_debut: next.dateDebut, date_fin: next.dateFin, echeance_jours: echeanceJours }, true);
    }
  };

  const currentDateParams = () => {
    if (filters.dateDebut && filters.dateFin) {
      return { date_debut: filters.dateDebut, date_fin: filters.dateFin };
    }
    return presetToRange(filters.preset || "12m") || {};
  };

  const handleEcheanceChange = (jours) => {
    setEcheanceJours(jours);
    fetchStats({ ...currentDateParams(), echeance_jours: jours }, true);
  };

  const handleExportExcel = async () => {
    setExportMenuOpen(false);
    try {
      const response = await api.get("/reporting/stats-export.xlsx/", {
        params: { ...currentDateParams(), echeance_jours: echeanceJours },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "statistiques_somiz.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Impossible d'exporter les statistiques.");
    }
  };

  const handleExportPdf = () => {
    setExportMenuOpen(false);
    window.print();
  };

  const countRecrutements = useCountUp(stats?.indicateurs?.recrutements?.valeur ?? null);
  const countArchivages = useCountUp(stats?.indicateurs?.archivages?.valeur ?? null);
  const countDossiers = useCountUp(stats?.indicateurs?.dossiers_completes?.valeur ?? null);

  if (loading)
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={80} radius={16} style={{ marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={100} radius={16} />)}
          </div>
        </div>
      </PageBackground>
    );

  if (error)
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ color: theme.danger, textAlign: "center", padding: 80 }}>{error}</div>
      </PageBackground>
    );

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile), position: "relative", overflow: "hidden" }}>
        <HeroDecor />
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
                Statistiques
              </h1>
              <InfoNotice text={PAGE_NOTICES.statistiques} />
            </div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Analyse RH sur la période sélectionnée
            </div>
          </div>
        </div>
      </div>

      <div className="no-print" style={{
        background: theme.surface, borderBottom: `1px solid ${theme.border}`,
        padding: isMobile ? "12px 16px" : "14px 32px",
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap",
          gap: 10, alignItems: "center",
        }}>
          {[
            { key: "30j", label: "30 jours" },
            { key: "3m", label: "3 mois" },
            { key: "12m", label: "12 mois" },
            { key: "annee", label: "Année en cours" },
            { key: "tout", label: "Tout" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetClick(p.key)}
              style={{
                background: filters.preset === p.key ? theme.primaryBg : "transparent",
                border: `1px solid ${filters.preset === p.key ? theme.primaryBorder : theme.border}`,
                color: filters.preset === p.key ? theme.primary : theme.textSecondary,
                borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <label htmlFor="stats-date-debut" style={{ fontSize: 12, color: theme.textSecondary }}>Date début</label>
            <input
              id="stats-date-debut"
              type="date"
              value={filters.dateDebut}
              onChange={(e) => handleDateChange("dateDebut", e.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
            />
            <label htmlFor="stats-date-fin" style={{ fontSize: 12, color: theme.textSecondary }}>Date fin</label>
            <input
              id="stats-date-fin"
              type="date"
              value={filters.dateFin}
              onChange={(e) => handleDateChange("dateFin", e.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
            />
          </div>
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              style={{
                background: theme.primary, color: "#fff", border: "none",
                borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: theme.fontFamily,
              }}
            >
              Exporter
            </button>
            {exportMenuOpen && (
              <div
                className="anim-scale-in"
                style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0,
                  background: theme.surface, border: `1px solid ${theme.border}`,
                  borderRadius: 10, boxShadow: theme.shadowLg, zIndex: 20, minWidth: 170,
                }}
              >
                <button
                  onClick={handleExportExcel}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily }}
                >
                  Excel (.xlsx)
                </button>
                <button
                  onClick={handleExportPdf}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: theme.text, fontFamily: theme.fontFamily }}
                >
                  PDF (impression)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16, marginBottom: 32,
        }}>
          <KpiCard
            label="Recrutements" value={countRecrutements ?? 0}
            variationPct={stats?.indicateurs?.recrutements?.variation_pct} className="anim-slide-up delay-1"
            sparklineData={stats.evolution_mensuelle} sparklineKey="recrutements" color={theme.primary}
          />
          <KpiCard
            label="Archivages" value={countArchivages ?? 0}
            variationPct={stats?.indicateurs?.archivages?.variation_pct} className="anim-slide-up delay-2"
            sparklineData={stats.evolution_mensuelle} sparklineKey="archivages" color={theme.danger}
          />
          <KpiCard
            label="Dossiers complétés" value={countDossiers ?? 0}
            variationPct={stats?.indicateurs?.dossiers_completes?.variation_pct} className="anim-slide-up delay-3"
            sparklineData={stats.evolution_mensuelle} sparklineKey="dossiers_completes" color={theme.departementColor}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Direction</h2>
            <StatDonutChart
              data={stats.repartition_direction}
              onSliceClick={(entry) => navigate(`/employees?direction=${entry.id}`)}
            />
          </div>

          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Département</h2>
            <StatDonutChart
              data={stats.repartition_departement}
              onSliceClick={(entry) => navigate(`/employees?departement=${entry.id}`)}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
          {[
            { title: "Par Catégorie", data: stats.repartition_categorie },
            { title: "Par Type de contrat", data: stats.repartition_type_contrat },
            { title: "Par Fonction", data: stats.repartition_fonction },
          ].map(({ title, data }) => (
            <div key={title} className="anim-fade-in delay-2" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, boxShadow: theme.shadowMd }}>
              <h2 style={{ color: theme.text, margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>{title}</h2>
              <StatDonutChart data={data} height={220} />
            </div>
          ))}
        </div>

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Évolution — recrutements, archivages, dossiers complétés</h2>
          <StatAreaChart
            data={stats.evolution_mensuelle}
            xKey="mois"
            series={[
              { key: "recrutements", label: "Recrutements", color: theme.primary },
              { key: "archivages", label: "Archivages", color: theme.danger },
              { key: "dossiers_completes", label: "Dossiers complétés", color: theme.departementColor },
            ]}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide des âges</h2>
            <StatHistogram
              data={stats.pyramide_age} xKey="tranche" dataKey="count" color={theme.departementColor}
              onBarClick={(entry) => navigate(`/employees?age_min=${entry.min}&age_max=${entry.max}`)}
            />
          </div>
          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide d'ancienneté</h2>
            <StatHistogram
              data={stats.pyramide_anciennete} xKey="tranche" dataKey="count" color={theme.serviceColor}
              onBarClick={(entry) => navigate(`/employees?anciennete_min=${entry.min}&anciennete_max=${entry.max}`)}
            />
          </div>
        </div>

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <h2 style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>
              Contrats arrivant à échéance ({echeanceJours} jours)
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label htmlFor="echeance-select" style={{ fontSize: 12, color: theme.textSecondary }}>Seuil</label>
              <select
                id="echeance-select"
                value={echeanceCustomMode ? "custom" : echeanceJours}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setEcheanceCustomMode(true);
                  } else {
                    setEcheanceCustomMode(false);
                    handleEcheanceChange(Number(e.target.value));
                  }
                }}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
              >
                {ECHEANCE_PRESETS.map((j) => (
                  <option key={j} value={j}>{j} jours</option>
                ))}
                <option value="custom">Personnalisé…</option>
              </select>
              {echeanceCustomMode && (
                <input
                  type="number"
                  min={1}
                  max={365}
                  aria-label="Seuil personnalisé (jours)"
                  defaultValue={echeanceJours}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= 365) handleEcheanceChange(v);
                  }}
                  style={{ width: 70, border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily }}
                />
              )}
            </div>
          </div>
          {stats.contrats_echeance.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucun contrat à échéance.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>N° Contrat</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Employé</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Date fin</th>
                    <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Jours restants</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.contrats_echeance.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate(`/contrats/${c.id}`)}
                      style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: "pointer" }}
                    >
                      <td style={{ padding: "8px 6px" }}>{c.numero_contrat}</td>
                      <td style={{ padding: "8px 6px" }}>{c.employee_nom}</td>
                      <td style={{ padding: "8px 6px" }}>{c.date_fin}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <span
                          data-testid="jours-restants-badge"
                          style={{
                            background: c.jours_restants < 15 ? theme.dangerBg : c.jours_restants < 30 ? theme.accentBg : theme.bg,
                            color: c.jours_restants < 15 ? theme.danger : c.jours_restants < 30 ? theme.accent : theme.textSecondary,
                            border: `1px solid ${c.jours_restants < 15 ? theme.dangerBorder : c.jours_restants < 30 ? theme.accentBorder : theme.border}`,
                            borderRadius: 20, padding: "2px 10px", fontWeight: 700,
                          }}
                        >
                          {c.jours_restants}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par Direction (radar)</h2>
            <StatRadarChart data={stats.completude_par_direction} />
            <div style={{ marginTop: 16 }}>
              {stats.completude_par_direction.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                stats.completude_par_direction.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    count={r.taux}
                    displayValue={`${r.taux}%`}
                    max={100}
                    color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                    onClick={() => navigate(`/employees?direction=${r.id}&dossier_complet=0`)}
                  />
                ))
              )}
            </div>
          </div>
          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par Département</h2>
            {stats.completude_par_departement.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              stats.completude_par_departement.map((r) => (
                <RepartitionBar
                  key={r.id}
                  label={r.nom}
                  sub={r.direction_nom}
                  count={r.taux}
                  displayValue={`${r.taux}%`}
                  max={100}
                  color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                  onClick={() => navigate(`/employees?departement=${r.id}&dossier_complet=0`)}
                />
              ))
            )}
          </div>
        </div>

        {stats.mon_activite && (() => {
          const auditLink = buildAuditLink(user?.username, stats.periode);
          return (
            <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <h2 style={{ color: theme.text, margin: 0, fontSize: 15, fontWeight: 700 }}>Mon activité</h2>
                {auditLink && (
                  <a href={auditLink} onClick={(e) => { e.preventDefault(); navigate(auditLink); }} style={{ color: theme.primary, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                    Voir mon journal d'audit →
                  </a>
                )}
              </div>
              <ActivityGroups
                activity={stats.mon_activite} theme={theme} isMobile={isMobile}
                username={user?.username} periode={stats.periode} navigate={navigate}
              />
            </div>
          );
        })()}

        {isSuperadmin && stats.activite_par_admin && (() => {
          const columns = [
            { key: "employes_crees", label: "Créés" },
            { key: "employes_transferts", label: "Transférés" },
            { key: "employes_carriere", label: "Carrière" },
            { key: "employes_champs", label: "Champs" },
            { key: "employes_archives", label: "Archivés" },
            { key: "employes_restaures", label: "Restaurés" },
            { key: "employes_supprimes", label: "Suppr. définitive" },
            { key: "contrats_crees_modifies", label: "Contrats" },
            { key: "contrats_supprimes", label: "Contrats suppr." },
            { key: "documents_uploades", label: "Doc. uploadés" },
            { key: "documents_supprimes", label: "Doc. supprimés" },
            { key: "documents_modifies", label: "Doc. modifiés" },
            { key: "comptes_mdp", label: "Mots de passe" },
          ].filter(({ key }) => stats.activite_par_admin.some((a) => a[key] > 0));
          return (
            <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
              <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Activité par administrateur</h2>
              {stats.activite_par_admin.length === 0 || columns.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune activité sur cette période.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
                        <th style={{ padding: "8px 6px", color: theme.textSecondary }}>Administrateur</th>
                        {columns.map((c) => (
                          <th key={c.key} style={{ padding: "8px 6px", color: theme.textSecondary }}>{c.label}</th>
                        ))}
                        <th style={{ padding: "8px 6px", color: theme.textSecondary }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.activite_par_admin.map((a) => {
                        const link = buildAuditLink(a.username, stats.periode);
                        return (
                          <tr key={a.id} style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                            <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                              {a.nom_complet}
                              {a.role === "SUPERADMIN" && (
                                <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>(SUPERADMIN)</span>
                              )}
                            </td>
                            {columns.map((c) => {
                              const cellHref = buildAuditLink(a.username, stats.periode, c.key);
                              return (
                                <td key={c.key} style={{ padding: "8px 6px" }}>
                                  {cellHref ? (
                                    <a
                                      href={cellHref}
                                      onClick={(e) => { e.preventDefault(); navigate(cellHref); }}
                                      style={{ color: theme.text, textDecoration: "none" }}
                                    >
                                      {a[c.key]}
                                    </a>
                                  ) : (
                                    a[c.key]
                                  )}
                                </td>
                              );
                            })}
                            <td style={{ padding: "8px 6px" }}>
                              {link && (
                                <a href={link} onClick={(e) => { e.preventDefault(); navigate(link); }} style={{ color: theme.primary, fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
                                  Audit →
                                </a>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </PageBackground>
  );
};

export default Statistiques;

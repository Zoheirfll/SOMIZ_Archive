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
import StatBarChart from "../components/StatBarChart";

const KpiCard = ({ label, value, variationPct, className }) => {
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

const Statistiques = () => {
  const theme = useTheme();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ preset: "12m", dateDebut: "", dateFin: "" });
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
    fetchStats(presetToRange("12m") || {});
  }, [user, navigate, fetchStats]);

  const handlePresetClick = (preset) => {
    setFilters({ preset, dateDebut: "", dateFin: "" });
    const range = presetToRange(preset);
    fetchStats(range || {}, true);
  };

  const handleDateChange = (field, value) => {
    const next = { ...filters, preset: null, [field]: value };
    setFilters(next);
    if (next.dateDebut && next.dateFin) {
      fetchStats({ date_debut: next.dateDebut, date_fin: next.dateFin }, true);
    }
  };

  const currentDateParams = () => {
    if (filters.dateDebut && filters.dateFin) {
      return { date_debut: filters.dateDebut, date_fin: filters.dateFin };
    }
    return presetToRange(filters.preset || "12m") || {};
  };

  const handleExportExcel = async () => {
    setExportMenuOpen(false);
    try {
      const response = await api.get("/reporting/stats-export.xlsx/", {
        params: currentDateParams(),
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
          <KpiCard label="Recrutements" value={countRecrutements ?? 0} variationPct={stats?.indicateurs?.recrutements?.variation_pct} className="anim-slide-up delay-1" />
          <KpiCard label="Archivages" value={countArchivages ?? 0} variationPct={stats?.indicateurs?.archivages?.variation_pct} className="anim-slide-up delay-2" />
          <KpiCard label="Dossiers complétés" value={countDossiers ?? 0} variationPct={stats?.indicateurs?.dossiers_completes?.variation_pct} className="anim-slide-up delay-3" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Direction</h2>
            {stats.repartition_direction.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              (() => {
                const max = Math.max(...stats.repartition_direction.map((r) => r.count));
                return stats.repartition_direction.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    count={r.count}
                    max={max}
                    color={theme.directionColor}
                    onClick={() => navigate(`/employees?direction=${r.id}`)}
                  />
                ));
              })()
            )}
          </div>

          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Répartition par Département</h2>
            {stats.repartition_departement.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
            ) : (
              (() => {
                const max = Math.max(...stats.repartition_departement.map((r) => r.count));
                return stats.repartition_departement.map((r) => (
                  <RepartitionBar
                    key={r.id}
                    label={r.nom}
                    sub={r.direction_nom}
                    count={r.count}
                    max={max}
                    color={theme.departementColor}
                    onClick={() => navigate(`/employees?departement=${r.id}`)}
                  />
                ));
              })()
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
          {[
            { title: "Par Catégorie", data: stats.repartition_categorie, color: theme.serviceColor },
            { title: "Par Type de contrat", data: stats.repartition_type_contrat, color: theme.accent },
            { title: "Par Fonction", data: stats.repartition_fonction, color: theme.primary },
          ].map(({ title, data, color }) => (
            <div key={title} className="anim-fade-in delay-2" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20, boxShadow: theme.shadowMd }}>
              <h2 style={{ color: theme.text, margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>{title}</h2>
              {data.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                (() => {
                  const max = Math.max(...data.map((r) => r.count));
                  return data.map((r) => (
                    <RepartitionBar key={r.nom} label={r.nom} count={r.count} max={max} color={color} />
                  ));
                })()
              )}
            </div>
          ))}
        </div>

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Évolution — recrutements vs archivages</h2>
          <StatBarChart
            data={stats.evolution_mensuelle}
            xKey="mois"
            series={[
              { key: "recrutements", label: "Recrutements", color: theme.primary },
              { key: "archivages", label: "Archivages", color: theme.danger },
            ]}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 20 }}>
          <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide des âges</h2>
            <StatBarChart
              data={stats.pyramide_age}
              xKey="tranche"
              series={[{ key: "count", label: "Effectif", color: theme.departementColor }]}
              orientation="horizontal"
            />
          </div>
          <div className="anim-fade-in delay-1" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}>
            <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Pyramide d'ancienneté</h2>
            <StatBarChart
              data={stats.pyramide_anciennete}
              xKey="tranche"
              series={[{ key: "count", label: "Effectif", color: theme.serviceColor }]}
              orientation="horizontal"
            />
          </div>
        </div>

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Contrats arrivant à échéance (90 jours)</h2>
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

        <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
          <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Complétude par unité</h2>
          {stats.completude_par_direction.length === 0 && stats.completude_par_departement.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
          ) : (
            <>
              {stats.completude_par_direction.map((r) => (
                <RepartitionBar
                  key={r.id}
                  label={r.nom}
                  count={r.taux}
                  displayValue={`${r.taux}%`}
                  max={100}
                  color={r.taux >= 80 ? theme.primary : r.taux >= 50 ? theme.accent : theme.danger}
                />
              ))}
            </>
          )}
        </div>

        {stats.mon_activite && (() => {
          const tiles = [
            { key: "employes_crees", label: "Employés créés" },
            { key: "employes_modifies", label: "Employés modifiés" },
            { key: "employes_archives", label: "Employés archivés" },
            { key: "documents_uploades", label: "Documents uploadés" },
            { key: "documents_supprimes", label: "Documents supprimés" },
            { key: "documents_modifies", label: "Documents modifiés" },
          ].filter(({ key }) => stats.mon_activite[key] > 0);
          return (
            <div className="anim-fade-in" style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd, marginBottom: 20 }}>
              <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Mon activité</h2>
              {tiles.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune activité sur cette période.</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(tiles.length, 6)}, 1fr)`, gap: 16 }}>
                  {tiles.map(({ key, label }) => (
                    <div key={key}>
                      <div style={{ color: theme.textSecondary, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, marginBottom: 4 }}>
                        {label}
                      </div>
                      <div style={{ color: theme.primary, fontSize: 22, fontWeight: 800 }}>
                        {stats.mon_activite[key]}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {isSuperadmin && stats.activite_par_admin && (() => {
          const columns = [
            { key: "employes_crees", label: "Créés" },
            { key: "employes_modifies", label: "Modifiés" },
            { key: "employes_archives", label: "Archivés" },
            { key: "documents_uploades", label: "Uploadés" },
            { key: "documents_supprimes", label: "Supprimés" },
            { key: "documents_modifies", label: "Doc. modifiés" },
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
                      </tr>
                    </thead>
                    <tbody>
                      {stats.activite_par_admin.map((a) => (
                        <tr key={a.id} style={{ borderBottom: `1px solid ${theme.borderLight}` }}>
                          <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                            {a.nom_complet}
                            {a.role === "SUPERADMIN" && (
                              <span style={{ color: theme.textMuted, fontSize: 11, marginLeft: 6 }}>(SUPERADMIN)</span>
                            )}
                          </td>
                          {columns.map((c) => (
                            <td key={c.key} style={{ padding: "8px 6px" }}>{a[c.key]}</td>
                          ))}
                        </tr>
                      ))}
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

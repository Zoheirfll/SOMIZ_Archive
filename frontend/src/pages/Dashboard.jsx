import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";
import "../styles/animations.css";
import Skeleton from "../components/Skeleton";

// SVG icons
const IconUsers = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconCheckCircle = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);

const IconBarChart = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
);

const IconFile = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const IconFolder = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const StatCard = ({ label, value, sub, color, icon, className }) => (
  <div
    className={`card-lift${className ? ` ${className}` : ""}`}
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 16,
      padding: "20px 24px",
      boxShadow: theme.shadowMd,
      borderTop: `3px solid ${color}`,
      fontFamily: theme.fontFamily,
    }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{
          color: theme.textSecondary,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 700,
          marginBottom: 8,
        }}>
          {label}
        </div>
        <div style={{ color, fontSize: 32, fontWeight: 800 }}>
          {value ?? "—"}
        </div>
        {sub && (
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            {sub}
          </div>
        )}
      </div>
      <div style={{ color, opacity: 0.65 }}>{icon}</div>
    </div>
  </div>
);

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      navigate("/employees");
      return;
    }
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/reporting/stats/");
      setStats(response.data);
    } catch (err) {
      setError("Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  };

  if (loading)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
          <Skeleton height={80} radius={16} style={{ marginBottom: 24 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} height={100} radius={16} />
            ))}
          </div>
        </div>
      </div>
    );

  if (error)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ color: theme.danger, textAlign: "center", padding: 80 }}>{error}</div>
      </div>
    );

  const total = stats?.employes_actifs || 0;

  return (
    <div style={{ background: theme.bg, minHeight: "100vh", fontFamily: theme.fontFamily }}>
      <Navbar />

      {/* Hero header */}
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: "32px 32px 36px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ color: "#FFFFFF", margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "inherit" }}>
              Tableau de bord
            </h1>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6 }}>
              Vue d'ensemble des dossiers RH
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        {/* Stat cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}>
          <StatCard
            label="Employés actifs"
            value={total}
            color={theme.primary}
            icon={<IconUsers />}
            className="anim-slide-up delay-1"
          />
          <StatCard
            label="Dossiers complets"
            value={stats?.dossiers_complets ?? 0}
            sub={`sur ${total} employés`}
            color={theme.primary}
            icon={<IconCheckCircle />}
            className="anim-slide-up delay-2"
          />
          <StatCard
            label="Taux de complétude"
            value={total > 0 ? `${stats?.taux_completude_global}%` : "N/A"}
            color={stats?.taux_completude_global >= 80 ? theme.primary : theme.warning}
            icon={<IconBarChart />}
            className="anim-slide-up delay-3"
          />
          <StatCard
            label="Total documents"
            value={stats?.total_documents ?? 0}
            color={theme.textSecondary}
            icon={<IconFile />}
            className="anim-slide-up delay-4"
          />
        </div>

        {total === 0 ? (
          <div style={{
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 16,
            padding: 60,
            textAlign: "center",
            boxShadow: theme.shadowMd,
          }}>
            <div style={{ color: theme.textMuted, marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <IconFolder />
            </div>
            <div style={{ fontSize: 15, color: theme.text, fontWeight: 600, marginBottom: 8 }}>
              Aucun employé dans la base
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary }}>
              Ajoutez des employés pour voir les statistiques.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Complétude par type */}
            <div
              className="anim-fade-in delay-2"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 16,
                padding: 24,
                boxShadow: theme.shadowMd,
              }}
            >
              <h2 style={{ color: theme.text, margin: "0 0 20px", fontSize: 15, fontWeight: 700 }}>
                Complétude par type de document
              </h2>
              {stats?.completude_par_type &&
                Object.entries(stats.completude_par_type).map(([code, data]) => (
                  <div key={code} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ color: theme.text, fontSize: 13 }}>
                        {data.required && (
                          <span style={{ color: theme.danger, marginRight: 4 }}>*</span>
                        )}
                        {data.label}
                      </span>
                      <span style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 600 }}>
                        {data.nb_employes}/{total} ({data.pourcentage}%)
                      </span>
                    </div>
                    <div style={{
                      background: theme.bg,
                      borderRadius: 6,
                      height: 8,
                      overflow: "hidden",
                      border: `1px solid ${theme.border}`,
                    }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${data.pourcentage}%`,
                          background:
                            data.pourcentage >= 80
                              ? "linear-gradient(90deg, #166534, #16a34a)"
                              : data.pourcentage >= 50
                                ? "linear-gradient(90deg, #92400e, #b45309)"
                                : "linear-gradient(90deg, #991b1b, #dc2626)",
                          borderRadius: 6,
                          transition: "width 0.6s ease",
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>

            {/* Activité récente */}
            <div
              className="anim-fade-in delay-3"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 16,
                padding: 24,
                boxShadow: theme.shadowMd,
              }}
            >
              <h2 style={{ color: theme.text, margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>
                Activité — 7 derniers jours
              </h2>
              {!stats?.activite_7_jours?.length ? (
                <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
                  Aucune activité récente.
                </div>
              ) : (
                stats.activite_7_jours.map((item) => (
                  <div
                    key={item.action}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <span style={{ color: theme.text, fontSize: 13 }}>{item.action}</span>
                    <span style={{
                      background: theme.primaryBg,
                      color: theme.primary,
                      border: `1px solid ${theme.primaryBorder}`,
                      borderRadius: 20,
                      padding: "3px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {item.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

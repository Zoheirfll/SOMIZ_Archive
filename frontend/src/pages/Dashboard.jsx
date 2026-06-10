import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { theme } from "../styles/theme";
import { useAuth } from "../context/AuthContext";

const StatCard = ({ label, value, sub, color, icon, className }) => (
  <div
    className={`card-lift${className ? ` ${className}` : ""}`}
    style={{
      background: theme.surface,
      border: `1px solid ${theme.primaryBorder}`,
      borderRadius: 12,
      padding: "20px 24px",
      boxShadow: theme.shadow,
      borderTop: `3px solid ${color}`,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div>
        <div
          style={{
            color: theme.textSecondary,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 8,
          }}
        >
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
      <div style={{ fontSize: 28, opacity: 0.6 }}>{icon}</div>
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
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div
          style={{
            color: theme.textSecondary,
            textAlign: "center",
            padding: 80,
          }}
        >
          Chargement...
        </div>
      </div>
    );

  if (error)
    return (
      <div style={{ background: theme.bg, minHeight: "100vh" }}>
        <Navbar />
        <div style={{ color: theme.danger, textAlign: "center", padding: 80 }}>
          {error}
        </div>
      </div>
    );

  const total = stats?.employes_actifs || 0;

  return (
    <div style={{ background: theme.bg, minHeight: "100vh" }}>
      <Navbar />
      <div style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        <h1
          style={{
            color: theme.text,
            margin: "0 0 24px",
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          Dashboard Admin
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 32,
          }}
        >
          <StatCard
            label="Employés actifs"
            value={total}
            color={theme.primary}
            icon="👥"
            className="anim-slide-up delay-1"
          />
          <StatCard
            label="Dossiers complets"
            value={stats?.dossiers_complets ?? 0}
            sub={`sur ${total} employés`}
            color={theme.primary}
            icon="✅"
            className="anim-slide-up delay-2"
          />
          <StatCard
            label="Taux de complétude"
            value={total > 0 ? `${stats?.taux_completude_global}%` : "N/A"}
            color={
              stats?.taux_completude_global >= 80
                ? theme.primary
                : theme.warning
            }
            icon="📊"
            className="anim-slide-up delay-3"
          />
          <StatCard
            label="Total documents"
            value={stats?.total_documents ?? 0}
            color={theme.textSecondary}
            icon="📄"
            className="anim-slide-up delay-4"
          />
        </div>

        {total === 0 ? (
          <div
            style={{
              background: theme.surface,
              border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 12,
              padding: 60,
              textAlign: "center",
              boxShadow: theme.shadow,
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <div
              style={{
                fontSize: 15,
                color: theme.text,
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Aucun employé dans la base
            </div>
            <div style={{ fontSize: 13, color: theme.textSecondary }}>
              Ajoutez des employés pour voir les statistiques.
            </div>
          </div>
        ) : (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
          >
            {/* Complétude par type */}
            <div
              className="anim-fade-in delay-2"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.primaryBorder}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: theme.shadow,
              }}
            >
              <h2
                style={{
                  color: theme.text,
                  margin: "0 0 20px",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Complétude par type de document
              </h2>
              {stats?.completude_par_type &&
                Object.entries(stats.completude_par_type).map(
                  ([code, data]) => (
                    <div key={code} style={{ marginBottom: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 5,
                        }}
                      >
                        <span style={{ color: theme.text, fontSize: 13 }}>
                          {data.required && (
                            <span
                              style={{ color: theme.danger, marginRight: 4 }}
                            >
                              *
                            </span>
                          )}
                          {data.label}
                        </span>
                        <span
                          style={{ color: theme.textSecondary, fontSize: 12 }}
                        >
                          {data.nb_employes}/{total} ({data.pourcentage}%)
                        </span>
                      </div>
                      <div
                        style={{
                          background: theme.bg,
                          borderRadius: 4,
                          height: 7,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${data.pourcentage}%`,
                            background:
                              data.pourcentage >= 80
                                ? theme.primary
                                : data.pourcentage >= 50
                                  ? theme.warning
                                  : theme.danger,
                            borderRadius: 4,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                    </div>
                  ),
                )}
            </div>

            {/* Activité récente */}
            <div
              className="anim-fade-in delay-3"
              style={{
                background: theme.surface,
                border: `1px solid ${theme.primaryBorder}`,
                borderRadius: 12,
                padding: 24,
                boxShadow: theme.shadow,
              }}
            >
              <h2
                style={{
                  color: theme.text,
                  margin: "0 0 16px",
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                Activité — 7 derniers jours
              </h2>
              {!stats?.activite_7_jours?.length ? (
                <div
                  style={{
                    color: theme.textMuted,
                    fontSize: 13,
                    textAlign: "center",
                    padding: 20,
                  }}
                >
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
                      borderBottom: `1px solid ${theme.primaryBorder}`,
                    }}
                  >
                    <span style={{ color: theme.text, fontSize: 13 }}>
                      {item.action}
                    </span>
                    <span
                      style={{
                        background: theme.primaryBg,
                        color: theme.primary,
                        border: `1px solid ${theme.primaryBorder}`,
                        borderRadius: 6,
                        padding: "2px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
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

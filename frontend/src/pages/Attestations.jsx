import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "recue", label: "Reçue" },
  { value: "imprimee", label: "Imprimée" },
  { value: "signee", label: "Signée" },
  { value: "prete", label: "Prête" },
  { value: "recuperee", label: "Récupérée" },
  { value: "rejetee", label: "Rejetée" },
];

export default function Attestations() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const [demandes, setDemandes] = useState([]);
  const [statutFiltre, setStatutFiltre] = useState("");
  const [loading, setLoading] = useState(true);
  const [sousOnglet, setSousOnglet] = useState("liste");
  const [stats, setStats] = useState(null);

  const fetchDemandes = async (statut = statutFiltre, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = statut ? { statut } : {};
      const res = await api.get("/attestations/demandes/", { params });
      setDemandes(res.data?.results || res.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemandes(); }, [statutFiltre]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sousOnglet === "stats" && isAdmin && !stats) {
      api.get("/attestations/stats/").then((res) => setStats(res.data));
    }
  }, [sousOnglet, isAdmin, stats]);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: theme.textSecondary }}>Chargement...</div>;

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>Demandes d'attestation de travail</h1>
        {["GESTIONNAIRE", "ADMIN", "SUPERADMIN"].includes(user?.role) && (
          <Link to="/attestations/nouvelle" className="btn-lift" style={{
            display: "inline-block", marginTop: 16, background: "#fff", color: theme.primary,
            borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none",
          }}>
            + Nouvelle demande
          </Link>
        )}
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button onClick={() => setSousOnglet("liste")} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: sousOnglet === "liste" ? theme.primaryBg : "transparent",
              color: sousOnglet === "liste" ? theme.primary : theme.textSecondary,
            }}>
              Liste
            </button>
            <button onClick={() => setSousOnglet("stats")} style={{
              padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 12,
              background: sousOnglet === "stats" ? theme.primaryBg : "transparent",
              color: sousOnglet === "stats" ? theme.primary : theme.textSecondary,
            }}>
              Statistiques
            </button>
          </div>
        )}

        {sousOnglet === "stats" && isAdmin ? (
          <div>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", color: theme.textSecondary }}>Par gestionnaire</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
              <tbody>
                {(stats?.par_gestionnaire || []).map((r) => (
                  <tr key={r.demandeur_id} style={{ borderTop: `1px solid ${theme.border}` }}>
                    <td style={{ padding: 8 }}>{r.demandeur_nom}</td>
                    <td style={{ padding: 8, fontWeight: 700 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", color: theme.textSecondary }}>Par employé</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {(stats?.par_employe || []).map((r) => (
                  <tr key={r.employee_id} style={{ borderTop: `1px solid ${theme.border}` }}>
                    <td style={{ padding: 8 }}>{r.employee_nom}</td>
                    <td style={{ padding: 8, fontWeight: 700 }}>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {isAdmin && (
              <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUTS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatutFiltre(s.value)}
                    style={{
                      padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                      border: `1px solid ${statutFiltre === s.value ? theme.primary : theme.border}`,
                      background: statutFiltre === s.value ? theme.primaryBg : theme.surface,
                      color: statutFiltre === s.value ? theme.primary : theme.textSecondary,
                      cursor: "pointer",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", color: theme.textSecondary }}>
                    <th style={{ padding: 10 }}>Référence</th>
                    <th style={{ padding: 10 }}>Employé</th>
                    <th style={{ padding: 10 }}>Demandeur</th>
                    <th style={{ padding: 10 }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {demandes.map((d) => (
                    <tr key={d.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <td style={{ padding: 10 }}>
                        <Link to={`/attestations/${d.id}`} style={{ color: theme.primary, fontWeight: 700, textDecoration: "none" }}>
                          {d.reference}
                        </Link>
                      </td>
                      <td style={{ padding: 10 }}>{d.employee_nom}</td>
                      <td style={{ padding: 10 }}>{d.demandeur_nom}</td>
                      <td style={{ padding: 10 }}><StatutBadge statut={d.statut} /></td>
                    </tr>
                  ))}
                  {demandes.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: theme.textMuted }}>Aucune demande.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

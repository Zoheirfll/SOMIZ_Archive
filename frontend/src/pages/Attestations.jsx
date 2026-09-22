import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { ClipboardIcon, FileTextIcon } from "../components/icons";

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "recue", label: "Reçue" },
  { value: "imprimee", label: "Imprimée" },
  { value: "signee", label: "Signée" },
  { value: "prete", label: "Prête" },
  { value: "recuperee", label: "Récupérée" },
  { value: "rejetee", label: "Rejetée" },
];

const SectionHeader = ({ children, theme }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <div style={{ width: 4, height: 16, borderRadius: 2, background: theme.primary }} />
    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textSecondary }}>
      {children}
    </span>
  </div>
);

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

  const cardStyle = {
    background: theme.surface,
    borderRadius: 16,
    border: `1px solid ${theme.border}`,
    boxShadow: theme.shadowMd,
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
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              Dossier RH
            </div>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Demandes d'attestation de travail</h1>
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "6px 0 0" }}>
              {isAdmin ? "Suivi et traitement des demandes de tous les gestionnaires" : "Vos demandes en cours et leur avancement"}
            </p>
          </div>
          {["GESTIONNAIRE", "SUPERADMIN"].includes(user?.role) && (
            <Link to="/attestations/nouvelle" className="btn-lift" style={{
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

        {sousOnglet === "stats" && isAdmin ? (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
            {stats && stats.delai_moyen_jours != null && (
              <div style={{ ...cardStyle, padding: 20, gridColumn: isMobile ? "1" : "1 / -1" }}>
                <div style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                  Délai moyen de traitement
                </div>
                <div style={{ color: theme.primary, fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                  {stats.delai_moyen_jours} j
                </div>
              </div>
            )}
            <div style={{ ...cardStyle, padding: 20 }}>
              <SectionHeader theme={theme}>Par gestionnaire</SectionHeader>
              {(stats?.par_gestionnaire || []).length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                (stats?.par_gestionnaire || []).map((r) => (
                  <div key={r.demandeur_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderTop: `1px solid ${theme.border}`,
                  }}>
                    <span style={{ fontSize: 13, color: theme.text }}>{r.demandeur_nom}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: theme.primary, background: theme.primaryBg,
                      borderRadius: 999, padding: "2px 10px",
                    }}>
                      {r.count}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div style={{ ...cardStyle, padding: 20 }}>
              <SectionHeader theme={theme}>Par employé</SectionHeader>
              {(stats?.par_employe || []).length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune donnée.</div>
              ) : (
                (stats?.par_employe || []).map((r) => (
                  <div key={r.employee_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 0", borderTop: `1px solid ${theme.border}`,
                  }}>
                    <span style={{ fontSize: 13, color: theme.text }}>{r.employee_nom}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: theme.primary, background: theme.primaryBg,
                      borderRadius: 999, padding: "2px 10px",
                    }}>
                      {r.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {isAdmin && (
              <div style={{ marginBottom: 20, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUTS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setStatutFiltre(s.value)}
                    className="btn-lift"
                    style={{
                      padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
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

            {demandes.length === 0 ? (
              <div style={{
                ...cardStyle, padding: "56px 24px", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", textAlign: "center",
              }}>
                <div style={{ color: theme.textMuted, marginBottom: 14 }}><ClipboardIcon size={40} /></div>
                <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  Aucune demande {statutFiltre ? "pour ce statut" : ""}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 340 }}>
                  {isAdmin
                    ? "Les demandes envoyées par les gestionnaires apparaîtront ici."
                    : "Créez une nouvelle demande d'attestation pour un employé de votre périmètre."}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {demandes.map((d) => (
                  <Link
                    key={d.id}
                    to={`/attestations/${d.id}`}
                    className="card-lift"
                    style={{
                      ...cardStyle, padding: "14px 18px", textDecoration: "none",
                      display: "flex", alignItems: "center", gap: 14,
                      flexWrap: isMobile ? "wrap" : "nowrap",
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, background: theme.primaryBg,
                      color: theme.primary, display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <FileTextIcon size={17} />
                    </div>
                    <div style={{ flex: isMobile ? "1 1 100%" : "0 0 110px", fontWeight: 700, color: theme.primary, fontSize: 13 }}>
                      {d.reference}
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ color: theme.text, fontSize: 14, fontWeight: 600 }}>{d.employee_nom}</div>
                      <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                        Demandé par {d.demandeur_nom}
                      </div>
                    </div>
                    <StatutBadge statut={d.statut} />
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

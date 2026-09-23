import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import { useConfirm } from "../components/ConfirmDialog";
import StatutBadge from "../components/attestations/StatutBadge";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { ClipboardIcon, FileTextIcon } from "../components/icons";

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "recue", label: "Reçue" },
  { value: "prete", label: "Prête" },
  { value: "recuperee", label: "Récupérée" },
  { value: "rejetee", label: "Rejetée" },
];

// Même code couleur que StatutBadge, pour repérer un statut d'un coup
// d'œil aussi bien dans le filtre que dans la liste.
const STATUT_DOT_COLORS = {
  recue: (theme) => theme.textSecondary,
  prete: (theme) => theme.primary,
  recuperee: (theme) => theme.primary,
  rejetee: (theme) => theme.danger,
};

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
  // SUPERADMIN toujours, ADMIN seulement si chargé des attestations — un
  // ADMIN non chargé n'atteint de toute façon jamais cette page (voir
  // ProtectedRoute requireFn dans App.js) mais can_manage_attestations
  // reste la source de vérité pour cette variable.
  const isAdmin = !!user?.can_manage_attestations;
  const [demandes, setDemandes] = useState([]);
  const [statutFiltre, setStatutFiltre] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sousOnglet, setSousOnglet] = useState("liste");
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const fetchDemandes = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statutFiltre) params.statut = statutFiltre;
      if (search) params.q = search;
      const res = await api.get("/attestations/demandes/", { params });
      setDemandes(res.data?.results || res.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemandes(); }, [statutFiltre, search]); // eslint-disable-line react-hooks/exhaustive-deps

  // La sélection perd son sens si la liste change sous ses pieds (filtre,
  // recherche, refresh après action) — repart de zéro plutôt que de garder
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
  const canBulkPrete = selectedDemandes.length > 0 && selectedDemandes.every((d) => d.statut === "recue");
  const canBulkRecuperee = selectedDemandes.length > 0 && selectedDemandes.every((d) => d.statut === "prete");

  const handleBulkStatut = async (statut, label) => {
    if (!(await confirm(
      `${label} ${selectedDemandes.length} demande(s) sélectionnée(s) ?`
    ))) return;
    setBulkLoading(true);
    try {
      await api.post("/attestations/demandes/bulk-statut/", {
        ids: selectedDemandes.map((d) => d.id),
        statut,
      });
      setSelected(new Set());
      await fetchDemandes(true);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

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
              <form
                onSubmit={handleSearchSubmit}
                style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}
              >
                <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                  <div style={{
                    position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                    color: theme.textMuted, display: "flex", pointerEvents: "none",
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchInput}
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
                  type="submit"
                  className="btn-lift"
                  style={{
                    background: theme.primary, border: "none", borderRadius: 10, padding: "10px 20px",
                    color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                    fontFamily: theme.fontFamily, whiteSpace: "nowrap",
                  }}
                >
                  Rechercher
                </button>
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearchInput(""); setSearch(""); }}
                    style={{
                      border: `1.5px solid ${theme.border}`, borderRadius: 10, padding: "10px 16px",
                      color: theme.textSecondary, fontSize: 13, fontWeight: 600, background: theme.surface,
                      cursor: "pointer", fontFamily: theme.fontFamily,
                    }}
                  >
                    Effacer
                  </button>
                )}
              </form>
            )}

            {isAdmin && (
              <div style={{
                ...cardStyle, padding: "10px 12px", marginBottom: 20,
                display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
                  color: theme.textMuted, padding: "0 4px 0 2px", flexShrink: 0,
                }}>
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
                        padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                        border: "none",
                        background: actif ? theme.primary : "transparent",
                        color: actif ? "#fff" : theme.textSecondary,
                        cursor: "pointer", transition: "background 0.15s, color 0.15s",
                      }}
                      onMouseEnter={(e) => { if (!actif) e.currentTarget.style.background = theme.bg; }}
                      onMouseLeave={(e) => { if (!actif) e.currentTarget.style.background = "transparent"; }}
                    >
                      {s.value && (
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                          background: actif ? "#fff" : STATUT_DOT_COLORS[s.value](theme),
                        }} />
                      )}
                      {s.label}
                    </button>
                  );
                })}
              </div>
            )}

            {isAdmin && demandes.length > 0 && (
              <div style={{
                ...cardStyle, padding: "10px 12px", marginBottom: 14,
                display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
              }}>
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
                  disabled={!canBulkPrete || bulkLoading}
                  onClick={() => handleBulkStatut("prete", "Marquer comme prêtes")}
                  style={{
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700,
                    background: canBulkPrete ? theme.primary : theme.bg,
                    color: canBulkPrete ? "#fff" : theme.textMuted,
                    cursor: canBulkPrete && !bulkLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Marquer prêtes {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
                <button
                  disabled={!canBulkRecuperee || bulkLoading}
                  onClick={() => handleBulkStatut("recuperee", "Marquer comme récupérées")}
                  style={{
                    border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700,
                    background: canBulkRecuperee ? theme.primary : theme.bg,
                    color: canBulkRecuperee ? "#fff" : theme.textMuted,
                    cursor: canBulkRecuperee && !bulkLoading ? "pointer" : "not-allowed",
                  }}
                >
                  Marquer récupérées {selected.size > 0 ? `(${selected.size})` : ""}
                </button>
                {selected.size > 0 && !canBulkPrete && !canBulkRecuperee && (
                  <span style={{ fontSize: 11, color: theme.textMuted, width: "100%" }}>
                    Sélection mixte — regroupez des demandes de même statut ("Reçue" pour passer à "Prête", "Prête" pour passer à "Récupérée").
                  </span>
                )}
              </div>
            )}

            {demandes.length === 0 ? (
              <div style={{
                ...cardStyle, padding: "56px 24px", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", textAlign: "center",
              }}>
                <div style={{ color: theme.textMuted, marginBottom: 14 }}><ClipboardIcon size={40} /></div>
                <div style={{ color: theme.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  Aucune demande {search ? "pour cette recherche" : statutFiltre ? "pour ce statut" : ""}
                </div>
                <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 340 }}>
                  {search
                    ? "Essayez un autre nom, matricule ou référence."
                    : isAdmin
                      ? "Les demandes envoyées par les gestionnaires apparaîtront ici."
                      : "Créez une nouvelle demande d'attestation pour un employé de votre périmètre."}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {demandes.map((d) => (
                  <Link
                    key={d.id}
                    to={`/attestations/${d.reference.replace("/", "-")}`}
                    className="card-lift"
                    style={{
                      ...cardStyle, padding: "14px 18px", textDecoration: "none",
                      display: "flex", alignItems: "center", gap: 14,
                      flexWrap: isMobile ? "wrap" : "nowrap",
                    }}
                  >
                    {isAdmin && (
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); toggleSelected(d.id); }}
                        style={{ flexShrink: 0, cursor: "pointer" }}
                      />
                    )}
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
      {ConfirmDialog}
    </PageBackground>
  );
}

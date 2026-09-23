import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { EyeIcon, CheckIcon, DownloadIcon } from "../components/icons";

const PROCHAIN_STATUT = {
  recue: { value: "prete", label: "Marquer Prête" },
  prete: { value: "recuperee", label: "Marquer Récupérée" },
};

const ETAPES = [
  { value: "recue", label: "Reçue", dateKey: "created_at" },
  { value: "prete", label: "Prête", dateKey: "date_prete" },
  { value: "recuperee", label: "Récupérée", dateKey: "date_recuperee" },
];

const formatDateEtape = (isoString) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const Field = ({ label, value, theme, danger }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: theme.textMuted, marginBottom: 3 }}>
      {label}
    </div>
    <div style={{ fontSize: 14, color: danger ? theme.danger : theme.text, fontWeight: danger ? 600 : 500 }}>
      {value}
    </div>
  </div>
);

const StatutStepper = ({ demande, theme, isMobile }) => {
  const statutActuel = demande.statut;
  if (statutActuel === "rejetee") {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, color: theme.danger,
        background: theme.dangerBg, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700,
      }}>
        Demande rejetée
      </div>
    );
  }
  const idxActuel = ETAPES.findIndex((e) => e.value === statutActuel);
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
      {ETAPES.map((etape, i) => {
        const atteinte = i <= idxActuel;
        const courante = i === idxActuel;
        const dateEtape = formatDateEtape(demande[etape.dateKey]);
        return (
          <div key={etape.value} style={{ display: "flex", alignItems: "center", flex: i < ETAPES.length - 1 ? 1 : "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: atteinte ? theme.primary : theme.surface,
                border: `2px solid ${atteinte ? theme.primary : theme.border}`,
                color: atteinte ? "#fff" : theme.textMuted,
                boxShadow: courante ? `0 0 0 4px ${theme.primaryBg}` : "none",
                transition: "all 0.2s",
              }}>
                {atteinte ? <CheckIcon size={12} /> : <span style={{ fontSize: 10, fontWeight: 700 }}>{i + 1}</span>}
              </div>
              {!isMobile && (
                <>
                  <div style={{
                    fontSize: 10, fontWeight: courante ? 700 : 600, marginTop: 6, textAlign: "center",
                    color: atteinte ? theme.text : theme.textMuted, whiteSpace: "nowrap",
                  }}>
                    {etape.label}
                  </div>
                  {atteinte && dateEtape && (
                    <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 2, whiteSpace: "nowrap" }}>
                      {dateEtape}
                    </div>
                  )}
                </>
              )}
            </div>
            {i < ETAPES.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: isMobile ? "0 2px" : "0 4px -18px",
                background: i < idxActuel ? theme.primary : theme.border, transition: "all 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default function AttestationDetail() {
  const { ref } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  // SUPERADMIN toujours, ADMIN seulement si chargé des attestations — voir
  // User.can_manage_attestations et ProtectedRoute (App.js) qui bloque déjà
  // l'accès à cette page pour un ADMIN non chargé.
  const isAdmin = !!user?.can_manage_attestations;
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  const [demande, setDemande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchDemande = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/attestations/demandes/${ref}/`);
      setDemande(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemande(); }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const avancerStatut = async () => {
    const suivant = PROCHAIN_STATUT[demande.statut];
    if (!suivant) return;
    try {
      await api.patch(`/attestations/demandes/${ref}/statut/`, { statut: suivant.value });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || err.response?.data?.error || "Erreur lors du changement de statut.");
    }
  };

  const rejeter = async () => {
    const motifRejet = await prompt("Motif du rejet :", "");
    if (motifRejet === null || !motifRejet.trim()) return;
    try {
      await api.patch(`/attestations/demandes/${ref}/statut/`, { statut: "rejetee", motif_rejet: motifRejet });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || err.response?.data?.motif_rejet?.[0] || "Erreur lors du rejet.");
    }
  };

  const annuler = async () => {
    if (!(await confirm("Annuler cette demande ?"))) return;
    await api.delete(`/attestations/demandes/${ref}/`);
    navigate("/attestations");
  };

  const uploadScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("scan_document", file);
    await api.post(`/attestations/demandes/${ref}/scan/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    fetchDemande(true);
  };

  const ouvrirApercu = async () => {
    // Récupération du PDF via l'API (authentifiée, et proxifiée en dev —
    // une navigation directe vers /api/... atterrirait sur le routeur
    // React, le proxy CRA ne relayant pas les requêtes de navigation),
    // puis ouverture dans un onglet : le lecteur PDF du navigateur permet
    // d'imprimer et de télécharger directement.
    try {
      const res = await api.get(`/attestations/demandes/${ref}/apercu/`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
    } catch {
      setMessage("Impossible de générer le document.");
    }
  };

  if (loading || !demande) return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>Chargement...</div>
    </PageBackground>
  );

  const peutAnnuler = demande.demandeur === user?.id && demande.statut === "recue";
  const suivant = PROCHAIN_STATUT[demande.statut];
  const cardStyle = {
    background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd,
  };
  const btnBase = {
    display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, padding: "9px 16px",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: theme.fontFamily,
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Link to="/attestations" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>{demande.reference}</h1>
            <StatutBadge statut={demande.statut} />
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 800, margin: "0 auto" }}>
        <div style={{ ...cardStyle, padding: isMobile ? "20px 16px 28px" : "24px 32px 32px", marginBottom: 20 }}>
          <StatutStepper demande={demande} theme={theme} isMobile={isMobile} />
        </div>

        <div style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 18 }}>
            <Field label="Employé" value={demande.employee_nom} theme={theme} />
            <Field label="Demandeur" value={demande.demandeur_nom} theme={theme} />
            <Field label="Motif" value={demande.motif_nom} theme={theme} />
            {demande.contrat_numero && <Field label="Contrat" value={demande.contrat_numero} theme={theme} />}
            {demande.traite_par_nom && <Field label="Traité par" value={demande.traite_par_nom} theme={theme} />}
          </div>
          {demande.commentaire && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
              <Field label="Commentaire" value={demande.commentaire} theme={theme} />
            </div>
          )}
          {demande.motif_rejet && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
              <Field label="Motif de rejet" value={demande.motif_rejet} theme={theme} danger />
            </div>
          )}
        </div>

        {message && (
          <div style={{
            color: theme.danger, background: theme.dangerBg, borderRadius: 10, padding: "10px 14px",
            fontSize: 13, marginBottom: 16,
          }}>
            {message}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {isAdmin && (
            <button onClick={ouvrirApercu} className="btn-lift" style={{
              ...btnBase, background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`,
            }}>
              <EyeIcon size={15} /> Aperçu PDF / Imprimer
            </button>
          )}
          {isAdmin && suivant && (
            <button onClick={avancerStatut} className="btn-lift" style={{
              ...btnBase, background: theme.primary, color: "#fff", border: "none",
            }}>
              <CheckIcon size={13} /> {suivant.label}
            </button>
          )}
          {isAdmin && demande.statut !== "recuperee" && demande.statut !== "rejetee" && (
            <button onClick={rejeter} className="btn-lift" style={{
              ...btnBase, background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
            }}>
              Rejeter
            </button>
          )}
          {peutAnnuler && (
            <button onClick={annuler} className="btn-lift" style={{
              ...btnBase, background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
            }}>
              Annuler la demande
            </button>
          )}
        </div>

        {isAdmin && (
          <div style={{ ...cardStyle, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: theme.textMuted, marginBottom: 10 }}>
              Scan du document signé (optionnel)
            </div>
            <label className="btn-lift" style={{
              ...btnBase, background: theme.surface, color: theme.text, border: `1px dashed ${theme.border}`,
              cursor: "pointer",
            }}>
              <DownloadIcon size={14} /> Choisir un fichier
              <input type="file" accept="application/pdf,image/*" onChange={uploadScan} style={{ display: "none" }} />
            </label>
            {demande.scan_document && (
              <div style={{ marginTop: 10 }}>
                <a href={demande.scan_document} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontSize: 12, fontWeight: 600 }}>
                  Voir le scan déjà envoyé →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

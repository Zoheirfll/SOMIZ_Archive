import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";

const PROCHAIN_STATUT = {
  recue: { value: "imprimee", label: "Marquer Imprimée" },
  imprimee: { value: "signee", label: "Marquer Signée" },
  signee: { value: "prete", label: "Marquer Prête" },
  prete: { value: "recuperee", label: "Marquer Récupérée" },
};

export default function AttestationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  const [demande, setDemande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchDemande = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/attestations/demandes/${id}/`);
      setDemande(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemande(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const avancerStatut = async () => {
    const suivant = PROCHAIN_STATUT[demande.statut];
    if (!suivant) return;
    try {
      await api.patch(`/attestations/demandes/${id}/statut/`, { statut: suivant.value });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || err.response?.data?.error || "Erreur lors du changement de statut.");
    }
  };

  const rejeter = async () => {
    const motifRejet = await prompt("Motif du rejet :", "");
    if (motifRejet === null || !motifRejet.trim()) return;
    try {
      await api.patch(`/attestations/demandes/${id}/statut/`, { statut: "rejetee", motif_rejet: motifRejet });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || err.response?.data?.motif_rejet?.[0] || "Erreur lors du rejet.");
    }
  };

  const annuler = async () => {
    if (!(await confirm("Annuler cette demande ?"))) return;
    await api.delete(`/attestations/demandes/${id}/`);
    navigate("/attestations");
  };

  const uploadScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("scan_document", file);
    await api.post(`/attestations/demandes/${id}/scan/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    fetchDemande(true);
  };

  const ouvrirApercu = () => {
    window.open(`/api/attestations/demandes/${id}/apercu/`, "_blank");
  };

  if (loading || !demande) return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ textAlign: "center", padding: 40, color: theme.textSecondary }}>Chargement...</div>
    </PageBackground>
  );

  const peutAnnuler = demande.demandeur === user?.id && demande.statut === "recue";
  const suivant = PROCHAIN_STATUT[demande.statut];

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>{demande.reference}</h1>
        <div style={{ marginTop: 8 }}><StatutBadge statut={demande.statut} /></div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 700, margin: "0 auto" }}>
        <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 20, marginBottom: 16 }}>
          <p><strong>Employé :</strong> {demande.employee_nom}</p>
          <p><strong>Motif :</strong> {demande.motif}</p>
          {demande.commentaire && <p><strong>Commentaire :</strong> {demande.commentaire}</p>}
          <p><strong>Demandeur :</strong> {demande.demandeur_nom}</p>
          {demande.motif_rejet && <p style={{ color: theme.danger }}><strong>Motif de rejet :</strong> {demande.motif_rejet}</p>}
        </div>

        {message && <div style={{ color: theme.danger, marginBottom: 12 }}>{message}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && (
            <button onClick={ouvrirApercu} className="btn-lift" style={{
              background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Aperçu / Imprimer
            </button>
          )}
          {isAdmin && suivant && (
            <button onClick={avancerStatut} className="btn-lift" style={{
              background: theme.primary, color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              {suivant.label}
            </button>
          )}
          {isAdmin && demande.statut !== "recuperee" && demande.statut !== "rejetee" && (
            <button onClick={rejeter} className="btn-lift" style={{
              background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Rejeter
            </button>
          )}
          {peutAnnuler && (
            <button onClick={annuler} className="btn-lift" style={{
              background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Annuler la demande
            </button>
          )}
        </div>

        {isAdmin && (
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
              Scan du document signé (optionnel)
            </label>
            <input type="file" accept="application/pdf,image/*" onChange={uploadScan} style={{ display: "block", marginTop: 6 }} />
            {demande.scan_document && (
              <a href={demande.scan_document} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontSize: 12 }}>
                Voir le scan déjà envoyé
              </a>
            )}
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

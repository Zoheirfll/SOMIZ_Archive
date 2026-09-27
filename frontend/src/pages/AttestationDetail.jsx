import { useEffect, useRef, useState } from "react";
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
import { EyeIcon, CheckIcon, PrinterIcon } from "../components/icons";
import { formatDateFR } from "../utils/formatDate";
import Breadcrumb from "../components/employees/Breadcrumb";

// FileReader plutôt que Blob.text() (non implémentée par le polyfill Blob
// de jsdom utilisé par les tests Jest, alors que FileReader l'est) — pour
// lire le corps JSON d'une réponse 409 récupérée en `responseType: "blob"`
// (voir ouvrirApercu ci-dessous).
const lireBlobEnTexte = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsText(blob);
});

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

const Field = ({ label, value, sub, theme, danger }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textMuted, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ fontSize: 15, color: danger ? theme.danger : theme.text, fontWeight: 700 }}>
      {value || "—"}
    </div>
    {sub && (
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2, fontWeight: 500 }}>{sub}</div>
    )}
  </div>
);

const InfoCard = ({ title, children, theme }) => (
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 22, boxShadow: theme.shadowMd }}>
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>{title}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>
      {children}
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
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

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

  const ouvrirApercu = async (confirmerDate = false) => {
    // Le PDF est affiché directement dans la page (iframe sur une URL de
    // blob) plutôt que dans un nouvel onglet — une navigation directe vers
    // /api/... atterrirait de toute façon sur le routeur React (le proxy
    // CRA de dev ne relaie pas les requêtes de navigation), d'où le passage
    // par l'API en blob.
    setPdfLoading(true);
    setMessage("");
    try {
      const res = await api.get(`/attestations/demandes/${ref}/apercu/`, {
        responseType: "blob",
        params: confirmerDate ? { confirmer_date: 1 } : undefined,
      });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
      // date_document vient d'être figée (1er aperçu) ou reconfirmée par le
      // serveur — on rafraîchit la demande pour afficher la date exacte
      // sans recharger toute la page (voir le badge sous les boutons).
      fetchDemande(true);
    } catch (err) {
      // La date imprimée sur le document ("Arzew le :") se fige au premier
      // aperçu (voir attestations/views.py, AttestationApercuView) — entre
      // l'impression et la signature effective, un jour ou deux peuvent
      // s'écouler (imprimé le 23, signé le 24). Rouvrir l'aperçu un autre
      // jour renvoie donc 409 plutôt qu'un nouveau PDF silencieusement
      // daté différemment : on prévient avant de regénérer avec la
      // nouvelle date.
      if (err.response?.status === 409 && err.response.data instanceof Blob) {
        try {
          const payload = JSON.parse(await lireBlobEnTexte(err.response.data));
          if (payload.needs_confirmation) {
            const accepte = await confirm(
              `La date déjà imprimée sur ce document est le ${formatDateFR(payload.date_document)}. `
              + `Générer un nouvel aperçu la datera du ${formatDateFR(payload.date_nouvelle)} à la place. Continuer ?`,
            );
            if (accepte) {
              await ouvrirApercu(true);
            }
            return;
          }
        } catch {
          // payload illisible — retombe sur le message d'erreur générique
        }
      }
      setMessage("Impossible de générer le document.");
    } finally {
      setPdfLoading(false);
    }
  };

  const imprimerApercu = () => {
    iframeRef.current?.contentWindow?.print();
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
          <Breadcrumb
            variant="hero"
            items={[
              { label: "Attestations", onClick: () => navigate("/attestations") },
              { label: demande.reference },
            ]}
          />
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

        <div style={{ marginBottom: 16 }}>
          <InfoCard title={`Informations de l'employé — ${demande.employee_nom}`} theme={theme}>
            <Field label="Matricule" value={demande.employee_matricule} theme={theme} />
            <Field label="Date de naissance" value={formatDateFR(demande.employee_date_naissance)} theme={theme} />
            <Field label="Date de recrutement" value={formatDateFR(demande.employee_date_embauche)} theme={theme} />
            <Field label="Type de contrat" value={demande.employee_type_contrat_nom} theme={theme} />
            <Field label="Catégorie" value={demande.employee_categorie_nom} theme={theme} />
            <Field label="Fonction" value={demande.employee_poste_nom} theme={theme} />
            <Field label="Direction" value={demande.employee_direction_nom} theme={theme} />
            <Field label="Département" value={demande.employee_departement_nom} theme={theme} />
            <Field label="Service" value={demande.employee_service_nom} theme={theme} />
          </InfoCard>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16,
        }}>
          <InfoCard title="Détails de la demande" theme={theme}>
            <Field label="Motif" value={demande.motif_nom} theme={theme} />
            {demande.contrat_numero && <Field label="Contrat" value={demande.contrat_numero} theme={theme} />}
          </InfoCard>

          <InfoCard title="Suivi de la demande" theme={theme}>
            <Field
              label="Demandeur"
              value={demande.demandeur_nom}
              sub={demande.demandeur_role === "GESTIONNAIRE" && demande.demandeur_libelle_role
                ? demande.demandeur_libelle_role
                : demande.demandeur_role}
              theme={theme}
            />
            {demande.traite_par_nom && <Field label="Traité par" value={demande.traite_par_nom} theme={theme} />}
          </InfoCard>
        </div>

        {(demande.commentaire || demande.motif_rejet) && (
          <div style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
            {demande.commentaire && <Field label="Commentaire" value={demande.commentaire} theme={theme} />}
            {demande.motif_rejet && (
              <div style={{ marginTop: demande.commentaire ? 16 : 0, paddingTop: demande.commentaire ? 16 : 0, borderTop: demande.commentaire ? `1px solid ${theme.border}` : "none" }}>
                <Field label="Motif de rejet" value={demande.motif_rejet} theme={theme} danger />
              </div>
            )}
          </div>
        )}

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
            <button onClick={() => ouvrirApercu()} disabled={pdfLoading} className="btn-lift" style={{
              ...btnBase, background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`,
              opacity: pdfLoading ? 0.6 : 1,
            }}>
              <EyeIcon size={15} /> {pdfLoading ? "Génération..." : "Aperçu PDF"}
            </button>
          )}
          {isAdmin && pdfUrl && (
            <button onClick={imprimerApercu} className="btn-lift" style={{
              ...btnBase, background: theme.primary, color: "#fff", border: "none",
            }}>
              <PrinterIcon size={14} /> Imprimer
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

        {isAdmin && demande.date_document && (
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 16, marginTop: -12 }}>
            Aperçu généré et imprimable le {formatDateFR(demande.date_document)} — rouvrir l'aperçu un
            autre jour redemandera confirmation avant de changer cette date.
          </div>
        )}

        {isAdmin && pdfUrl && (
          <div style={{ ...cardStyle, padding: 12, marginBottom: 24 }}>
            <iframe
              ref={iframeRef}
              // #toolbar=0 masque la barre d'outils native du lecteur PDF
              // intégré (Chrome/Edge/Firefox honorent ce paramètre) — sans
              // ça, le lecteur affiche ses propres boutons Télécharger/
              // Imprimer, impossibles à retirer autrement en JS pur. Seul
              // le bouton "Imprimer" ci-dessus (contentWindow.print())
              // reste disponible.
              src={`${pdfUrl}#toolbar=0`}
              title="Aperçu de l'attestation"
              style={{ width: "100%", height: isMobile ? 480 : 720, border: "none", borderRadius: 10 }}
            />
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

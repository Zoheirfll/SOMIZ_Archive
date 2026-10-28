import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import CongeStatutBadge from "../components/conges/CongeStatutBadge";
import SoldesCard from "../components/conges/SoldesCard";
import ValiderModal from "../components/conges/ValiderModal";
import { AnnulerModal, InterrompreModal } from "../components/conges/ActionModals";
import ImportanceBadge from "../components/attestations/ImportanceBadge";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { EyeIcon, CheckIcon, PrinterIcon } from "../components/icons";
import { formatDateFR } from "../utils/formatDate";
import { TYPES_CONGE, libelleCategorie } from "../utils/conges";
import Breadcrumb from "../components/employees/Breadcrumb";

// FileReader plutôt que Blob.text() (non implémentée par jsdom) — lit le corps
// JSON d'une réponse 409 récupérée en `responseType: "blob"`.
const lireBlobEnTexte = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsText(blob);
});

const Field = ({ label, value, theme, danger }) => (
  <div>
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: theme.textMuted, marginBottom: 6 }}>
      {label}
    </div>
    <div style={{ fontSize: 15, color: danger ? theme.danger : theme.text, fontWeight: 700 }}>{value || "—"}</div>
  </div>
);

const InfoCard = ({ title, children, theme }) => (
  <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 22, boxShadow: theme.shadowMd }}>
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
      <span style={{ color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>{title}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 18 }}>{children}</div>
  </div>
);

const ETAPES = [
  { value: "recue", label: "Reçue", dateKey: "created_at" },
  { value: "prete", label: "Prête", dateKey: "date_prete" },
  { value: "recuperee", label: "Récupérée", dateKey: "date_recuperee" },
];

const STATUTS_HORS_PARCOURS = {
  rejetee: "Demande rejetée",
  annulee: "Titre annulé",
  interrompue: "Congé interrompu",
};

const formatDateEtape = (isoString) => {
  if (!isoString) return "";
  const dt = new Date(isoString);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const StatutStepper = ({ demande, theme, isMobile }) => {
  const horsParcours = STATUTS_HORS_PARCOURS[demande.statut];
  if (horsParcours) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 8, color: theme.danger,
        background: theme.dangerBg, borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700,
      }}>
        {horsParcours}
      </div>
    );
  }
  const idxActuel = ETAPES.findIndex((e) => e.value === demande.statut);
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
                    <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 2, whiteSpace: "nowrap" }}>{dateEtape}</div>
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

const ventilationTexte =(d) => (d.ventilation || [])
  .map((p) => `${p.jours} j sur ${p.exercice}`)
  .join(" · ");

const tailleTexte = (octets) => (octets >= 1048576 ? `${(octets / 1048576).toFixed(1)} Mo` : `${Math.ceil(octets / 1024)} Ko`);

export default function CongeDetail() {
  const { ref } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const avertissement = location.state?.avertissement;
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isTraiteur = !!user?.can_manage_conges;
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  const [demande, setDemande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [solde, setSolde] = useState(null);
  const [soldeInitialise, setSoldeInitialise] = useState(true);
  const [motifs, setMotifs] = useState([]);
  const [modale, setModale] = useState(null); // "valider" | "annuler" | "interrompre"
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const fetchDemande = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/conges/demandes/${ref}/`);
      setDemande(res.data);
      return res.data;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchSolde = async (matricule) => {
    try {
      const res = await api.get(`/conges/soldes/${matricule}/`);
      setSoldeInitialise(!!res.data?.initialise);
      setSolde(res.data?.solde || null);
    } catch {
      setSolde(null);
    }
  };

  useEffect(() => { fetchDemande(); }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps

  const matricule = demande?.employee_matricule;
  useEffect(() => {
    if (isTraiteur && matricule) fetchSolde(matricule);
  }, [isTraiteur, matricule]);

  const messageErreur = (err, defaut) => {
    const d = err.response?.data;
    return d?.error || d?.detail || d?.non_field_errors?.[0] || (d && Object.values(d)[0]?.[0]) || defaut;
  };

  const ouvrirApercu = async (confirmerDate = false) => {
    // PDF affiché dans la page (iframe sur une URL de blob), jamais par
    // navigation directe vers /api/... (le proxy de dev ne la relaie pas).
    setPdfLoading(true);
    setMessage("");
    try {
      const res = await api.get(`/conges/demandes/${ref}/apercu/`, {
        responseType: "blob",
        params: confirmerDate ? { confirmer_date: 1 } : undefined,
      });
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(new Blob([res.data], { type: "application/pdf" })));
      fetchDemande(true); // date_document vient d'être figée par le serveur
    } catch (err) {
      // La date imprimée se fige au premier aperçu : rouvrir un autre jour
      // renvoie 409, on prévient avant de régénérer avec la nouvelle date.
      if (err.response?.status === 409 && err.response.data instanceof Blob) {
        try {
          const payload = JSON.parse(await lireBlobEnTexte(err.response.data));
          if (payload.needs_confirmation) {
            const accepte = await confirm(
              `La date déjà imprimée sur ce document est le ${formatDateFR(payload.date_document)}. `
              + `Générer un nouvel aperçu la datera du ${formatDateFR(payload.date_nouvelle)} à la place. Continuer ?`,
            );
            if (accepte) await ouvrirApercu(true);
            return;
          }
        } catch {
          // payload illisible — retombe sur le message générique
        }
      }
      setMessage(messageErreur(err, "Impossible de générer le titre."));
    } finally {
      setPdfLoading(false);
    }
  };

  const ouvrirValidation = async () => {
    setModale("valider");
    if (!motifs.length) {
      try {
        const res = await api.get("/conges/motifs/");
        setMotifs(res.data?.results || res.data || []);
      } catch {
        setMessage("Impossible de charger les motifs de congé.");
      }
    }
  };

  // Retourne un message d'erreur (affiché dans la modale, qui reste ouverte)
  // ou null en cas de succès.
  const executer = async (url, corps, apres) => {
    try {
      await api.post(`/conges/demandes/${ref}/${url}/`, corps);
      setModale(null);
      await fetchDemande(true);
      if (matricule) await fetchSolde(matricule);
      if (apres) await apres();
      return null;
    } catch (err) {
      return messageErreur(err, "L'opération a échoué.");
    }
  };

  const valider = (payload) => executer("valider", payload, () => ouvrirApercu());
  const annulerTitre = (payload) => executer("annuler", payload);
  const interrompre = (payload) => executer("interrompre", payload);

  const rejeter = async () => {
    const motif = await prompt("Motif du rejet :", "");
    if (motif === null || !motif.trim()) return;
    const erreur = await executer("rejeter", { motif: motif.trim() });
    if (erreur) setMessage(erreur);
  };

  const marquerRecupere = async () => {
    const erreur = await executer("recuperee", {});
    if (erreur) setMessage(erreur);
  };

  const modifierObservations = async () => {
    const texte = await prompt("Observations :", demande.observations || "");
    if (texte === null) return;
    try {
      await api.patch(`/conges/demandes/${ref}/observations/`, { observations: texte });
      fetchDemande(true);
    } catch (err) {
      setMessage(messageErreur(err, "Impossible de modifier les observations."));
    }
  };

  // Pièce jointe servie par l'API (droits revérifiés, accès tracé), ouverte
  // depuis une URL de blob — jamais de lien direct vers le fichier.
  const ouvrirPiece = async (piece) => {
    setMessage("");
    try {
      const res = await api.get(`/conges/demandes/${ref}/pieces/${piece.id}/`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: piece.mime_type || "application/octet-stream" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setMessage(messageErreur(err, "Impossible d'ouvrir la pièce jointe."));
    }
  };

  const annulerDemande = async () => {
    if (!(await confirm("Annuler cette demande ?"))) return;
    await api.delete(`/conges/demandes/${ref}/`);
    navigate("/conges");
  };

  if (loading || !demande) return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>Chargement...</div>
    </PageBackground>
  );

  const d = demande;
  const statut = d.statut;
  const peutAnnulerDemande = d.demandeur === user?.id && statut === "recue";
  const apercuPossible = isTraiteur && !["recue", "rejetee"].includes(statut);
  // Date de retour atteinte : titre figé (règle appliquée aussi côté serveur).
  const titreModifiable = !d.conge_termine;
  // Type/motif/exercice sont proposés dès la demande : le titre n'est établi
  // qu'à la validation (validateur renseigné).
  const titreEtabli = !!d.validateur_nom;
  const libelleType = TYPES_CONGE.find((t) => t.value === d.type_conge)?.label || d.type_conge;
  const cardStyle = { background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd };
  const btn = {
    display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 9, padding: "9px 16px",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: theme.fontFamily,
  };
  const btnPrimaire = { ...btn, background: theme.primary, color: "#fff", border: "none" };
  const btnDanger = { ...btn, background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}` };
  const btnNeutre = { ...btn, background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}` };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Breadcrumb variant="hero" items={[{ label: "Congés", onClick: () => navigate("/conges") }, { label: d.reference }]} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>{d.reference}</h1>
            <CongeStatutBadge statut={statut} />
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ ...cardStyle, padding: isMobile ? "20px 16px 28px" : "24px 32px 32px" }}>
          <StatutStepper demande={d} theme={theme} isMobile={isMobile} />
        </div>

        <InfoCard title="Informations de l'employé" theme={theme}>
          <Field label="Nom et prénom" value={d.employee_nom} theme={theme} />
          <Field label="Matricule" value={d.employee_matricule} theme={theme} />
          <Field label="Fonction" value={d.employee_poste_nom} theme={theme} />
          <Field label="Date de recrutement" value={formatDateFR(d.employee_date_embauche)} theme={theme} />
          <Field label="Type de contrat" value={d.employee_type_contrat_nom} theme={theme} />
          <Field label="Direction" value={d.employee_direction_nom} theme={theme} />
          <Field label="Département" value={d.employee_departement_nom} theme={theme} />
          <Field label="Service" value={d.employee_service_nom} theme={theme} />
        </InfoCard>

        <InfoCard title="Demande" theme={theme}>
          <Field label="Date de départ" value={formatDateFR(d.date_depart)} theme={theme} />
          <Field label="Date de retour" value={formatDateFR(d.date_retour)} theme={theme} />
          <Field label="Nombre de jours" value={`${d.nb_jours} j`} theme={theme} />
          <Field label="Adresse durant le congé" value={d.adresse_conge} theme={theme} />
          <Field label="Importance" value={<ImportanceBadge importance={d.importance} />} theme={theme} />
          {d.contrat_numero && <Field label="Contrat" value={d.contrat_numero} theme={theme} />}
          <Field label="Demandeur" value={d.demandeur_nom} theme={theme} />
          {!titreEtabli && d.type_conge && <Field label="Type demandé" value={libelleType} theme={theme} />}
          {!titreEtabli && d.motif_nom && <Field label="Motif demandé" value={d.motif_nom} theme={theme} />}
          {!titreEtabli && d.exercice && <Field label="Exercice proposé" value={d.exercice} theme={theme} />}
          {d.commentaire && <Field label="Commentaire" value={d.commentaire} theme={theme} />}
        </InfoCard>

        {avertissement && (
          <div role="status" style={{ color: theme.warning, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
            {avertissement}
          </div>
        )}

        <div style={{ ...cardStyle, padding: 22 }}>
          <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary, fontSize: 13, fontWeight: 500 }}>
            Pièces justificatives
          </div>
          {(d.pieces_jointes || []).length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>Aucune pièce jointe.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {d.pieces_jointes.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ flex: 1, minWidth: 160, color: theme.text, fontSize: 13, fontWeight: 600 }}>
                    {p.libelle}
                    <span style={{ color: theme.textMuted, fontWeight: 400 }}> — {p.nom_fichier} ({tailleTexte(p.taille)})</span>
                  </span>
                  <button type="button" onClick={() => ouvrirPiece(p)} aria-label={`Ouvrir ${p.libelle}`} className="btn-lift" style={btnNeutre}>
                    <EyeIcon size={14} /> Ouvrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {titreEtabli && (
          <InfoCard title="Titre de congé" theme={theme}>
            <Field label="Type" value={libelleType} theme={theme} />
            <Field label="Motif" value={d.motif_nom} theme={theme} />
            <Field label="Exercice" value={d.exercice && `${d.exercice}${d.categorie_exercice ? ` (${libelleCategorie(d.categorie_exercice)})` : ""}`} theme={theme} />
            <Field label="Date d'établissement" value={formatDateFR(d.date_etablissement)} theme={theme} />
            {d.type_conge === "CP" && <Field label="Débit" value={ventilationTexte(d)} theme={theme} />}
            <Field label="Signataire" value={d.signataire_nom && `${d.signataire_nom}${d.signataire_interim ? " (intérim)" : ""}`} theme={theme} />
            <Field label="Validé par" value={d.validateur_nom} theme={theme} />
            <Field label="Observations" value={d.observations} theme={theme} />
          </InfoCard>
        )}

        {statut === "interrompue" && (
          <InfoCard title="Interruption" theme={theme}>
            <Field label="Date de rappel" value={formatDateFR(d.date_rappel)} theme={theme} />
            <Field label="Jours pris" value={`${d.jours_effectifs} j sur ${d.nb_jours} prévus`} theme={theme} />
            <Field label="Motif de l'interruption" value={d.motif_interruption} theme={theme} />
            <Field label="Par" value={d.interrompue_par_nom} theme={theme} />
          </InfoCard>
        )}

        {statut === "annulee" && (
          <InfoCard title="Annulation" theme={theme}>
            <Field label="Motif de l'annulation" value={d.motif_annulation} theme={theme} />
            <Field label="Par" value={d.annulee_par_nom} theme={theme} />
            <Field label="Le" value={formatDateFR(d.date_annulation)} theme={theme} />
          </InfoCard>
        )}

        {statut === "rejetee" && (
          <InfoCard title="Rejet" theme={theme}>
            <Field label="Motif de rejet" value={d.motif_rejet} theme={theme} danger />
          </InfoCard>
        )}

        {isTraiteur && <SoldesCard solde={solde} initialise={soldeInitialise} />}

        {message && (
          <div role="alert" style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
            {message}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isTraiteur && statut === "recue" && (
            <button onClick={ouvrirValidation} className="btn-lift" style={btnPrimaire}><CheckIcon size={13} /> Valider</button>
          )}
          {apercuPossible && (
            <button onClick={() => ouvrirApercu()} disabled={pdfLoading} className="btn-lift" style={{ ...btnNeutre, opacity: pdfLoading ? 0.6 : 1 }}>
              <EyeIcon size={15} /> {pdfLoading ? "Génération..." : "Aperçu PDF"}
            </button>
          )}
          {apercuPossible && pdfUrl && (
            <button onClick={() => iframeRef.current?.contentWindow?.print()} className="btn-lift" style={btnPrimaire}>
              <PrinterIcon size={14} /> Imprimer
            </button>
          )}
          {isTraiteur && statut === "prete" && (
            <button onClick={marquerRecupere} className="btn-lift" style={btnPrimaire}>Marquer récupéré</button>
          )}
          {isTraiteur && titreModifiable && ["prete", "recuperee"].includes(statut) && (
            <button onClick={() => setModale("interrompre")} className="btn-lift" style={btnNeutre}>Interrompre le congé</button>
          )}
          {isTraiteur && ["recue", "prete", "recuperee"].includes(statut) && (
            <button onClick={modifierObservations} className="btn-lift" style={btnNeutre}>Observations</button>
          )}
          {isTraiteur && titreModifiable && ["prete", "recuperee"].includes(statut) && (
            <button onClick={() => setModale("annuler")} className="btn-lift" style={btnDanger}>Annuler le titre</button>
          )}
          {isTraiteur && (statut === "recue" || (statut === "prete" && titreModifiable)) && (
            <button onClick={rejeter} className="btn-lift" style={btnDanger}>Rejeter</button>
          )}
          {peutAnnulerDemande && (
            <button onClick={annulerDemande} className="btn-lift" style={btnDanger}>Annuler la demande</button>
          )}
        </div>

        {isTraiteur && d.conge_termine && ["prete", "recuperee"].includes(statut) && (
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            Congé terminé (date de retour atteinte) : le titre ne peut plus être annulé, interrompu ni rejeté.
          </div>
        )}

        {apercuPossible && d.date_document && (
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            Titre imprimable daté du {formatDateFR(d.date_document)} — rouvrir l'aperçu un autre jour redemandera confirmation avant de changer cette date.
          </div>
        )}

        {apercuPossible && pdfUrl && (
          <div style={{ ...cardStyle, padding: 12 }}>
            <iframe
              ref={iframeRef}
              src={`${pdfUrl}#toolbar=0`}
              title="Aperçu du titre de congé"
              style={{ width: "100%", height: isMobile ? 480 : 720, border: "none", borderRadius: 10 }}
            />
          </div>
        )}
      </div>

      {modale === "valider" && (
        <ValiderModal demande={d} solde={solde} motifs={motifs} onClose={() => setModale(null)} onSubmit={valider} />
      )}
      {modale === "annuler" && <AnnulerModal demande={d} onClose={() => setModale(null)} onSubmit={annulerTitre} />}
      {modale === "interrompre" && <InterrompreModal demande={d} onClose={() => setModale(null)} onSubmit={interrompre} />}
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

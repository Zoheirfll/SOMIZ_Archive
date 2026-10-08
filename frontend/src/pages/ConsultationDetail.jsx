import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import Breadcrumb from "../components/employees/Breadcrumb";
import SecureDocViewer from "../components/SecureDocViewer";
import ImportanceBadge from "../components/attestations/ImportanceBadge";
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import TraiterPanel from "../components/consultations/TraiterPanel";
import { Field, InfoCard, ConsultationStepper } from "../components/consultations/DetailParts";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import { formatDateFR } from "../utils/formatDate";
import DureeSelect from "../components/consultations/DureeSelect";
import { formatDateHeure, formatDuree, tempsRestant } from "../utils/consultations";

export default function ConsultationDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  // SUPERADMIN toujours, ADMIN seulement si chargé des consultations — voir
  // User.can_manage_consultations et ProtectedRoute (App.js).
  const isAdmin = !!user?.can_manage_consultations;
  const [demande, setDemande] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fichierId, setFichierId] = useState(null);
  const [vue, setVue] = useState(null); // { url, mime, nom }
  const [dureeProlongation, setDureeProlongation] = useState(24);
  const urlCourante = useRef(null);

  const charger = useCallback(async () => {
    try {
      const res = await api.get(`/consultations/demandes/${ref}/`);
      setDemande(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger la demande.");
    }
  }, [ref]);

  useEffect(() => { charger(); }, [charger]);

  const consultable = demande?.statut_effectif === "validee" && (demande.fichiers || []).length > 0;

  // Fichier affiché : celui choisi, sinon le premier — calculé au rendu (et non
  // par un effet) pour qu'aucun bouton ne puisse agir sur un fichier « null »
  // pendant l'instant qui suit l'affichage de la page.
  const fichierActifId = consultable
    ? (demande.fichiers.some((f) => f.id === fichierId) ? fichierId : demande.fichiers[0].id)
    : null;

  // Charge le fichier sélectionné en blob authentifié (jamais de lien direct).
  useEffect(() => {
    if (!consultable || !fichierActifId) { setVue(null); return undefined; }
    const fichier = demande.fichiers.find((f) => f.id === fichierActifId);
    if (!fichier) return undefined;
    let annule = false;
    api.get(`/consultations/demandes/${ref}/fichiers/${fichierActifId}/voir/`, { responseType: "blob" })
      .then((res) => {
        if (annule) return;
        const url = URL.createObjectURL(res.data);
        if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
        urlCourante.current = url;
        setVue({ url, mime: res.data.type || fichier.mime_type, nom: fichier.file_name });
      })
      .catch(() => { if (!annule) { setVue(null); charger(); } }); // 403 : probablement expirée entre-temps
    return () => { annule = true; };
  }, [consultable, fichierActifId, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (urlCourante.current) URL.revokeObjectURL(urlCourante.current); }, []);

  const telecharger = async () => {
    setMessage("");
    try {
      const res = await api.get(`/consultations/demandes/${ref}/fichiers/${fichierActifId}/telecharger/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = vue?.nom || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage("Téléchargement impossible : la consultation a peut-être expiré.");
      charger();
    }
  };

  // Le serveur donne le feu vert (droit accordé, consultation ouverte) et
  // trace l'impression AVANT l'ouverture de la boîte d'impression. La copie
  // imprimée est celle déjà chargée : filigranée pour un demandeur.
  const imprimer = async () => {
    setMessage("");
    try {
      await api.post(`/consultations/demandes/${ref}/fichiers/${fichierActifId}/imprimer/`);
    } catch (err) {
      setMessage(err.response?.data?.detail || "Impression refusée.");
      charger();
      return;
    }
    if (!vue?.url) return;
    const cadre = document.createElement("iframe");
    cadre.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    cadre.src = vue.url;
    cadre.onload = () => {
      try {
        cadre.contentWindow.focus();
        cadre.contentWindow.print();
      } finally {
        setTimeout(() => cadre.remove(), 60000);
      }
    };
    document.body.appendChild(cadre);
  };

  const agir = async (action, corps = {}) => {
    setMessage("");
    try {
      await api.post(`/consultations/demandes/${ref}/${action}/`, corps);
      await charger(); // rafraîchissement silencieux : la page ne se démonte pas
    } catch (err) {
      const data = err.response?.data;
      setMessage(
        data?.detail || data?.error || [].concat(data?.duree_heures || data?.non_field_errors || [])[0] ||
        (Array.isArray(data) ? data[0] : null) || "Action impossible.",
      );
    }
  };

  const revoquer = async () => {
    const saisie = await prompt(
      `Révoquer coupe immédiatement l'accès du demandeur. Saisissez la référence ${demande.reference} pour confirmer :`, "",
    );
    if (saisie === null) return;
    if (saisie.trim() !== demande.reference) {
      setMessage("La référence saisie ne correspond pas : révocation annulée.");
      return;
    }
    await agir("revoquer");
  };

  const annuler = async () => {
    if (!(await confirm("Annuler cette demande ?"))) return;
    setMessage("");
    try {
      await api.delete(`/consultations/demandes/${ref}/`);
      navigate("/consultations");
    } catch (err) {
      setMessage(err.response?.data?.detail || "Impossible d'annuler la demande.");
    }
  };

  if (error) {
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: contentPadding(isMobile), maxWidth: 800, margin: "0 auto", color: theme.danger }}>{error}</div>
      </PageBackground>
    );
  }
  if (!demande) {
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ textAlign: "center", padding: 60, color: theme.textSecondary }}>Chargement...</div>
      </PageBackground>
    );
  }

  const peutAnnuler = demande.demandeur === user?.id && demande.statut === "en_cours";
  // Avant validation : ce que le demandeur SOUHAITE ; après : ce qui est ACCORDÉ
  // (avec la mention d'une éventuelle modification par le traiteur).
  const droit = (accorde, souhaite) => {
    if (!demande.date_validation) return { value: souhaite ? "Souhaité" : "Non souhaité" };
    return {
      value: accorde ? "Autorisé" : "Non autorisé",
      sub: accorde !== souhaite ? `Souhaité : ${souhaite ? "oui" : "non"} — modifié par le traiteur` : undefined,
    };
  };
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
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <Breadcrumb
            variant="hero"
            items={[{ label: "Consultations", onClick: () => navigate("/consultations") }, { label: demande.reference }]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>{demande.reference}</h1>
            <StatutConsultationBadge statut={demande.statut_effectif} />
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 800, margin: "0 auto" }}>
        <div style={{ ...cardStyle, padding: isMobile ? "20px 16px 28px" : "24px 32px 32px", marginBottom: 20 }}>
          <ConsultationStepper demande={demande} theme={theme} isMobile={isMobile} />
          {demande.statut_effectif === "validee" && (
            <div style={{ textAlign: "center", marginTop: 26, fontSize: 13, color: theme.primary, fontWeight: 700 }}>
              Expire dans {tempsRestant(demande.date_echeance)}
            </div>
          )}
        </div>

        {demande.employee && (
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
        )}

        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16,
        }}>
          <InfoCard title="Détails de la demande" theme={theme}>
            <Field label="Type" value={demande.type_demande_label} theme={theme} />
            <Field label="Importance" value={<ImportanceBadge importance={demande.importance} />} theme={theme} />
            <Field label="Durée souhaitée" value={formatDuree(demande.duree_souhaitee_heures)} theme={theme} />
            {demande.duree_accordee_heures != null && (
              <Field
                label="Durée accordée"
                value={formatDuree(demande.duree_accordee_heures)}
                sub={demande.duree_accordee_heures !== demande.duree_souhaitee_heures ? "Modifiée par le traiteur" : undefined}
                theme={theme}
              />
            )}
            <Field
              label="Téléchargement"
              value={droit(demande.telechargement_autorise, demande.telechargement_souhaite).value}
              sub={droit(demande.telechargement_autorise, demande.telechargement_souhaite).sub}
              theme={theme}
            />
            <Field
              label="Impression"
              value={droit(demande.impression_autorisee, demande.impression_souhaitee).value}
              sub={droit(demande.impression_autorisee, demande.impression_souhaitee).sub}
              theme={theme}
            />
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
            {demande.date_validation && (
              <Field label="Validée le" value={formatDateHeure(demande.date_validation)} theme={theme} />
            )}
            {demande.date_echeance && (
              <Field
                label="Échéance"
                value={formatDateHeure(demande.date_echeance)}
                sub={demande.nb_prolongations > 0 ? `Prolongée ${demande.nb_prolongations} fois` : undefined}
                theme={theme}
              />
            )}
          </InfoCard>
        </div>

        <div style={{ ...cardStyle, padding: 22, marginBottom: 16 }}>
          <Field label="Description" value={demande.description} theme={theme} />
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24, alignItems: "center" }}>
          {isAdmin && demande.statut === "validee" && (
            <>
              <DureeSelect
                ariaLabel="Durée de prolongation"
                value={dureeProlongation}
                onChange={setDureeProlongation}
              />
              <button
                type="button" onClick={() => agir("prolonger", { duree_heures: dureeProlongation })}
                className="btn-lift"
                style={{ ...btnBase, background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}` }}
              >
                Prolonger
              </button>
              {demande.statut_effectif === "validee" && (
                <button
                  type="button" onClick={revoquer} className="btn-lift"
                  style={{ ...btnBase, background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}` }}
                >
                  Révoquer
                </button>
              )}
            </>
          )}
          {peutAnnuler && (
            <button
              type="button" onClick={annuler} className="btn-lift"
              style={{ ...btnBase, background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}` }}
            >
              Annuler la demande
            </button>
          )}
        </div>

        {isAdmin && demande.statut === "en_cours" && (
          <div style={{ marginBottom: 24 }}>
            <TraiterPanel demande={demande} onDone={charger} />
          </div>
        )}

        {demande.statut_effectif === "expiree" && !isAdmin && (
          <div style={{ ...cardStyle, padding: 22, marginBottom: 24, color: theme.textSecondary, textAlign: "center" }}>
            Consultation expirée le {formatDateHeure(demande.date_echeance)}. Le document n'est plus consultable.
          </div>
        )}

        {consultable && (
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${theme.border}` }}>
              {demande.fichiers.map((f) => (
                <button
                  key={f.id} type="button" onClick={() => setFichierId(f.id)}
                  style={{ background: f.id === fichierActifId ? theme.primaryBg : theme.surface, color: f.id === fichierActifId ? theme.primary : theme.textSecondary, border: `1px solid ${f.id === fichierActifId ? theme.primaryBorder : theme.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {f.file_name}
                </button>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {(demande.impression_autorisee || isAdmin) && (
                  <button type="button" onClick={imprimer} style={{ background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Imprimer
                  </button>
                )}
                {(demande.telechargement_autorise || isAdmin) && (
                  <button type="button" onClick={telecharger} style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Télécharger
                  </button>
                )}
              </div>
            </div>
            <div style={{ height: isMobile ? 480 : 720, display: "flex" }}>
              {vue ? (
                <SecureDocViewer url={vue.url} mimeType={vue.mime} fileName={vue.nom} />
              ) : (
                <div style={{ margin: "auto", color: theme.textSecondary, fontSize: 13 }}>Chargement du document…</div>
              )}
            </div>
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

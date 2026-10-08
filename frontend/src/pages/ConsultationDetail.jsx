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
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import TraiterPanel from "../components/consultations/TraiterPanel";
import { usePrompt } from "../components/ConfirmDialog";
import { DUREES, formatDateHeure, tempsRestant } from "../utils/consultations";

const Ligne = ({ label, children, theme }) => (
  <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 13 }}>
    <div style={{ width: 150, flexShrink: 0, color: theme.textSecondary, fontWeight: 600 }}>{label}</div>
    <div style={{ color: theme.text, minWidth: 0, overflowWrap: "anywhere" }}>{children || "—"}</div>
  </div>
);

const Etape = ({ titre, date, atteinte, theme }) => (
  <div style={{ flex: 1, textAlign: "center" }}>
    <div style={{
      width: 26, height: 26, margin: "0 auto 6px", borderRadius: "50%",
      background: atteinte ? theme.primary : theme.surface,
      border: `2px solid ${atteinte ? theme.primary : theme.border}`,
    }} />
    <div style={{ fontSize: 11, fontWeight: 700, color: atteinte ? theme.text : theme.textMuted }}>{titre}</div>
    <div style={{ fontSize: 11, color: theme.textSecondary }}>{date ? formatDateHeure(date) : "—"}</div>
  </div>
);

export default function ConsultationDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { prompt, PromptDialog } = usePrompt();
  const estTraiteur = !!user?.can_manage_consultations;
  const [demande, setDemande] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
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

  // Sélectionne le premier fichier dès que la consultation est ouverte.
  useEffect(() => {
    if (consultable && !fichierId) setFichierId(demande.fichiers[0].id);
    if (!consultable) setFichierId(null);
  }, [consultable, demande, fichierId]);

  // Charge le fichier sélectionné en blob authentifié (jamais de lien direct).
  useEffect(() => {
    if (!consultable || !fichierId) { setVue(null); return undefined; }
    const fichier = demande.fichiers.find((f) => f.id === fichierId);
    if (!fichier) return undefined;
    let annule = false;
    api.get(`/consultations/demandes/${ref}/fichiers/${fichierId}/voir/`, { responseType: "blob" })
      .then((res) => {
        if (annule) return;
        const url = URL.createObjectURL(res.data);
        if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
        urlCourante.current = url;
        setVue({ url, mime: res.data.type || fichier.mime_type, nom: fichier.file_name });
      })
      .catch(() => { if (!annule) { setVue(null); charger(); } }); // 403 : probablement expirée entre-temps
    return () => { annule = true; };
  }, [consultable, fichierId, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (urlCourante.current) URL.revokeObjectURL(urlCourante.current); }, []);

  const telecharger = async () => {
    setActionError("");
    try {
      const res = await api.get(`/consultations/demandes/${ref}/fichiers/${fichierId}/telecharger/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = vue?.nom || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Téléchargement impossible : la consultation a peut-être expiré.");
      charger();
    }
  };

  const agir = async (action, corps = {}) => {
    setActionError("");
    try {
      await api.post(`/consultations/demandes/${ref}/${action}/`, corps);
      await charger(); // rafraîchissement silencieux : la page ne se démonte pas
    } catch (err) {
      const data = err.response?.data;
      setActionError(
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
      setActionError("La référence saisie ne correspond pas : révocation annulée.");
      return;
    }
    await agir("revoquer");
  };

  const annuler = async () => {
    setActionError("");
    try {
      await api.delete(`/consultations/demandes/${ref}/`);
      navigate("/consultations");
    } catch (err) {
      setActionError(err.response?.data?.detail || "Impossible d'annuler la demande.");
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
        <div style={{ padding: contentPadding(isMobile), color: theme.textSecondary }}>Chargement…</div>
      </PageBackground>
    );
  }

  const peutAnnuler = !estTraiteur && demande.statut === "en_cours";
  const carte = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, boxShadow: theme.shadow, marginBottom: 16 };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      {PromptDialog}
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
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

      <div style={{ padding: contentPadding(isMobile), maxWidth: 900, margin: "0 auto" }}>
        <div style={carte}>
          <div style={{ display: "flex" }}>
            <Etape titre="Demande" date={demande.created_at} atteinte theme={theme} />
            <Etape titre="Validation" date={demande.date_validation} atteinte={!!demande.date_validation} theme={theme} />
            <Etape titre="Échéance" date={demande.date_echeance} atteinte={demande.statut_effectif === "expiree"} theme={theme} />
          </div>
          {demande.statut_effectif === "validee" && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: theme.primary, fontWeight: 700 }}>
              Expire dans {tempsRestant(demande.date_echeance)}
            </div>
          )}
          {demande.statut === "rejetee" && (
            <div style={{ marginTop: 12, color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
              Demande rejetée{demande.motif_rejet ? ` : ${demande.motif_rejet}` : "."}
            </div>
          )}
          {demande.statut === "revoquee" && (
            <div style={{ marginTop: 12, color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
              Consultation révoquée.
            </div>
          )}
        </div>

        <div style={carte}>
          <Ligne label="Type" theme={theme}>{demande.type_demande_label}</Ligne>
          <Ligne label="Description" theme={theme}>{demande.description}</Ligne>
          {demande.employee_nom && <Ligne label="Employé" theme={theme}>{demande.employee_nom} ({demande.employee_matricule})</Ligne>}
          <Ligne label="Demandeur" theme={theme}>{demande.demandeur_nom}</Ligne>
          <Ligne label="Traitée par" theme={theme}>{demande.traite_par_nom}</Ligne>
          <Ligne label="Date de validation" theme={theme}>{demande.date_validation && formatDateHeure(demande.date_validation)}</Ligne>
          <Ligne label="Échéance" theme={theme}>
            {demande.date_echeance && formatDateHeure(demande.date_echeance)}
            {demande.nb_prolongations > 0 && ` (prolongée ${demande.nb_prolongations} fois)`}
          </Ligne>
        </div>

        {actionError && (
          <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
            {actionError}
          </div>
        )}

        {peutAnnuler && (
          <button type="button" onClick={annuler} style={{ background: theme.surface, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
            Annuler ma demande
          </button>
        )}

        {estTraiteur && demande.statut === "en_cours" && <TraiterPanel demande={demande} onDone={charger} />}

        {demande.statut === "validee" && estTraiteur && (
          <div style={{ ...carte, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select aria-label="Durée de prolongation" value={dureeProlongation} onChange={(e) => setDureeProlongation(Number(e.target.value))} style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13 }}>
              {DUREES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button type="button" onClick={() => agir("prolonger", { duree_heures: dureeProlongation })} style={{ background: theme.primaryBg, color: theme.primary, border: `1px solid ${theme.primaryBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Prolonger
            </button>
            {demande.statut_effectif === "validee" && (
              <button type="button" onClick={revoquer} style={{ background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Révoquer
              </button>
            )}
          </div>
        )}

        {demande.statut_effectif === "expiree" && !estTraiteur && (
          <div style={{ ...carte, color: theme.textSecondary, textAlign: "center" }}>
            Consultation expirée le {formatDateHeure(demande.date_echeance)}. Le document n'est plus consultable.
          </div>
        )}

        {consultable && (
          <div style={{ ...carte, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${theme.border}` }}>
              {demande.fichiers.map((f) => (
                <button
                  key={f.id} type="button" onClick={() => setFichierId(f.id)}
                  style={{ background: f.id === fichierId ? theme.primaryBg : theme.surface, color: f.id === fichierId ? theme.primary : theme.textSecondary, border: `1px solid ${f.id === fichierId ? theme.primaryBorder : theme.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {f.file_name}
                </button>
              ))}
              {(demande.telechargement_autorise || estTraiteur) && (
                <button type="button" onClick={telecharger} style={{ marginLeft: "auto", background: theme.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Télécharger
                </button>
              )}
            </div>
            <div style={{ height: isMobile ? 480 : 640, display: "flex" }}>
              {vue ? (
                <SecureDocViewer url={vue.url} mimeType={vue.mime} fileName={vue.nom} />
              ) : (
                <div style={{ margin: "auto", color: theme.textSecondary, fontSize: 13 }}>Chargement du document…</div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageBackground>
  );
}

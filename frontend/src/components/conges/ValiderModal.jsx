import { useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import {
  ModalShell, BoutonsModale, MessageErreur, champStyle, etiquetteStyle,
} from "./ActionModals";
import ExerciceSelect from "./ExerciceSelect";
import { TYPES_CONGE, ajouterJours, calculerVentilation, exerciceParDefaut } from "../../utils/conges";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Validation d'une demande par le traiteur : type, motif et exercice arrivent
// préremplis depuis la demande et restent corrigeables ; le signataire vient
// de la configuration. Il voit le débit par exercice avant de valider. Le
// serveur reste l'unique juge.
export default function ValiderModal({ demande, solde, motifs, onClose, onSubmit }) {
  const theme = useTheme();
  const exercices = solde?.exercices;
  const [typeConge, setTypeConge] = useState(demande.type_conge || "CP");
  const [motifId, setMotifId] = useState(demande.motif ? String(demande.motif) : "");
  const [dateEtab, setDateEtab] = useState(aujourdhui());
  const [nbJours, setNbJours] = useState(String(demande.nb_jours));
  const [dateDepart, setDateDepart] = useState(demande.date_depart);
  const [dateRetour, setDateRetour] = useState(demande.date_retour);
  const [exercice, setExercice] = useState(demande.exercice || exerciceParDefaut(exercices));
  const [adresse, setAdresse] = useState(demande.adresse_conge || "");
  const [observations, setObservations] = useState(demande.observations || "");
  const [reference, setReference] = useState(demande.reference);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);

  // Motifs actifs du type + le motif choisi par le demandeur, même désactivé
  // depuis (pour qu'il reste visible ; le serveur refusera un motif inactif).
  const motifsDuType = useMemo(
    () => (motifs || []).filter((m) => m.type_conge === typeConge && (m.is_active || String(m.id) === motifId)),
    [motifs, typeConge, motifId],
  );
  const motif = (motifs || []).find((m) => String(m.id) === motifId);
  const dureeFixe = motif?.nb_jours_fixe || null;
  const ventilation = typeConge === "CP" ? calculerVentilation(exercices, nbJours, exercice) : null;
  const champ = champStyle(theme);
  const champVerrouille = { ...champ, background: theme.bg, color: theme.textSecondary };
  const etiquette = etiquetteStyle(theme);

  const changerMotif = (valeur) => {
    setMotifId(valeur);
    const choisi = (motifs || []).find((m) => String(m.id) === valeur);
    if (choisi?.nb_jours_fixe) {
      setNbJours(String(choisi.nb_jours_fixe));
      setDateRetour(ajouterJours(dateDepart, choisi.nb_jours_fixe));
    }
  };

  const changerDepart = (valeur) => {
    setDateDepart(valeur);
    if (dureeFixe) setDateRetour(ajouterJours(valeur, dureeFixe));
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur("");
    if (!motifId) { setErreur("Choisissez un motif."); return; }
    const payload = {
      type_conge: typeConge, motif: Number(motifId), date_etablissement: dateEtab,
      nb_jours: Number(nbJours), date_depart: dateDepart, date_retour: dateRetour,
      exercice: typeConge === "CP" ? exercice : "", adresse_conge: adresse.trim(), observations,
    };
    if (reference.trim() !== demande.reference) payload.reference = reference.trim();
    setEnvoi(true);
    const resultat = await onSubmit(payload);
    setEnvoi(false);
    if (resultat) setErreur(resultat);
  };

  return (
    <ModalShell titre={`Valider la demande ${demande.reference}`} onClose={onClose} largeur={560}>
      <form onSubmit={soumettre}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <div>
            <label htmlFor="val-type" style={etiquette}>Type de congé</label>
            <select id="val-type" value={typeConge} onChange={(e) => { setTypeConge(e.target.value); setMotifId(""); }} style={champ}>
              {TYPES_CONGE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="val-motif" style={etiquette}>Motif</label>
            <select id="val-motif" value={motifId} onChange={(e) => changerMotif(e.target.value)} style={champ}>
              <option value="">-- Sélectionner --</option>
              {motifsDuType.map((m) => (
                <option key={m.id} value={m.id}>{m.nom}{m.nb_jours_fixe ? ` (${m.nb_jours_fixe} j)` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="val-depart" style={etiquette}>Date de départ</label>
            <input id="val-depart" type="date" value={dateDepart} onChange={(e) => changerDepart(e.target.value)} style={champ} />
          </div>
          <div>
            <label htmlFor="val-retour" style={etiquette}>Date de retour</label>
            <input id="val-retour" type="date" value={dateRetour} readOnly={Boolean(dureeFixe)}
              onChange={(e) => setDateRetour(e.target.value)} style={dureeFixe ? champVerrouille : champ} />
          </div>
          <div>
            <label htmlFor="val-jours" style={etiquette}>Nombre de jours</label>
            <input id="val-jours" type="number" min="1" value={nbJours} readOnly={Boolean(dureeFixe)}
              onChange={(e) => setNbJours(e.target.value)} style={dureeFixe ? champVerrouille : champ} />
          </div>
          <div>
            <label htmlFor="val-exercice" style={etiquette}>Exercice</label>
            {typeConge === "CP" && exercices ? (
              <ExerciceSelect id="val-exercice" exercices={exercices} value={exercice} onChange={setExercice} style={champ} />
            ) : (
              <input id="val-exercice" value={typeConge === "CP" ? "—" : "Sans objet"} readOnly style={champVerrouille} />
            )}
          </div>
          <div>
            <label htmlFor="val-etab" style={etiquette}>Date d'établissement</label>
            <input id="val-etab" type="date" value={dateEtab} onChange={(e) => setDateEtab(e.target.value)} style={champ} />
          </div>
          <div>
            <label htmlFor="val-ref" style={etiquette}>Référence</label>
            <input id="val-ref" value={reference} onChange={(e) => setReference(e.target.value)} style={champ} />
          </div>
        </div>
        <label htmlFor="val-adresse" style={etiquette}>Adresse durant le congé</label>
        <input id="val-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} style={champ} />
        <label htmlFor="val-obs" style={etiquette}>Observations</label>
        <textarea id="val-obs" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} style={{ ...champ, resize: "vertical" }} />

        <div style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 13, color: theme.text }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textMuted, marginBottom: 6 }}>Aperçu du débit</div>
          {typeConge === "CE" && <div>Congé exceptionnel : aucun jour n'est débité.</div>}
          {typeConge === "CS" && <div>Congé sans solde : {nbJours || 0} j ajoutés au retrait CS, aucun exercice débité.</div>}
          {typeConge === "CP" && !solde && (
            <div style={{ color: theme.danger }}>Soldes non initialisés : le serveur refusera cette validation.</div>
          )}
          {typeConge === "CP" && solde && !ventilation && <div>Renseignez le nombre de jours.</div>}
          {ventilation?.parts.map((p) => (
            <div key={p.exercice}>{p.jours} j sur l'exercice {p.exercice}</div>
          ))}
          {ventilation?.erreur && <div style={{ color: theme.danger, marginTop: 4 }}>{ventilation.erreur}</div>}
        </div>

        <MessageErreur texte={erreur} />
        <BoutonsModale onClose={onClose} libelle="Valider et générer le titre" envoi={envoi} />
      </form>
    </ModalShell>
  );
}

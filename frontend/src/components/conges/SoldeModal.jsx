import { useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import {
  ModalShell, BoutonsModale, MessageErreur, champStyle, etiquetteStyle,
} from "./ActionModals";
import { exercicePour, libelleCategorie } from "../../utils/conges";

const COMPTEURS = [
  { cle: "droit_initial", label: "Droit initial" },
  { cle: "cp_consomme", label: "CP consommés" },
];

const decaler = (exercice, n) => {
  const debut = Number(exercice.split("/")[0]) + n;
  return `${debut}/${debut + 1}`;
};

// Exercices proposés : ceux du solde (correction) ou, à l'initialisation,
// l'exercice précédent (reliquat), l'exercice en cours et l'anticipé.
const exercicesInitiaux = (solde) => {
  if (solde?.exercices?.length) return solde.exercices.map((e) => ({ exercice: e.exercice, categorie: e.categorie, restant: e.restant }));
  const courant = exercicePour(new Date().toISOString().slice(0, 10));
  return [
    { exercice: decaler(courant, -1), categorie: "RELIQUAT" },
    { exercice: courant, categorie: "ACTUEL" },
    { exercice: decaler(courant, 1), categorie: "ANTICIPE" },
  ];
};

// Saisie du solde de départ (une seule fois par employé, en jours RESTANTS par
// exercice) ou correction ultérieure (variations signées, motif obligatoire,
// historisée côté serveur). Un exercice antérieur peut être ajouté.
export default function SoldeModal({ matricule, initialise, solde, onClose, onDone }) {
  const theme = useTheme();
  const [lignes, setLignes] = useState(() => exercicesInitiaux(solde));
  const [valeurs, setValeurs] = useState({});
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const champ = champStyle(theme);
  const etiquette = etiquetteStyle(theme);

  const ajouterAnterieur = () => {
    const plusAncien = lignes[0]?.exercice || exercicePour(new Date().toISOString().slice(0, 10));
    setLignes([{ exercice: decaler(plusAncien, -1), categorie: "RELIQUAT" }, ...lignes]);
  };

  const nombre = (cle) => {
    const v = valeurs[cle];
    return v === undefined || v === "" ? 0 : Number(v);
  };

  const soumettre = async (e) => {
    e.preventDefault();
    setErreur("");
    const exercices = {};
    lignes.forEach(({ exercice }) => {
      const n = nombre(exercice);
      if (initialise ? n !== 0 : valeurs[exercice] !== undefined && valeurs[exercice] !== "") exercices[exercice] = n;
    });
    const corps = { exercices };
    COMPTEURS.forEach(({ cle }) => { corps[cle] = nombre(cle); });
    if (initialise) {
      if (!motif.trim()) { setErreur("Un motif est obligatoire pour corriger un solde."); return; }
      if (!Object.keys(exercices).length && !COMPTEURS.some(({ cle }) => corps[cle])) {
        setErreur("Aucune correction à appliquer."); return;
      }
    }
    if (motif.trim()) corps.motif = motif.trim();
    setEnvoi(true);
    try {
      await api.post(`/conges/soldes/${matricule}/${initialise ? "correction" : "initial"}/`, corps);
      await onDone();
    } catch (err) {
      const d = err.response?.data;
      const exo = d?.exercices && (Array.isArray(d.exercices) ? d.exercices[0] : Object.values(d.exercices)[0]?.[0]);
      setErreur(d?.error || exo || d?.motif?.[0] || d?.non_field_errors?.[0] || (d && Object.values(d)[0]?.[0]) || "L'enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  const champNombre = (cle, label, note) => (
    <div key={cle}>
      <label htmlFor={`solde-${cle}`} style={etiquette}>{label}</label>
      <input
        id={`solde-${cle}`} type="number" min={initialise ? undefined : 0}
        value={valeurs[cle] ?? ""} placeholder={initialise ? "0" : undefined}
        onChange={(e) => setValeurs({ ...valeurs, [cle]: e.target.value })} style={champ}
      />
      {note && <div style={{ color: theme.textMuted, fontSize: 11, marginTop: -8, marginBottom: 10 }}>{note}</div>}
    </div>
  );

  return (
    <ModalShell titre={initialise ? "Corriger les soldes de congé" : "Initialiser les soldes de congé"} onClose={onClose} largeur={560}>
      <form onSubmit={soumettre}>
        <p style={{ color: theme.textSecondary, fontSize: 13, marginTop: 0 }}>
          {initialise
            ? "Saisissez la variation (positive ou négative) des jours restants de chaque exercice à corriger. Elle est historisée avec son motif."
            : "Saisissez les jours RESTANTS de chaque exercice (reprise de l'existant). L'exercice en cours et l'anticipé laissés vides sont ouverts au droit annuel. Cette saisie n'est possible qu'une fois."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {lignes.map((l) => champNombre(
            l.exercice,
            `${libelleCategorie(l.categorie)} ${l.exercice}`,
            l.restant !== undefined ? `Actuellement ${l.restant} j restant(s)` : null,
          ))}
        </div>
        <button type="button" onClick={ajouterAnterieur}
          style={{ background: "none", border: "none", color: theme.primary, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          + Ajouter un exercice antérieur
        </button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
          {COMPTEURS.map(({ cle, label }) => champNombre(cle, label))}
        </div>
        <label htmlFor="solde-motif" style={etiquette}>Motif</label>
        <input id="solde-motif" value={motif} onChange={(e) => setMotif(e.target.value)}
          placeholder={initialise ? "Obligatoire" : "Facultatif (ex. Reprise de l'existant)"} style={champ} />
        <MessageErreur texte={erreur} />
        <BoutonsModale onClose={onClose} libelle={initialise ? "Appliquer la correction" : "Enregistrer le solde initial"} envoi={envoi} />
      </form>
    </ModalShell>
  );
}

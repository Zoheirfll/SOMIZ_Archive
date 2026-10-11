import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { formatDateFR } from "../../utils/formatDate";
import { anneesDisponibles, telechargerRegistre } from "../../utils/registres";
import RegistreModal from "./RegistreModal";

const CHAMPS = [
  { name: "nom_libre", label: "Nom et prénom (si pas d'employé)", type: "text" },
  { name: "beneficiaire", label: "Bénéficiaire (qui prend le dossier)", type: "text" },
  { name: "fonction", label: "Fonction", type: "text" },
  { name: "service", label: "Service / Département", type: "text" },
  { name: "numero_contrat", label: "N° de contrat", type: "text" },
  { name: "type_documents", label: "Type de documents", type: "text", required: true },
  { name: "nombre_documents", label: "Nombre de documents", type: "number", required: true },
  { name: "date_depart", label: "Date de départ", type: "date", required: true },
  { name: "date_retour", label: "Date de retour", type: "date" },
  { name: "observation", label: "Observation", type: "textarea" },
];

const slugDe = (reference) => reference.replace("/", "-");

export default function MouvementsPanel() {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modale, setModale] = useState(false);
  const [erreurModale, setErreurModale] = useState("");

  const fetchLignes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/registres/mouvements/", { params: { annee, q, statut } });
      setLignes(res.data?.results || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger le registre.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [annee, q, statut]);

  useEffect(() => { fetchLignes(); }, [fetchLignes]);

  const action = async (url, corps) => {
    try {
      await api.post(url, corps);
      setError("");
      await fetchLignes(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Action impossible.");
    }
  };

  const annuler = async (ligne) => {
    const motif = await prompt(`Motif de l'annulation de ${ligne.reference} :`, "", { confirmLabel: "Annuler la ligne" });
    if (motif === null) return;
    await action(`/registres/mouvements/${slugDe(ligne.reference)}/annuler/`, { motif });
  };

  const creer = async (valeurs) => {
    const corps = Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== "" && v !== undefined));
    try {
      await api.post("/registres/mouvements/", corps);
      setModale(false);
      setErreurModale("");
      await fetchLignes(true);
    } catch (err) {
      const data = err.response?.data;
      setErreurModale(data?.non_field_errors?.[0] || data?.detail || "Enregistrement impossible.");
    }
  };

  const exporter = (fmt) => telechargerRegistre("mouvements", { annee, q, statut, fmt })
    .catch(() => setError("Export impossible."));

  const cellule = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${theme.border}`, color: theme.text, verticalAlign: "top" };
  const entete = { ...cellule, fontWeight: 700, color: theme.textSecondary, textAlign: "left", background: theme.bg };
  const bouton = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: theme.fontFamily };

  return (
    <div>
      {PromptDialog}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select aria-label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={bouton}>
          {anneesDisponibles().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input aria-label="Rechercher" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...bouton, fontWeight: 400, minWidth: 180 }} />
        <select aria-label="Filtre" value={statut} onChange={(e) => setStatut(e.target.value)} style={bouton}>
          <option value="">Tous</option>
          <option value="en_cours">Non rendus</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" style={bouton} onClick={() => setModale(true)}>Nouveau mouvement</button>
        <button type="button" style={bouton} onClick={() => exporter("pdf")}>Imprimer</button>
        <button type="button" style={bouton} onClick={() => exporter("xlsx")}>Télécharger</button>
      </div>
      {error && <p role="alert" style={{ color: theme.danger, fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: theme.textMuted }}>Chargement…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: theme.surface }}>
            <thead>
              <tr>
                {["Réf.", "Origine", "Départ", "Bénéficiaire", "Employé", "Fonction / Service", "N° contrat", "Documents", "Retour", "Observation", ""].map((h, i) => <th key={i} style={entete}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.reference} style={{ opacity: l.annulee ? 0.55 : 1, textDecoration: l.annulee ? "line-through" : "none" }}>
                  <td style={cellule}>{l.reference}</td>
                  <td style={cellule}>{l.origine === "consultation" ? "Consultation" : "Manuel"}</td>
                  <td style={cellule}>{formatDateFR(l.date_depart)}</td>
                  <td style={cellule}>{l.beneficiaire}</td>
                  <td style={cellule}>{l.employe}{l.matricule ? ` (${l.matricule})` : ""}</td>
                  <td style={cellule}>{[l.fonction, l.service].filter(Boolean).join(" — ")}</td>
                  <td style={cellule}>{l.numero_contrat}</td>
                  <td style={cellule}>{l.type_documents} ({l.nombre_documents})</td>
                  <td style={cellule}>{l.date_retour ? formatDateFR(l.date_retour) : "En cours"}</td>
                  <td style={cellule}>{l.annulee ? `Annulée : ${l.motif_annulation}` : l.observation}</td>
                  <td style={cellule}>
                    {l.origine === "manuel" && !l.annulee && (
                      <>
                        {!l.date_retour && (
                          <button type="button" style={bouton} onClick={() => action(`/registres/mouvements/${slugDe(l.reference)}/retour/`)}>
                            Enregistrer le retour
                          </button>
                        )}{" "}
                        <button type="button" style={{ ...bouton, color: theme.danger }} aria-label="Annuler la ligne" onClick={() => annuler(l)}>
                          Annuler
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && <tr><td style={cellule} colSpan={11}>Aucun mouvement pour cette année.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {modale && (
        <RegistreModal
          titre="Nouveau mouvement" champs={CHAMPS}
          valeursInitiales={{ nombre_documents: 1 }}
          onSubmit={creer} onClose={() => { setModale(false); setErreurModale(""); }} erreur={erreurModale}
        />
      )}
    </div>
  );
}

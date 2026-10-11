import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { formatDateFR } from "../../utils/formatDate";
import { anneesDisponibles, messageErreur, telechargerRegistre } from "../../utils/registres";
import Pagination from "./Pagination";
import RegistreModal from "./RegistreModal";

const CHAMPS = [
  { name: "type_document", label: "Type de document", type: "text", required: true },
  { name: "nombre", label: "Nombre", type: "number", required: true },
  { name: "expediteur", label: "Expéditeur", type: "text", required: true },
  { name: "date_reception", label: "Date de réception", type: "date", required: true },
  { name: "date_classement", label: "Date de classement", type: "date" },
  { name: "observation", label: "Observation", type: "textarea" },
];

export default function ReceptionsPanel() {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ count: 0, num_pages: 1 });
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modale, setModale] = useState(false);
  const [erreurModale, setErreurModale] = useState("");

  const fetchLignes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/registres/receptions/", { params: { annee, q, statut, page } });
      setLignes(res.data?.results || []);
      setMeta({ count: res.data?.count ?? 0, num_pages: res.data?.num_pages ?? 1 });
      setError("");
    } catch (err) {
      setError(messageErreur(err, "Impossible de charger le registre."));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [annee, q, statut, page]);

  // Tout changement de filtre repart de la première page.
  const changerFiltre = (setter) => (valeur) => { setter(valeur); setPage(1); };

  useEffect(() => { fetchLignes(); }, [fetchLignes]);

  const action = async (url, corps) => {
    try {
      await api.post(url, corps);
      setError("");
      await fetchLignes(true);
    } catch (err) {
      setError(messageErreur(err, "Action impossible."));
    }
  };

  const annuler = async (ligne) => {
    const motif = await prompt(`Motif de l'annulation de ${ligne.reference} :`, "", { confirmLabel: "Annuler la ligne" });
    if (motif === null) return;
    await action(`/registres/receptions/${ligne.slug}/annuler/`, { motif });
  };

  // Suppression définitive : seulement sur une ligne déjà annulée, avec
  // confirmation renforcée (saisie de la référence, pas un simple clic).
  const supprimer = async (ligne) => {
    const saisie = await prompt(
      `Suppression DÉFINITIVE de ${ligne.reference} (tracée dans l'audit). Saisissez sa référence pour confirmer :`,
      "", { confirmLabel: "Supprimer définitivement" },
    );
    if (saisie === null) return;
    if (saisie !== ligne.reference) {
      setError("La référence saisie ne correspond pas : la ligne n'a pas été supprimée.");
      return;
    }
    try {
      await api.delete(`/registres/receptions/${ligne.slug}/`);
      setError("");
      await fetchLignes(true);
    } catch (err) {
      setError(messageErreur(err, "Suppression impossible."));
    }
  };

  const creer = async (valeurs) => {
    const corps = Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== "" && v !== undefined));
    try {
      await api.post("/registres/receptions/", corps);
      setModale(false);
      setErreurModale("");
      await fetchLignes(true);
    } catch (err) {
      const data = err.response?.data;
      setErreurModale(data?.non_field_errors?.[0] || data?.detail || "Enregistrement impossible.");
    }
  };

  const exporter = (fmt) => telechargerRegistre("receptions", { annee, q, statut, fmt })
    .catch(() => setError("Export impossible."));

  const cellule = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${theme.border}`, color: theme.text, verticalAlign: "top" };
  const entete = { ...cellule, fontWeight: 700, color: theme.textSecondary, textAlign: "left", background: theme.bg };
  const bouton = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: theme.fontFamily };

  return (
    <div>
      {PromptDialog}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select aria-label="Année" value={annee} onChange={(e) => changerFiltre(setAnnee)(Number(e.target.value))} style={bouton}>
          {anneesDisponibles().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input aria-label="Rechercher" placeholder="Rechercher…" value={q} onChange={(e) => changerFiltre(setQ)(e.target.value)} style={{ ...bouton, fontWeight: 400, minWidth: 180 }} />
        <select aria-label="Filtre" value={statut} onChange={(e) => changerFiltre(setStatut)(e.target.value)} style={bouton}>
          <option value="">Tous</option>
          <option value="a_classer">À classer</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" style={bouton} onClick={() => setModale(true)}>Nouvelle réception</button>
        <button type="button" style={bouton} onClick={() => exporter("pdf")}>Imprimer</button>
        <button type="button" style={bouton} onClick={() => exporter("xlsx")}>Télécharger</button>
      </div>
      {error && <p role="alert" style={{ color: theme.danger, fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: theme.textMuted }}>Chargement…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: theme.surface }}>
            <thead>
              <tr>
                {["Réf.", "Type", "Nombre", "Expéditeur", "Réception", "Classement", "Observation", "Saisi par", ""].map((h, i) => <th key={i} style={entete}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.reference} style={{ opacity: l.is_active ? 1 : 0.55, textDecoration: l.is_active ? "none" : "line-through" }}>
                  <td style={cellule}>{l.reference}</td>
                  <td style={cellule}>{l.type_document}</td>
                  <td style={cellule}>{l.nombre}</td>
                  <td style={cellule}>{l.expediteur}</td>
                  <td style={cellule}>{formatDateFR(l.date_reception)}</td>
                  <td style={cellule}>{l.date_classement ? formatDateFR(l.date_classement) : "À classer"}</td>
                  <td style={cellule}>{l.is_active ? l.observation : `Annulée : ${l.motif_annulation}`}</td>
                  <td style={cellule}>{l.saisi_par_nom}</td>
                  <td style={cellule}>
                    {l.is_active && (
                      <>
                        {!l.date_classement && (
                          <button type="button" style={bouton} onClick={() => action(`/registres/receptions/${l.slug}/classer/`)}>
                            Classer
                          </button>
                        )}{" "}
                        <button type="button" style={{ ...bouton, color: theme.danger }} aria-label="Annuler la ligne" onClick={() => annuler(l)}>
                          Annuler
                        </button>
                      </>
                    )}
                    {!l.is_active && (
                      <button type="button" style={{ ...bouton, color: theme.danger }} aria-label="Supprimer la ligne" onClick={() => supprimer(l)}>
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && <tr><td style={cellule} colSpan={9}>Aucune réception pour cette année.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!loading && <Pagination page={page} numPages={meta.num_pages} count={meta.count} onChange={setPage} />}
      {modale && (
        <RegistreModal
          titre="Nouvelle réception" champs={CHAMPS}
          valeursInitiales={{ nombre: 1 }}
          onSubmit={creer} onClose={() => { setModale(false); setErreurModale(""); }} erreur={erreurModale}
        />
      )}
    </div>
  );
}

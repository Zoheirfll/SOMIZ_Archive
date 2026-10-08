import { useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { TAILLE_MAX_FICHIER_MO, formatDuree, slugDepuisReference } from "../../utils/consultations";
import DureeSelect from "./DureeSelect";
import FileDropZone from "./FileDropZone";

const messageErreur = (err, defaut) => {
  const data = err.response?.data;
  if (!data) return defaut;
  if (typeof data === "string") return data;
  return (
    data.detail || data.error ||
    [].concat(data.fichiers || data.duree_heures || data.copier_fichiers || data.motif_rejet || data.non_field_errors || [])[0] ||
    (Array.isArray(data) ? data[0] : null) || defaut
  );
};

export default function TraiterPanel({ demande, onDone }) {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const slug = slugDepuisReference(demande.reference);
  // Préremplis avec les SOUHAITS du demandeur : le traiteur les accorde tels
  // quels (il ne touche à rien) ou les modifie avant de valider.
  const dureeSouhaitee = demande.duree_souhaitee_heures || 24;
  const [duree, setDuree] = useState(dureeSouhaitee);
  const [telechargement, setTelechargement] = useState(!!demande.telechargement_souhaite);
  const [impression, setImpression] = useState(!!demande.impression_souhaitee);
  const [fichiers, setFichiers] = useState([]);
  const [archives, setArchives] = useState([]);
  const [copies, setCopies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Documents déjà archivés de l'employé : proposés à la COPIE (l'original
  // n'est jamais exposé au demandeur).
  useEffect(() => {
    if (!demande.employee) return;
    api.get(`/employees/${demande.employee}/documents/`)
      .then((res) => {
        const liste = Array.isArray(res.data) ? res.data : res.data.results || [];
        setArchives(liste.flatMap((doc) =>
          (doc.fichiers || []).filter((f) => f.is_active !== false).map((f) => ({
            id: f.id, label: `${doc.type_document_label} — ${f.file_name}`,
          }))
        ));
      })
      .catch(() => setArchives([]));
  }, [demande.employee]);

  const basculerCopie = (id) =>
    setCopies((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const valider = async () => {
    setError("");
    if (fichiers.length === 0 && copies.length === 0) {
      setError("Joignez au moins un fichier (scan ou document archivé).");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("duree_heures", String(duree));
      form.append("telechargement_autorise", telechargement ? "true" : "false");
      form.append("impression_autorisee", impression ? "true" : "false");
      fichiers.forEach((f) => form.append("fichiers", f));
      copies.forEach((id) => form.append("copier_fichiers", id));
      await api.post(`/consultations/demandes/${slug}/valider/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await onDone();
    } catch (err) {
      setError(messageErreur(err, "Impossible de valider la demande."));
    } finally {
      setBusy(false);
    }
  };

  const rejeter = async () => {
    setError("");
    const motif = await prompt("Motif du rejet (obligatoire) :", "");
    if (motif === null) return;
    if (!motif.trim()) { setError("Le motif du rejet est obligatoire."); return; }
    setBusy(true);
    try {
      await api.post(`/consultations/demandes/${slug}/rejeter/`, { motif_rejet: motif.trim() });
      await onDone();
    } catch (err) {
      setError(messageErreur(err, "Impossible de rejeter la demande."));
    } finally {
      setBusy(false);
    }
  };

  const champ = {
    padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: 13, fontFamily: theme.fontFamily,
  };

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, boxShadow: theme.shadow }}>
      {PromptDialog}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textSecondary, marginBottom: 12 }}>
        Traiter la demande
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>Scan à envoyer</div>
      <div style={{ marginBottom: 14 }}>
        <FileDropZone
          files={fichiers}
          onChange={setFichiers}
          accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
          maxMo={TAILLE_MAX_FICHIER_MO}
        />
      </div>

      {demande.employee && archives.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
            Ou copier un document archivé de {demande.employee_nom}
          </div>
          {archives.map((a) => (
            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, marginBottom: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={copies.includes(a.id)} onChange={() => basculerCopie(a.id)} />
              {a.label}
            </label>
          ))}
        </div>
      )}

      <div style={{
        background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, borderRadius: 10,
        padding: "10px 14px", marginBottom: 12, fontSize: 13, color: theme.text,
      }}>
        <strong>Souhaits du demandeur :</strong>{" "}
        {formatDuree(dureeSouhaitee)} · téléchargement {demande.telechargement_souhaite ? "souhaité" : "non souhaité"}
        {" · "}impression {demande.impression_souhaitee ? "souhaitée" : "non souhaitée"}.
        <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
          Les champs ci-dessous sont préremplis : validez tel quel pour tout accorder, ou modifiez ce que vous accordez.
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: theme.text, paddingTop: 10 }}>Durée accordée</span>
          <DureeSelect value={duree} onChange={setDuree} />
          {duree !== dureeSouhaitee && (
            <span style={{ fontSize: 11, color: theme.warning, paddingTop: 11 }}>modifiée (souhaitée : {formatDuree(dureeSouhaitee)})</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
          <input type="checkbox" checked={telechargement} onChange={(e) => setTelechargement(e.target.checked)} />
          Autoriser le téléchargement
          {telechargement !== !!demande.telechargement_souhaite && (
            <span style={{ fontSize: 11, color: theme.warning }}>(modifié)</span>
          )}
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
          <input type="checkbox" checked={impression} onChange={(e) => setImpression(e.target.checked)} />
          Autoriser l'impression
          {impression !== !!demande.impression_souhaitee && (
            <span style={{ fontSize: 11, color: theme.warning }}>(modifié)</span>
          )}
        </label>
      </div>
      {(telechargement || impression) && (
        <div style={{ color: theme.warning, fontSize: 12, marginBottom: 12 }}>
          Une copie téléchargée ou imprimée sort de l'application : seul le filigrane (nom, référence, date) permettra d'en identifier l'origine.
        </div>
      )}

      {error && (
        <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button" onClick={valider} disabled={busy}
          style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Envoi…" : "Valider et envoyer"}
        </button>
        <button
          type="button" onClick={rejeter} disabled={busy}
          style={{ background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer" }}
        >
          Rejeter
        </button>
      </div>
    </div>
  );
}

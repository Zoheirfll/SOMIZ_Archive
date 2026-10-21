import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { TYPES_CONGE } from "../../utils/conges";

// Paramètres du module congés dans /parametres : droit annuel (jours par
// exercice), référentiel des motifs propres à chaque type (durée fixe
// facultative, ex. Mariage = 3 j) et pièces justificatives attendues par
// motif. Motifs et pièces ne sont jamais supprimés : ils se désactivent.
export default function CongeParametresPanel() {
  const theme = useTheme();
  const [droit, setDroit] = useState("");
  const [motifs, setMotifs] = useState([]);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauType, setNouveauType] = useState("CP");
  const [nouvelleDuree, setNouvelleDuree] = useState("");
  const [durees, setDurees] = useState({});
  const [nouvellesPieces, setNouvellesPieces] = useState({});
  const [messageDroit, setMessageDroit] = useState({ type: "", texte: "" });
  const [erreurMotif, setErreurMotif] = useState("");

  const charger = useCallback(async () => {
    const [p, m] = await Promise.all([api.get("/conges/parametres/"), api.get("/conges/motifs/")]);
    setDroit(String(p.data.droit_annuel_jours));
    const liste = m.data?.results || m.data || [];
    setMotifs(liste);
    setDurees(Object.fromEntries(liste.map((x) => [x.id, x.nb_jours_fixe ? String(x.nb_jours_fixe) : ""])));
  }, []);

  useEffect(() => { charger().catch(() => setMessageDroit({ type: "erreur", texte: "Impossible de charger les paramètres." })); }, [charger]);

  const messageErreur = (err, defaut) => {
    const d = err.response?.data;
    return d?.error || d?.detail || (d && Object.values(d)[0]?.[0]) || defaut;
  };

  // Toute action sur un motif ou une pièce : erreur affichée, liste rechargée.
  const agir = async (action, defaut) => {
    setErreurMotif("");
    try {
      await action();
      await charger();
      return true;
    } catch (err) {
      setErreurMotif(messageErreur(err, defaut));
      return false;
    }
  };

  const enregistrerDroit = async (e) => {
    e.preventDefault();
    setMessageDroit({ type: "", texte: "" });
    try {
      const res = await api.put("/conges/parametres/", { droit_annuel_jours: Number(droit) });
      setDroit(String(res.data.droit_annuel_jours));
      setMessageDroit({ type: "ok", texte: "Droit annuel enregistré." });
    } catch (err) {
      setMessageDroit({ type: "erreur", texte: messageErreur(err, "Enregistrement impossible.") });
    }
  };

  const ajouterMotif = async (e) => {
    e.preventDefault();
    setErreurMotif("");
    if (!nouveauNom.trim()) return;
    const corps = { nom: nouveauNom.trim(), type_conge: nouveauType };
    if (nouvelleDuree) corps.nb_jours_fixe = Number(nouvelleDuree);
    const ok = await agir(() => api.post("/conges/motifs/", corps), "Ajout impossible.");
    if (ok) { setNouveauNom(""); setNouvelleDuree(""); }
  };

  const basculer = (motif) => agir(
    () => (motif.is_active
      ? api.delete(`/conges/motifs/${motif.id}/`)
      : api.patch(`/conges/motifs/${motif.id}/`, { is_active: true })),
    "Modification impossible.",
  );

  const enregistrerDuree = (motif) => agir(
    () => api.patch(`/conges/motifs/${motif.id}/`, { nb_jours_fixe: durees[motif.id] ? Number(durees[motif.id]) : null }),
    "Durée non enregistrée.",
  );

  const ajouterPiece = async (motif) => {
    const libelle = (nouvellesPieces[motif.id] || "").trim();
    if (!libelle) return;
    const ok = await agir(() => api.post(`/conges/motifs/${motif.id}/pieces/`, { libelle }), "Ajout de la pièce impossible.");
    if (ok) setNouvellesPieces({ ...nouvellesPieces, [motif.id]: "" });
  };

  const basculerPiece = (piece) => agir(
    () => (piece.is_active
      ? api.delete(`/conges/motifs/pieces/${piece.id}/`)
      : api.patch(`/conges/motifs/pieces/${piece.id}/`, { is_active: true })),
    "Modification impossible.",
  );

  const carte = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 20, marginBottom: 20 };
  const champ = { padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, fontSize: 14, fontFamily: "inherit" };
  const petitChamp = { ...champ, padding: "4px 8px", fontSize: 12 };
  const titre = (t) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textSecondary, borderLeft: `4px solid ${theme.primary}`, paddingLeft: 8, marginBottom: 14 }}>{t}</div>
  );
  const bouton = { background: theme.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
  const petitBouton = (couleur) => ({
    background: "none", border: `1px solid ${theme.border}`, borderRadius: 6, padding: "3px 10px",
    fontSize: 11, fontWeight: 600, cursor: "pointer", color: couleur,
  });
  const etiquette = { fontSize: 12, fontWeight: 700, color: theme.text, display: "block", marginBottom: 4 };

  return (
    <div>
      <form onSubmit={enregistrerDroit} style={carte}>
        {titre("Droit annuel")}
        <label htmlFor="cg-droit" style={etiquette}>Droit annuel (jours par exercice)</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input id="cg-droit" type="number" min="1" max="90" value={droit} onChange={(e) => setDroit(e.target.value)} style={{ ...champ, width: 120 }} />
          <button type="submit" style={bouton}>Enregistrer le droit annuel</button>
        </div>
        <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>
          Jours ouverts pour chaque nouvel exercice (le 1er juillet, l'anticipé suivant s'ouvre avec ce droit). Exercice : du 1er juillet au 30 juin.
        </div>
        {messageDroit.texte && (
          <div role={messageDroit.type === "erreur" ? "alert" : "status"}
            style={{ color: messageDroit.type === "erreur" ? theme.danger : theme.primary, fontSize: 13, marginTop: 8 }}>
            {messageDroit.texte}
          </div>
        )}
      </form>

      <div style={carte}>
        {titre("Motifs de congé")}
        {TYPES_CONGE.map((t) => {
          const duType = motifs.filter((m) => m.type_conge === t.value);
          return (
            <div key={t.value} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 6 }}>{t.label}</div>
              {duType.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 12 }}>Aucun motif.</div>
              ) : duType.map((m) => (
                <div key={m.id} style={{ padding: "6px 0", borderBottom: `1px solid ${theme.borderLight}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ flex: 1, minWidth: 140, color: m.is_active ? theme.text : theme.textMuted, fontSize: 13 }}>{m.nom}</span>
                    {!m.is_active && <span style={{ fontSize: 11, color: theme.textMuted }}>inactif</span>}
                    <input
                      type="number" min="1" placeholder="libre" aria-label={`Durée fixe de ${m.nom}`}
                      value={durees[m.id] ?? ""} onChange={(e) => setDurees({ ...durees, [m.id]: e.target.value })}
                      style={{ ...petitChamp, width: 70 }}
                    />
                    <span style={{ fontSize: 11, color: theme.textMuted }}>j</span>
                    <button type="button" onClick={() => enregistrerDuree(m)} aria-label={`Enregistrer la durée de ${m.nom}`} style={petitBouton(theme.primary)}>
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => basculer(m)}
                      aria-label={`${m.is_active ? "Désactiver" : "Réactiver"} ${m.nom}`}
                      style={petitBouton(m.is_active ? theme.danger : theme.primary)}
                    >
                      {m.is_active ? "Désactiver" : "Réactiver"}
                    </button>
                  </div>
                  <div style={{ paddingLeft: 14, marginTop: 4 }}>
                    {(m.pieces || []).map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "2px 0" }}>
                        <span style={{ flex: 1, color: p.is_active ? theme.textSecondary : theme.textMuted }}>
                          Pièce : {p.libelle}{!p.is_active && " (inactive)"}
                        </span>
                        <button type="button" onClick={() => basculerPiece(p)}
                          aria-label={`${p.is_active ? "Désactiver" : "Réactiver"} la pièce ${p.libelle}`}
                          style={petitBouton(p.is_active ? theme.danger : theme.primary)}>
                          {p.is_active ? "Désactiver" : "Réactiver"}
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input
                        aria-label={`Nouvelle pièce pour ${m.nom}`} placeholder="Pièce justificative attendue"
                        value={nouvellesPieces[m.id] || ""}
                        onChange={(e) => setNouvellesPieces({ ...nouvellesPieces, [m.id]: e.target.value })}
                        style={{ ...petitChamp, flex: 1 }}
                      />
                      <button type="button" onClick={() => ajouterPiece(m)} aria-label={`Ajouter la pièce à ${m.nom}`} style={petitBouton(theme.primary)}>
                        + Pièce
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        <form onSubmit={ajouterMotif} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
          <div>
            <label htmlFor="cg-motif-nom" style={etiquette}>Nouveau motif</label>
            <input id="cg-motif-nom" value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} style={{ ...champ, minWidth: 220 }} />
          </div>
          <div>
            <label htmlFor="cg-motif-type" style={etiquette}>Type du nouveau motif</label>
            <select id="cg-motif-type" value={nouveauType} onChange={(e) => setNouveauType(e.target.value)} style={champ}>
              {TYPES_CONGE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cg-motif-duree" style={etiquette}>Durée fixe (j, facultative)</label>
            <input id="cg-motif-duree" type="number" min="1" value={nouvelleDuree} onChange={(e) => setNouvelleDuree(e.target.value)} style={{ ...champ, width: 110 }} />
          </div>
          <button type="submit" style={bouton}>Ajouter le motif</button>
        </form>
        {erreurMotif && <div role="alert" style={{ color: theme.danger, fontSize: 13, marginTop: 8 }}>{erreurMotif}</div>}
      </div>
    </div>
  );
}

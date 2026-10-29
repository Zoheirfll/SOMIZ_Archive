import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";
import usePageTitle from "../hooks/usePageTitle";

const TYPES_UNITE = {
  direction: "Direction", departement: "Département", service: "Service", cellule: "Cellule", section: "Section",
};
const STATUTS = {
  en_attente: "À valider", valide: "Validé", refuse: "Refusé", termine: "Terminé avant l'échéance",
};

const formatDate = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : "—");
const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Intérim des responsables d'unité : le titulaire désigne un remplaçant dans son
// équipe (son supérieur direct valide), le droit s'arrête seul à la date de fin.
// Voir backend/accounts/interims.py et docs/fonctionnel/conges-hierarchie.md.
export default function Interims() {
  usePageTitle("Intérim");
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();
  const [donnees, setDonnees] = useState({ unites: [], interims: [], peut_gerer: false });
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState(null);
  const [uniteCle, setUniteCle] = useState("");
  const [candidats, setCandidats] = useState([]);
  const [form, setForm] = useState({ interimaire: "", date_debut: aujourdhui(), date_fin: "" });
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get("/interims/");
      setDonnees(data);
    } catch {
      setMessage({ type: "error", text: "Chargement impossible." });
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const unite = donnees.unites.find((u) => `${u.type}:${u.id}` === uniteCle);

  useEffect(() => {
    setCandidats([]);
    setForm((f) => ({ ...f, interimaire: "" }));
    if (!unite) return undefined;
    let annule = false;
    api.get("/interims/candidats/", { params: { unite_type: unite.type, unite_id: unite.id } })
      .then((res) => { if (!annule) setCandidats(res.data); })
      .catch(() => {});
    return () => { annule = true; };
  }, [uniteCle]); // eslint-disable-line react-hooks/exhaustive-deps

  const erreur = (err, defaut) => err.response?.data?.error || defaut;

  const designer = async (e) => {
    e.preventDefault();
    if (!unite) return;
    setEnvoi(true);
    setMessage(null);
    try {
      const { data } = await api.post("/interims/", { ...form, unite_type: unite.type, unite_id: unite.id });
      setMessage({
        type: "success",
        text: data.statut === "valide"
          ? "Intérim enregistré : il prend effet à la date de début."
          : "Désignation envoyée : votre supérieur direct doit la valider.",
      });
      setForm({ interimaire: "", date_debut: aujourdhui(), date_fin: "" });
      await charger();
    } catch (err) {
      setMessage({ type: "error", text: erreur(err, "Désignation impossible.") });
    } finally {
      setEnvoi(false);
    }
  };

  const decider = async (interim, accepter) => {
    let motif = "";
    if (!accepter) {
      motif = await prompt(`Motif du refus de l'intérim de « ${interim.unite_nom} » (facultatif) :`, "", { confirmLabel: "Refuser" });
      if (motif === null) return;
    }
    try {
      await api.post(`/interims/${interim.id}/decider/`, { accepter, motif });
      await charger();
    } catch (err) {
      setMessage({ type: "error", text: erreur(err, "Décision impossible.") });
    }
  };

  const terminer = async (interim) => {
    if (!(await confirm(`Mettre fin à l'intérim de « ${interim.unite_nom} » ? ${interim.interimaire_nom} perdra immédiatement ses droits.`))) return;
    try {
      await api.post(`/interims/${interim.id}/terminer/`);
      await charger();
    } catch (err) {
      setMessage({ type: "error", text: erreur(err, "Opération impossible.") });
    }
  };

  const carte = {
    background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 20,
    boxShadow: theme.shadowMd, marginBottom: 24,
  };
  const champ = {
    border: `1px solid ${theme.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 14,
    background: theme.surface, color: theme.text, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  const etiquette = {
    color: theme.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    display: "block", marginBottom: 6,
  };
  const bouton = (fond, couleur, bordure) => ({
    background: fond, color: couleur, border: `1px solid ${bordure}`, borderRadius: 8, padding: "6px 14px",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  });

  const aValider = donnees.interims.filter((i) => i.peut_decider);
  const couleurStatut = (i) => (i.statut === "refuse" ? theme.danger : i.actif ? theme.primary : theme.textSecondary);

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)", padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
            Hiérarchie
          </div>
          <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Intérim</h1>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "6px 0 0" }}>
            Désignez un remplaçant pendant une absence : il reçoit les visas et le périmètre de l'unité jusqu'à la date de fin.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: contentPadding(isMobile) }}>
        {message && (
          <div role="alert" style={{
            background: message.type === "success" ? theme.primaryBg : theme.dangerBg,
            border: `1px solid ${message.type === "success" ? theme.primaryBorder : theme.dangerBorder}`,
            color: message.type === "success" ? theme.primary : theme.danger,
            borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 14, fontWeight: 600,
          }}>
            {message.text}
          </div>
        )}

        {aValider.length > 0 && (
          <div style={{ ...carte, background: theme.accentBg, border: `1px solid ${theme.accentBorder}` }}>
            <h2 style={{ color: theme.text, margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>
              À valider ({aValider.length})
            </h2>
            {aValider.map((i) => (
              <div key={i.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
                <div style={{ flex: "1 1 260px", color: theme.text, fontSize: 13 }}>
                  <strong>{i.interimaire_nom}</strong> remplacerait <strong>{i.titulaire_nom}</strong> à « {i.unite_nom} »
                  <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                    du {formatDate(i.date_debut)} au {formatDate(i.date_fin)} · proposé par {i.propose_par_nom || "—"}
                  </div>
                </div>
                <button type="button" onClick={() => decider(i, true)} style={bouton(theme.primary, "#fff", theme.primary)}>Valider</button>
                <button type="button" onClick={() => decider(i, false)} style={bouton(theme.dangerBg, theme.danger, theme.dangerBorder)}>Refuser</button>
              </div>
            ))}
          </div>
        )}

        {donnees.unites.length > 0 && (
          <form onSubmit={designer} style={carte}>
            <h2 style={{ color: theme.text, margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Désigner un intérimaire</h2>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
              <div>
                <label style={etiquette} htmlFor="interim-unite">Unité</label>
                <select id="interim-unite" value={uniteCle} onChange={(e) => setUniteCle(e.target.value)} required style={champ}>
                  <option value="">Choisir…</option>
                  {donnees.unites.map((u) => (
                    <option key={`${u.type}:${u.id}`} value={`${u.type}:${u.id}`}>
                      {TYPES_UNITE[u.type]} « {u.nom} » — {u.titulaire_nom}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={etiquette} htmlFor="interim-compte">Intérimaire</label>
                <select
                  id="interim-compte" value={form.interimaire} required disabled={!unite}
                  onChange={(e) => setForm({ ...form, interimaire: e.target.value })} style={champ}
                >
                  <option value="">{unite ? "Choisir dans l'équipe…" : "Choisissez d'abord une unité"}</option>
                  {candidats.map((c) => <option key={c.id} value={c.id}>{c.nom} ({c.username})</option>)}
                </select>
              </div>
              <div>
                <label style={etiquette} htmlFor="interim-debut">Du</label>
                <input id="interim-debut" type="date" required value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} style={champ} />
              </div>
              <div>
                <label style={etiquette} htmlFor="interim-fin">Au (inclus)</label>
                <input id="interim-fin" type="date" required min={form.date_debut} value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} style={champ} />
              </div>
            </div>
            {unite && (
              <p style={{ color: theme.textSecondary, fontSize: 12, margin: "12px 0 0", lineHeight: 1.5 }}>
                {unite.role === "titulaire" && unite.validation_requise
                  ? "Cette désignation sera soumise à la validation de votre supérieur direct."
                  : "Cette désignation prend effet sans autre validation."}
                {" "}À la date de fin, l'intérimaire perd automatiquement ses droits ; vous pouvez aussi y mettre fin avant.
              </p>
            )}
            <button type="submit" disabled={envoi} className="btn-lift" style={{ ...bouton(theme.primary, "#fff", theme.primary), marginTop: 14, padding: "10px 20px", fontSize: 13 }}>
              {envoi ? "Envoi…" : "Désigner"}
            </button>
          </form>
        )}

        <div style={carte}>
          <h2 style={{ color: theme.text, margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Intérims</h2>
          {chargement ? (
            <div style={{ color: theme.textSecondary, fontSize: 13 }}>Chargement…</div>
          ) : donnees.interims.length === 0 ? (
            <div style={{ color: theme.textSecondary, fontSize: 13 }}>Aucun intérim.</div>
          ) : (
            donnees.interims.map((i) => (
              <div key={i.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, borderTop: `1px solid ${theme.border}`, padding: "12px 0" }}>
                <div style={{ flex: "1 1 280px", color: theme.text, fontSize: 13 }}>
                  <strong>{i.interimaire_nom}</strong> pour <strong>{i.titulaire_nom}</strong>
                  <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {TYPES_UNITE[i.unite_type]} « {i.unite_nom} » · du {formatDate(i.date_debut)} au {formatDate(i.date_fin)}
                    {i.motif ? ` · ${i.motif}` : ""}
                  </div>
                </div>
                <span style={{ color: couleurStatut(i), fontWeight: 700, fontSize: 12 }}>
                  {i.actif ? "En cours" : STATUTS[i.statut]}
                </span>
                {i.peut_terminer && (
                  <button type="button" onClick={() => terminer(i)} style={bouton(theme.dangerBg, theme.danger, theme.dangerBorder)}>
                    Mettre fin
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </PageBackground>
  );
}

import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";

const TYPES_UNITE = {
  direction: "Direction", departement: "Département", service: "Service", cellule: "Cellule", section: "Section",
};

// Propositions de compte créées quand un employé sans compte est désigné
// responsable d'une unité (saisie ou import). Un ADMIN valide (en choisissant
// le rôle) ou refuse ; le mot de passe temporaire n'est montré qu'une fois.
// Voir backend/accounts/propositions.py.
const PropositionsCompte = ({ onCompteCree }) => {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const [propositions, setPropositions] = useState([]);
  const [roles, setRoles] = useState({});
  const [busy, setBusy] = useState(null);
  const [erreur, setErreur] = useState("");
  const [identifiants, setIdentifiants] = useState(null);

  const charger = useCallback(async () => {
    try {
      const { data } = await api.get("/admin-users/propositions/");
      setPropositions(data);
    } catch {
      setPropositions([]);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const valider = async (p) => {
    setBusy(p.id);
    setErreur("");
    try {
      const { data } = await api.post(`/admin-users/propositions/${p.id}/valider/`, {
        role: roles[p.id] || "GESTIONNAIRE",
      });
      setIdentifiants({ nom: p.employee_nom, username: data.username, motDePasse: data.mot_de_passe_temporaire });
      await charger();
      if (onCompteCree) onCompteCree();
    } catch (err) {
      setErreur(err.response?.data?.error || err.response?.data?.detail || "Validation impossible.");
    } finally {
      setBusy(null);
    }
  };

  const refuser = async (p) => {
    const motif = await prompt(`Motif du refus pour ${p.employee_nom} (facultatif) :`, "", { confirmLabel: "Refuser" });
    if (motif === null) return;
    setBusy(p.id);
    setErreur("");
    try {
      await api.post(`/admin-users/propositions/${p.id}/refuser/`, { motif });
      await charger();
    } catch (err) {
      setErreur(err.response?.data?.error || "Refus impossible.");
    } finally {
      setBusy(null);
    }
  };

  if (propositions.length === 0 && !identifiants) return <>{PromptDialog}</>;

  const bouton = (couleur, fond, bordure) => ({
    background: fond, color: couleur, border: `1px solid ${bordure}`, borderRadius: 8, padding: "6px 14px",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <>
      {propositions.length > 0 && (
        <div
          style={{
            background: theme.accentBg, border: `1px solid ${theme.accentBorder}`, borderRadius: 16,
            padding: 20, marginBottom: 24,
          }}
        >
          <h2 style={{ color: theme.text, margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>
            Comptes de responsables à valider ({propositions.length})
          </h2>
          <p style={{ color: theme.textSecondary, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5 }}>
            Ces employés ont été désignés responsables d'une unité mais n'ont pas de compte. Aucun compte n'est
            créé tant que vous ne validez pas.
          </p>
          {erreur && (
            <div role="alert" style={{ color: theme.danger, fontSize: 13, marginBottom: 10, fontWeight: 600 }}>
              {erreur}
            </div>
          )}
          {propositions.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, background: theme.surface,
                border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 8,
              }}
            >
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ color: theme.text, fontWeight: 700, fontSize: 14 }}>
                  {p.employee_nom}{" "}
                  <span style={{ color: theme.textSecondary, fontFamily: "monospace", fontSize: 11 }}>
                    ({p.matricule})
                  </span>
                </div>
                <div style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Responsable — {TYPES_UNITE[p.unite_type] || p.unite_type} « {p.unite_nom} »
                  {p.source === "import" ? " · import" : ""}
                </div>
              </div>
              <select
                aria-label={`Rôle du compte de ${p.employee_nom}`}
                value={roles[p.id] || "GESTIONNAIRE"}
                onChange={(e) => setRoles({ ...roles, [p.id]: e.target.value })}
                className="input-focus"
                style={{
                  border: `1px solid ${theme.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 12,
                  background: theme.surface, color: theme.text, fontFamily: "inherit",
                }}
              >
                <option value="GESTIONNAIRE">Gestionnaire</option>
                <option value="CONSULTANT">Consultant (lecture seule)</option>
              </select>
              <button
                type="button" disabled={busy === p.id} onClick={() => valider(p)}
                style={bouton(theme.surface, theme.primary, theme.primary)}
              >
                Valider et créer le compte
              </button>
              <button
                type="button" disabled={busy === p.id} onClick={() => refuser(p)}
                style={bouton(theme.danger, theme.dangerBg, theme.dangerBorder)}
              >
                Refuser
              </button>
            </div>
          ))}
        </div>
      )}

      {identifiants && (
        <div
          role="dialog" aria-modal="true" aria-label="Identifiants du nouveau compte"
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16,
          }}
        >
          <div
            style={{
              background: theme.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 460,
              boxShadow: theme.shadowXl, border: `1px solid ${theme.border}`,
            }}
          >
            <h2 style={{ color: theme.text, margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>
              Compte créé pour {identifiants.nom}
            </h2>
            <p style={{ color: theme.danger, fontSize: 13, fontWeight: 600, margin: "0 0 16px", lineHeight: 1.5 }}>
              Ce mot de passe n'est affiché qu'une seule fois. Transmettez-le à l'intéressé : il devra le changer à
              sa première connexion.
            </p>
            {[["Identifiant", identifiants.username], ["Mot de passe temporaire", identifiants.motDePasse]].map(
              ([libelle, valeur]) => (
                <div key={libelle} style={{ marginBottom: 12 }}>
                  <div style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                    {libelle}
                  </div>
                  <div
                    style={{
                      fontFamily: "monospace", fontSize: 15, color: theme.text, background: theme.bg,
                      border: `1px solid ${theme.border}`, borderRadius: 8, padding: "10px 12px",
                      userSelect: "all", wordBreak: "break-all",
                    }}
                  >
                    {valeur}
                  </div>
                </div>
              )
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(`${identifiants.username} / ${identifiants.motDePasse}`)}
                style={bouton(theme.primary, theme.primaryBg, theme.primaryBorder)}
              >
                Copier
              </button>
              <button
                type="button" onClick={() => setIdentifiants(null)}
                style={bouton(theme.surface, theme.primary, theme.primary)}
              >
                J'ai noté, fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {PromptDialog}
    </>
  );
};

export default PropositionsCompte;

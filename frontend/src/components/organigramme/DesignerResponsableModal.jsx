import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import useModalA11y from "../../hooks/useModalA11y";
import ResponsableField from "../parametres/ResponsableField";
import useLienLigne from "../../hooks/useLienLigne";

// Endpoint /ref/<segment>/ de chaque niveau désignable (le Pôle n'intervient
// pas dans la chaîne de visa des congés : pas de désignation ici).
const SEGMENTS = {
  direction: "directions", departement: "departements", service: "services",
  cellule: "cellules", section: "sections",
};

export const NIVEAUX_DESIGNABLES = Object.keys(SEGMENTS);

// Désigne (ou retire) le responsable d'une unité en un clic depuis
// l'Organigramme. Si l'employé n'a pas de compte, le backend crée une
// proposition de compte : on l'indique et on mène à /users pour la valider.
const DesignerResponsableModal = ({ node, roleLabel, onClose, onSaved }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const lienLigne = useLienLigne();
  const titleId = useId();
  const dialogRef = useModalA11y({ isOpen: true, onEscape: onClose, initialFocus: "input" });
  const [choix, setChoix] = useState({ id: node.responsable || null, label: node.responsable_nom || "" });
  const [saving, setSaving] = useState(false);
  const [erreur, setErreur] = useState("");
  const [resultat, setResultat] = useState(null); // { propositionEnAttente }

  const enregistrer = async () => {
    setSaving(true);
    setErreur("");
    try {
      const { data } = await api.patch(`/ref/${SEGMENTS[node.level]}/${node.id}/`, { responsable: choix.id });
      let propositionEnAttente = false;
      if (choix.id) {
        try {
          const props = await api.get("/admin-users/propositions/");
          propositionEnAttente = props.data.some((p) => p.employee_id === choix.id);
        } catch {
          propositionEnAttente = false;
        }
      }
      onSaved(node.level, data);
      setResultat({ propositionEnAttente });
    } catch (err) {
      const data = err.response?.data;
      // Erreur de champ (ex. responsable déjà à la tête d'une autre unité).
      setErreur(data?.error || data?.detail || data?.responsable?.[0] || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const bouton = (principal) => ({
    background: principal ? theme.primary : theme.bg,
    color: principal ? theme.surface : theme.textSecondary,
    border: `1px solid ${principal ? theme.primary : theme.border}`,
    borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 440,
          border: `1px solid ${theme.border}`, boxShadow: theme.shadowXl,
        }}
      >
        <h2 id={titleId} style={{ color: theme.text, margin: "0 0 4px", fontSize: 17, fontWeight: 800 }}>
          {roleLabel}
        </h2>
        <div style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 18 }}>{node.nom}</div>

        {resultat ? (
          <>
            <p style={{ color: theme.text, fontSize: 14, lineHeight: 1.6, margin: "0 0 18px" }}>
              {choix.id ? `${choix.label} est désigné(e).` : "Le responsable a été retiré."}{" "}
              {resultat.propositionEnAttente &&
                "Cet employé n'a pas encore de compte : une proposition vous attend dans « Utilisateurs » pour la valider (c'est elle qui lui donne le droit de valider les congés)."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {resultat.propositionEnAttente && (
                <button type="button" style={bouton(true)} {...lienLigne("/users")}>
                  Valider le compte
                </button>
              )}
              <button type="button" style={bouton(!resultat.propositionEnAttente)} onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            <ResponsableField
              label={roleLabel}
              value={choix.id}
              currentLabel={choix.label}
              onChange={(id, label) => setChoix({ id, label: label || "" })}
            />
            {erreur && (
              <div role="alert" style={{ color: theme.danger, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                {erreur}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" style={bouton(false)} onClick={onClose}>Annuler</button>
              <button type="button" style={bouton(true)} disabled={saving} onClick={enregistrer}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DesignerResponsableModal;

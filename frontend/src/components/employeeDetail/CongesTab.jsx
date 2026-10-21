import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import CongeStatutBadge from "../conges/CongeStatutBadge";
import SoldesCard from "../conges/SoldesCard";
import SoldeModal from "../conges/SoldeModal";
import { FileTextIcon } from "../icons";
import { formatDateFR } from "../../utils/formatDate";
import { refVersUrl } from "../../utils/conges";
import { canRequestConges, canSeeConges } from "../../config/accesSections";

// Une ligne de mouvement touche au plus un exercice (droit/consommé) et/ou les
// compteurs de l'employé.
const COLONNES_MOUVEMENT = [
  ["d_droit", "Droit"], ["d_consomme", "Consommé"],
  ["d_cp_consomme", "CP"], ["d_retrait_cs", "CS"], ["d_droit_initial", "Droit initial"],
];

const signe = (n) => `${n > 0 ? "+" : ""}${n}`;

const variationsTexte = (m) => {
  const parties = COLONNES_MOUVEMENT
    .filter(([cle]) => m[cle])
    .map(([cle, label]) => `${label} ${signe(m[cle])}`);
  return [m.exercice && `Exercice ${m.exercice}`, ...parties].filter(Boolean).join(" · ");
};

// Onglet « Congés » de la fiche employé : soldes (reliquat, annuel, anticipé…),
// titres de CET employé et, pour le traiteur, l'historique des mouvements
// (calqué sur AttestationsTab). Les droits sont revérifiés côté serveur :
// un demandeur ne voit que les soldes de son périmètre, sans l'historique.
const CongesTab = ({ activeTab, employee, user, navigate }) => {
  const theme = useTheme();
  const [soldeData, setSoldeData] = useState(null);
  const [demandes, setDemandes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modale, setModale] = useState(false);
  const canSee = canSeeConges(user);
  const canRequest = canRequestConges(user);
  const isTraiteur = !!user?.can_manage_conges;
  const matricule = employee.matricule;

  const charger = useCallback(async () => {
    const [s, d] = await Promise.all([
      api.get(`/conges/soldes/${matricule}/`),
      api.get("/conges/demandes/", { params: { employee: matricule } }),
    ]);
    setSoldeData(s.data);
    setDemandes(d.data?.results || d.data || []);
  }, [matricule]);

  useEffect(() => {
    if (activeTab !== "conges" || !canSee) return undefined;
    let annule = false;
    setLoading(true);
    charger().catch(() => {}).finally(() => { if (!annule) setLoading(false); });
    return () => { annule = true; };
  }, [activeTab, canSee, charger]);

  if (activeTab !== "conges") return null;

  const bloc = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 24 };
  if (!canSee) {
    return (
      <div className="tab-content" style={{ ...bloc, color: theme.textMuted, fontSize: 13 }}>
        Vous n'avez pas accès aux demandes de congé.
      </div>
    );
  }

  const entete = (texte) => (
    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textSecondary, borderLeft: `4px solid ${theme.primary}`, paddingLeft: 8 }}>
      {texte}
    </div>
  );
  const bouton = {
    background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`, borderRadius: 8,
    padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  };
  const initialise = !!soldeData?.initialise;
  const mouvements = soldeData?.mouvements || [];

  return (
    <div className="tab-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {loading ? (
        <div style={{ ...bloc, textAlign: "center", color: theme.textSecondary }}>Chargement...</div>
      ) : (
        <>
          <SoldesCard solde={soldeData?.solde} initialise={initialise}>
            {isTraiteur && (
              <div style={{ marginTop: 16 }}>
                <button type="button" onClick={() => setModale(true)} className="btn-lift" style={bouton}>
                  {initialise ? "Corriger les soldes" : "Initialiser les soldes"}
                </button>
              </div>
            )}
          </SoldesCard>

          <div style={bloc}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              {entete("Titres de congé")}
              {canRequest && (
                <button
                  type="button"
                  onClick={() => navigate("/conges/nouvelle", { state: { employeeId: employee.id } })}
                  className="btn-lift"
                  style={{ ...bouton, background: theme.primary, color: "#fff", border: "none" }}
                >
                  + Nouvelle demande
                </button>
              )}
            </div>
            {demandes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: theme.textMuted, fontSize: 13 }}>
                Aucune demande de congé pour cet employé.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {demandes.map((d) => (
                  <Link
                    key={d.id}
                    to={`/conges/${refVersUrl(d.reference)}`}
                    className="card-lift"
                    style={{
                      display: "flex", alignItems: "center", gap: 12, textDecoration: "none",
                      border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 14px", flexWrap: "wrap",
                    }}
                  >
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: theme.primaryBg, color: theme.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FileTextIcon size={15} />
                    </div>
                    <div style={{ flex: "0 0 100px", fontWeight: 700, color: theme.primary, fontSize: 13 }}>{d.reference}</div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ color: theme.text, fontSize: 13, fontWeight: 600 }}>
                        {formatDateFR(d.date_depart)} → {formatDateFR(d.date_retour)} · {d.nb_jours} j
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 1 }}>
                        Demandée le {formatDateFR(d.created_at)} par {d.demandeur_nom}
                      </div>
                    </div>
                    <CongeStatutBadge statut={d.statut} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {isTraiteur && mouvements.length > 0 && (
            <div style={bloc}>
              <div style={{ marginBottom: 14 }}>{entete("Historique des mouvements")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mouvements.map((m) => (
                  <div key={m.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: theme.text, fontSize: 13, fontWeight: 700 }}>{m.nature_libelle}</span>
                      <span style={{ color: theme.textMuted, fontSize: 11 }}>
                        {formatDateFR(m.created_at)} · {m.auteur_nom}
                      </span>
                    </div>
                    <div style={{ color: theme.textSecondary, fontSize: 12, marginTop: 3 }}>{variationsTexte(m) || "—"}</div>
                    {m.motif && <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{m.motif}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {modale && (
        <SoldeModal
          matricule={matricule}
          initialise={initialise}
          solde={soldeData?.solde}
          onClose={() => setModale(false)}
          onDone={async () => { setModale(false); await charger(); }}
        />
      )}
    </div>
  );
};

export default CongesTab;

import { useNavigate } from "react-router-dom";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatHistogram from "../../components/charts/StatHistogram";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";
import { formatDateFR } from "../../utils/formatDate";

export default function Demographie({ data, params, onParams }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const horizon = params.horizon || data.horizon;
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Pyramide des âges">
          <StatHistogram data={data.pyramide_age} xKey="tranche" dataKey="count" color={theme.departementColor}
            urlDe={(e) => `/employees?age_min=${e.min}&age_max=${e.max}`}
            onBarClick={(e) => navigate(`/employees?age_min=${e.min}&age_max=${e.max}`)} />
        </Carte>
        <Carte titre="Pyramide d'ancienneté">
          <StatHistogram data={data.pyramide_anciennete} xKey="tranche" dataKey="count" color={theme.serviceColor}
            urlDe={(e) => `/employees?anciennete_min=${e.min}&anciennete_max=${e.max}`}
            onBarClick={(e) => navigate(`/employees?anciennete_min=${e.min}&anciennete_max=${e.max}`)} />
        </Carte>
      </div>
      <Carte
        titre="Prévisions : départs à la retraite et effectif projeté (sans recrutement)"
        action={
          <label style={{ fontSize: 12, color: theme.textSecondary, display: "flex", alignItems: "center", gap: 6 }}>
            Horizon
            <select
              aria-label="Horizon"
              value={horizon}
              onChange={(e) => onParams({ horizon: Number(e.target.value) })}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} an{n > 1 ? "s" : ""}</option>)}
            </select>
          </label>
        }
      >
        <TableauSimple
          colonnes={[
            { cle: "annee", libelle: "Année", format: (v) => `Année ${v}` },
            { cle: "fin", libelle: "Jusqu'au", format: (v) => formatDateFR(v) },
            { cle: "departs", libelle: "Départs à la retraite" },
            { cle: "fins_cdd", libelle: "Fins de CDD connues" },
            { cle: "effectif_projete", libelle: "Effectif projeté" },
          ]}
          lignes={data.previsions}
        />
        {data.deja_atteint > 0 && (
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 10 }}>
            Dont {data.deja_atteint} agent(s) ayant déjà dépassé l'âge de retraite (comptés en année 1).
          </div>
        )}
      </Carte>
      <Carte titre={`Postes à risque : tous les titulaires partent d'ici ${horizon} an(s)`}>
        <TableauSimple
          colonnes={[
            { cle: "poste", libelle: "Fonction" },
            { cle: "nb_titulaires", libelle: "Titulaires" },
            { cle: "premiere_retraite", libelle: "Premier départ", format: (v) => formatDateFR(v) },
            { cle: "titulaires", libelle: "Détail", format: (v) => v.map((t) => `${t.nom} (${formatDateFR(t.date_retraite)})`).join(", ") },
          ]}
          lignes={data.postes_a_risque}
          vide="Aucun poste à risque sur cet horizon."
        />
      </Carte>
      <Carte titre="Âge et ancienneté par direction">
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: "Direction" },
            { cle: "total", libelle: "Effectif" },
            { cle: "age_moyen", libelle: "Âge moyen" },
            { cle: "anciennete_moyenne", libelle: "Ancienneté moyenne" },
            { cle: "nb_55_plus", libelle: "55 ans et plus" },
            { cle: "departs_horizon", libelle: `Départs sous ${horizon} an(s)` },
          ]}
          lignes={data.par_direction}
        />
      </Carte>
    </>
  );
}

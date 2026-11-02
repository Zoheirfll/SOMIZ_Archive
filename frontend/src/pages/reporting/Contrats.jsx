import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import { formatDateFR } from "../../utils/formatDate";

const SEUILS = [30, 60, 90, 120, 180, 365];

export default function Contrats({ data, onParams }) {
  const theme = useTheme();
  const versFiche = (c) => `/employees/${c.employee_matricule || c.matricule}`;
  const colonnesContrat = (cleJours, libelleJours) => [
    { cle: "numero_contrat", libelle: "N° contrat" },
    { cle: "employee_nom", libelle: "Employé" },
    { cle: "date_fin", libelle: "Date de fin", format: (v) => formatDateFR(v) },
    { cle: cleJours, libelle: libelleJours },
  ];
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte
        titre={`Contrats arrivant à échéance (${data.echeance_jours} jours)`}
        action={
          <select
            aria-label="Seuil d'échéance"
            value={data.echeance_jours}
            onChange={(e) => onParams({ echeance_jours: Number(e.target.value) })}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
          >
            {SEUILS.map((j) => <option key={j} value={j}>{j} jours</option>)}
          </select>
        }
      >
        <TableauSimple colonnes={colonnesContrat("jours_restants", "Jours restants")} lignes={data.contrats_echeance}
          lien={versFiche} vide="Aucun contrat à échéance." />
      </Carte>
      <Carte titre="Contrats échus — dossiers à mettre à jour (employés actifs)">
        <TableauSimple colonnes={colonnesContrat("jours_depasses", "Jours de dépassement")} lignes={data.contrats_echus}
          lien={versFiche} vide="Aucun contrat échu non traité." />
      </Carte>
      <Carte titre="Agents en contrats à durée déterminée successifs">
        <TableauSimple
          colonnes={[{ cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" }, { cle: "nb_cdd", libelle: "Nombre de CDD" }]}
          lignes={data.cdd_enchaines}
          lien={versFiche}
          vide="Aucun agent avec plusieurs CDD."
        />
      </Carte>
      <Carte titre="Actifs par type de contrat">
        <StatDonutChart data={data.repartition_type_contrat} height={220} />
      </Carte>
    </>
  );
}

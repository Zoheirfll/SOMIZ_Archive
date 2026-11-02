import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { formatDateFR } from "../../utils/formatDate";

export default function Carriere({ data }) {
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Évolutions par axe">
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: "Axe" },
            { cle: "changements", libelle: "Changements sur la période" },
            { cle: "duree_moyenne", libelle: "Durée moyenne dans la situation actuelle", format: (v) => `${v} ans` },
          ]}
          lignes={data.axes}
        />
      </Carte>
      <Carte titre="Transferts par unité de destination">
        <StatDonutChart data={data.transferts_par_destination} height={220} />
      </Carte>
      <Carte titre={`Agents sans évolution depuis ${data.annees_sans_evolution} ans ou plus`}>
        <TableauSimple
          colonnes={[
            { cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" },
            { cle: "poste", libelle: "Fonction" },
            { cle: "depuis", libelle: "Dernière évolution", format: (v) => formatDateFR(v) },
            { cle: "annees", libelle: "Années" },
          ]}
          lignes={data.sans_evolution}
          lien={(l) => `/employees/${l.matricule}`}
          vide="Aucun agent concerné."
        />
      </Carte>
    </>
  );
}

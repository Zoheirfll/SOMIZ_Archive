import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import StatDonutChart from "../../components/charts/StatDonutChart";
import StatAreaChart from "../../components/charts/StatAreaChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

export default function Conges({ data }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Jours de congé par mois de départ">
        <StatAreaChart data={data.jours_par_mois} xKey="mois" series={[{ key: "jours", label: "Jours", color: theme.primary }]} />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 }}>
        <Carte titre="Jours par type"><StatDonutChart data={data.jours_par_type} height={220} /></Carte>
        <Carte titre="Jours par direction"><StatDonutChart data={data.jours_par_direction} height={220} /></Carte>
        <Carte titre="Demandes par statut"><StatDonutChart data={data.demandes_par_statut} height={220} /></Carte>
      </div>
      <Carte titre="Congés exceptionnels par motif">
        <StatDonutChart data={data.jours_par_motif_ce} height={220} />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Soldes par exercice">
          <TableauSimple
            colonnes={[
              { cle: "exercice", libelle: "Exercice" }, { cle: "droit", libelle: "Droit" },
              { cle: "consomme", libelle: "Consommé" }, { cle: "reste", libelle: "Reste" },
            ]}
            lignes={data.soldes_par_exercice}
            vide="Aucun solde saisi."
          />
        </Carte>
        <Carte titre="Plus forts soldes restants">
          <TableauSimple
            colonnes={[{ cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" }, { cle: "reste", libelle: "Jours restants" }]}
            lignes={data.forts_soldes}
            lien={(l) => `/employees/${l.matricule}`}
            vide="Aucun solde restant."
          />
        </Carte>
      </div>
    </>
  );
}

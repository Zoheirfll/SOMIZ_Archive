import { useState } from "react";
import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import PyramideSexe from "../../components/reporting/PyramideSexe";
import StatDonutChart from "../../components/charts/StatDonutChart";
import { useTheme } from "../../context/ThemeContext";
import useIsMobile from "../../hooks/useIsMobile";

const AXES = [
  { cle: "par_direction", libelle: "Direction" },
  { cle: "par_departement", libelle: "Département" },
  { cle: "par_categorie", libelle: "Catégorie" },
  { cle: "par_type_contrat", libelle: "Type de contrat" },
  { cle: "par_fonction", libelle: "Fonction" },
];

export default function Parite({ data }) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [axe, setAxe] = useState("par_direction");
  const libelleAxe = AXES.find((a) => a.cle === axe).libelle;
  const grille = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 20 };
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <div style={grille}>
        <Carte titre="Répartition des actifs"><StatDonutChart data={data.repartition} height={220} /></Carte>
        <Carte titre="Responsables d'unité"><StatDonutChart data={data.encadrement} height={220} /></Carte>
        <Carte titre="Recrutements de la période"><StatDonutChart data={data.recrutements} height={220} /></Carte>
      </div>
      <Carte titre="Pyramide des âges par sexe">
        <PyramideSexe lignes={data.pyramide_age_sexe} />
      </Carte>
      <Carte
        titre={`Parité par ${libelleAxe.toLowerCase()}`}
        action={
          <select
            aria-label="Axe de ventilation"
            value={axe}
            onChange={(e) => setAxe(e.target.value)}
            style={{ border: `1px solid ${theme.border}`, borderRadius: 8, padding: "5px 8px", fontSize: 12, fontFamily: theme.fontFamily, background: theme.surface, color: theme.text }}
          >
            {AXES.map((a) => <option key={a.cle} value={a.cle}>{a.libelle}</option>)}
          </select>
        }
      >
        <TableauSimple
          colonnes={[
            { cle: "nom", libelle: libelleAxe },
            { cle: "hommes", libelle: "Hommes" },
            { cle: "femmes", libelle: "Femmes" },
            { cle: "non_renseigne", libelle: "Non renseigné" },
            { cle: "total", libelle: "Total" },
            { cle: "taux_feminisation", libelle: "Féminisation", format: (v) => `${v} %` },
          ]}
          lignes={data[axe]}
        />
      </Carte>
      <Carte titre="Ancienneté moyenne par sexe">
        <TableauSimple
          colonnes={[{ cle: "sexe", libelle: "Sexe" }, { cle: "anciennete_moyenne", libelle: "Ancienneté moyenne", format: (v) => `${v} ans` }]}
          lignes={data.anciennete_par_sexe}
        />
      </Carte>
    </>
  );
}

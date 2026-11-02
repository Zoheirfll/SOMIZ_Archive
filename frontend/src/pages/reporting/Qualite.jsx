import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import BarreTaux from "../../components/reporting/BarreTaux";
import useIsMobile from "../../hooks/useIsMobile";
import useLienLigne from "../../hooks/useLienLigne";

// Seules les données avec un filtre de liste existant sont cliquables.
const LIENS_MANQUANTS = { sexe: "/employees?sexe=non_renseigne" };

export default function Qualite({ data }) {
  const lienLigne = useLienLigne();
  const isMobile = useIsMobile();
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Données manquantes (actifs)">
        <TableauSimple
          colonnes={[{ cle: "libelle", libelle: "Donnée" }, { cle: "nb", libelle: "Actifs concernés" }, { cle: "taux", libelle: "Part", format: (v) => `${v} %` }]}
          lignes={data.champs_manquants}
          lien={(l) => LIENS_MANQUANTS[l.champ] || null}
        />
      </Carte>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
        <Carte titre="Complétude des dossiers par direction">
          {data.completude_par_direction.map((r) => (
            <BarreTaux key={r.id} libelle={r.nom} taux={r.taux}
              {...lienLigne(`/employees?direction=${r.slug}&dossier_complet=0`)} />
          ))}
        </Carte>
        <Carte titre="Complétude des dossiers par département">
          {data.completude_par_departement.map((r) => (
            <BarreTaux key={r.id} libelle={r.nom} sous={r.direction_nom} taux={r.taux}
              {...lienLigne(`/employees?departement=${r.slug}&dossier_complet=0`)} />
          ))}
        </Carte>
      </div>
      {data.incoherences.map((i) => (
        <Carte key={i.code} titre={`${i.libelle} (${i.lignes.length})`}>
          <TableauSimple
            colonnes={[{ cle: "matricule", libelle: "Matricule" }, { cle: "nom", libelle: "Employé" }, { cle: "detail", libelle: "Détail" }]}
            lignes={i.lignes}
            lien={(l) => `/employees/${l.matricule}`}
            vide="Aucune anomalie."
          />
        </Carte>
      ))}
    </>
  );
}

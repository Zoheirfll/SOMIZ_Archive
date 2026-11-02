import KpiGrid from "../../components/reporting/KpiGrid";
import Carte from "../../components/reporting/Carte";
import TableauSimple from "../../components/reporting/TableauSimple";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import LienNav from "../../components/LienNav";

// Lien pré-filtré vers /audit (compte + période). /audit ne filtre que sur une
// action unique, pas sur le contenu de `details` : le lien ouvre le journal du
// compte sur la période, non filtré par type d'action (même règle que
// l'ancienne page /statistiques).
export const lienAudit = (username, periode) => {
  if (!username || !periode) return null;
  const p = new URLSearchParams({ user: username, date_debut: periode.debut, date_fin: periode.fin });
  return `/audit?${p.toString()}`;
};

const COLONNES = [
  ["employes_crees", "Créés"], ["employes_transferts", "Transférés"], ["employes_carriere", "Carrière"],
  ["employes_champs", "Champs"], ["employes_photo", "Photos"], ["employes_archives", "Archivés"],
  ["employes_restaures", "Restaurés"], ["employes_supprimes", "Suppr. définitives"],
  ["contrats_crees_modifies", "Contrats"], ["contrats_supprimes", "Contrats suppr."],
  ["documents_uploades", "Doc. uploadés"], ["documents_supprimes", "Doc. supprimés"],
  ["documents_modifies", "Doc. modifiés"], ["comptes_mdp", "Mots de passe"],
];

export default function Activite({ data }) {
  const { user } = useAuth();
  const theme = useTheme();
  const monLien = lienAudit(user?.username, data.periode);
  const lien = (href, texte) => href && (
    <LienNav to={href} style={{ color: theme.primary, fontWeight: 600, fontSize: 13 }}>{texte}</LienNav>
  );
  const mes = COLONNES.filter(([cle]) => (data.mon_activite[cle] || 0) > 0)
    .map(([cle, libelle]) => ({ id: cle, action: libelle, nombre: data.mon_activite[cle] }));
  const colonnesAdmin = COLONNES.filter(([cle]) => (data.activite_par_admin || []).some((a) => a[cle] > 0));
  return (
    <>
      <KpiGrid kpis={data.kpis} />
      <Carte titre="Mon activité">
        <TableauSimple colonnes={[{ cle: "action", libelle: "Action" }, { cle: "nombre", libelle: "Nombre" }]}
          lignes={mes} vide="Aucune activité sur cette période." />
        {monLien && <div style={{ marginTop: 10 }}>{lien(monLien, "Voir mon journal d'audit →")}</div>}
      </Carte>
      {user?.role === "SUPERADMIN" && data.activite_par_admin && (
        <Carte titre="Activité par administrateur">
          <TableauSimple
            colonnes={[{ cle: "nom_complet", libelle: "Compte" }, ...colonnesAdmin.map(([cle, libelle]) => ({ cle, libelle })),
              { cle: "username", libelle: "Preuve", format: (u) => lien(lienAudit(u, data.periode), "Journal →") }]}
            lignes={data.activite_par_admin}
            vide="Aucune activité sur cette période."
          />
        </Carte>
      )}
    </>
  );
}

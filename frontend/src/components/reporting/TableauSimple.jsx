// frontend/src/components/reporting/TableauSimple.jsx
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import useLienLigne from "../../hooks/useLienLigne";

const PAR_PAGE = 10;

// colonnes : [{ cle, libelle, format? }]. Une ligne `masque` (effectif sous
// le seuil, voir backend reporting/rh/commun.masquer) affiche « — » et une
// info-bulle au lieu des valeurs masquées.
// Au-delà de PAR_PAGE lignes : recherche plein texte + pagination (les
// listes de fonctions/postes peuvent compter des centaines d'entrées).
// `lien(ligne)` -> url : ligne qui mène à une page (Ctrl/clic molette = nouvel onglet) ;
// `onLigne(ligne)` : action sur place (ex. supprimer un objectif).
export default function TableauSimple({ colonnes, lignes, vide = "Aucune donnée.", onLigne, lien, parPage = PAR_PAGE }) {
  const theme = useTheme();
  const lienLigne = useLienLigne();
  const [page, setPage] = useState(0);
  const [recherche, setRecherche] = useState("");

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q || !lignes) return lignes || [];
    return lignes.filter((l) => colonnes.some((c) => String(l[c.cle] ?? "").toLowerCase().includes(q)));
  }, [lignes, colonnes, recherche]);

  const nbPages = Math.max(1, Math.ceil(filtrees.length / parPage));
  // Données rafraîchies ou recherche modifiée : on revient dans les bornes.
  useEffect(() => { if (page >= nbPages) setPage(0); }, [page, nbPages]);

  if (!lignes || lignes.length === 0) {
    return <div style={{ color: theme.textMuted, fontSize: 13 }}>{vide}</div>;
  }
  const pagine = lignes.length > parPage;
  const visibles = pagine ? filtrees.slice(page * parPage, (page + 1) * parPage) : filtrees;
  const bouton = (actif) => ({
    padding: "4px 10px", borderRadius: 6, fontSize: 12, border: `1px solid ${theme.border}`,
    background: theme.surface, color: actif ? theme.text : theme.textMuted, cursor: actif ? "pointer" : "default",
  });

  return (
    <div>
      {pagine && (
        <input
          type="search"
          value={recherche}
          onChange={(e) => { setRecherche(e.target.value); setPage(0); }}
          placeholder={`Rechercher parmi ${lignes.length} lignes…`}
          aria-label="Rechercher dans le tableau"
          style={{
            width: "100%", boxSizing: "border-box", marginBottom: 8, padding: "6px 10px", fontSize: 13,
            borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.text,
          }}
        />
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}`, textAlign: "left" }}>
              {colonnes.map((c) => (
                <th key={c.cle} style={{ padding: "8px 6px", color: theme.textSecondary, whiteSpace: "nowrap" }}>{c.libelle}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l, i) => (
              <tr
                key={l.id || `${l.nom || l.matricule || ""}-${i}`}
                {...(lien && lien(l) ? lienLigne(lien(l)) : { onClick: onLigne ? () => onLigne(l) : undefined })}
                title={l.masque ? "Effectif trop faible : détail masqué pour protéger l'anonymat" : undefined}
                style={{ borderBottom: `1px solid ${theme.borderLight}`, cursor: onLigne || (lien && lien(l)) ? "pointer" : "default" }}
              >
                {colonnes.map((c) => {
                  const v = l[c.cle];
                  const texte = v === null || v === undefined ? "—" : c.format ? c.format(v, l) : v;
                  return <td key={c.cle} style={{ padding: "8px 6px", color: theme.text }}>{texte}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagine && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: theme.textMuted }}>
          <span>
            {filtrees.length === 0 ? "Aucun résultat." :
              `${page * parPage + 1}–${Math.min((page + 1) * parPage, filtrees.length)} sur ${filtrees.length}`}
          </span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} style={bouton(page > 0)}>‹ Précédent</button>
            <span>{page + 1} / {nbPages}</span>
            <button type="button" disabled={page >= nbPages - 1} onClick={() => setPage(page + 1)} style={bouton(page < nbPages - 1)}>Suivant ›</button>
          </span>
        </div>
      )}
    </div>
  );
}

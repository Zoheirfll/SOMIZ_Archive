# Statistiques et « Mon activité »

> À lire avant de toucher à /statistiques, à audit/stats.py ou aux liens de preuve vers /audit.
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Page Statistiques (2026-09-02)

`/statistiques` (ADMIN/SUPERADMIN, distincte de `/dashboard`) : analyse RH
détaillée — répartitions Direction/Département/Catégorie/Type de
contrat/Fonction, évolution mensuelle recrutements vs archivages,
pyramides âge/ancienneté, contrats arrivant à échéance (seuil réglable,
90 jours par défaut), complétude par unité, filtres de date (préréglages
+ plage libre) avec comparaison à la période précédente, export Excel
(`.xlsx`) et PDF (impression navigateur). Logique de calcul centralisée
dans `backend/audit/stats.py` (`build_stats_detail()`), consommée par
`GET /api/reporting/stats-detail/` (JSON) et
`GET /api/reporting/stats-export.xlsx/` (export).

### "Mon activité" — décompte des actions par compte

Les statistiques principales (répartitions, évolution, pyramides,
échéances, complétude) restent **toujours organisation-wide**, pour
ADMIN comme SUPERADMIN — pas de restriction de périmètre sur cette
partie de la page (essayé puis abandonné : un ADMIN doit garder la vue
d'ensemble complète, exactement comme avant ce chantier).

En complément, une section **"Mon activité"** donne à chaque compte
ADMIN/SUPERADMIN le décompte de ses propres actions sur la période
sélectionnée (mêmes filtres de date que le reste de la page) :
employés créés/modifiés/archivés (`AuditLog` du compte, types
`CREATE_EMP`/`MODIFY_EMP`, archivage = `MODIFY_EMP` avec
`details.transfer.statut.vers` dans les libellés d'archivage),
documents supprimés/modifiés (`AuditLog` `DELETE_DOC`/`MODIFY_DOC`), et
**documents uploadés** — ce dernier compte les `EmployeeDocument`
**actuellement présents** (`uploaded_by`, `is_active=True`,
`uploaded_at` dans la période), pas les entrées `UPLOAD` du journal
d'audit : celles-ci persistent après une suppression définitive (hard
delete, voir section "Documents employés"), ce qui gonflerait
indéfiniment ce compteur avec des documents qui n'existent plus. Upload
manuel et "Scanner un dossier" (scan-import) sont comptés ensemble, sans
distinction (même type d'objet créé).

Un `SUPERADMIN` reçoit en plus **"Activité par administrateur"** — la
même ventilation pour tous les comptes ADMIN/SUPERADMIN actifs, en
tableau comparatif (`audit.stats._activite_par_admin()`). Logique
commune dans `audit.stats._activity_counts(user, date_debut, date_fin)`,
réutilisée par `_mon_activite()` (le compte connecté) et
`_activite_par_admin()` (tous les comptes).

Côté UI (`Statistiques.jsx`), un compteur/une colonne à zéro est
masqué·e — seuls les indicateurs "présents" (valeur > 0) s'affichent,
pour ne pas polluer la page de zéros sans intérêt sur une période donnée.

Ce mécanisme est propre à `/statistiques` — il ne touche pas au scoping
CONSULTANT (`employee_scope_q`/`can_access_employee`, voir section
Scoping) ni à la visibilité du journal d'audit par rôle (voir en-tête de
ce fichier), qui restent des mécanismes indépendants.

### Recherche, seuil réglable, drill-down et liens de preuve (2026-09-27)

- **Recherche dans les donuts** — `StatDonutChart.jsx` affiche un champ de
  recherche au-dessus de la légende dès que la répartition dépasse 8
  entrées (filtre la légende, grise les tranches non correspondantes sans
  changer le total affiché au centre). `repartition_fonction` n'agrège
  plus au-delà d'un Top 10 (`TOP_FONCTIONS`/`_repartition_fonction()`
  supprimés côté backend) — toutes les fonctions sont renvoyées, sinon la
  recherche ne pourrait jamais retrouver une fonction cachée dans
  "Autres".
- **Seuil d'échéance réglable** — `_contrats_echeance(jours=90)` et
  `build_stats_detail(..., echeance_jours=90)` acceptent désormais un
  nombre de jours ; `GET /api/reporting/stats-detail/` et
  `stats-export.xlsx/` lisent `?echeance_jours=` (1-365, 400 sinon). UI :
  sélecteur de seuil (30/60/90/120/180/365 jours + valeur personnalisée)
  au-dessus du tableau "Contrats arrivant à échéance".
- **Drill-down complétude** — cliquer sur une barre de département ou une
  ligne de la liste sous le radar Direction navigue vers
  `/employees?direction=<id>&dossier_complet=0` (ou `?departement=`),
  réutilisant le filtre `dossier_complet` déjà existant sur
  `EmployeeListCreateView`.
- **Liens de preuve catégorisés** — chaque tuile de "Mon activité" et
  chaque cellule de "Activité par administrateur" est un lien vers
  `/audit?user=...&categorie=<clé>&date_debut=...&date_fin=...`.
  `AuditLogListView` (`backend/audit/views.py`) accepte `?categorie=`,
  qui réutilise `_categorize_emp_log`/`_ACTIVITY_KEYS` de
  `audit/stats.py` (seule source de vérité de cette classification) pour
  les catégories issues de `CREATE_EMP`/`MODIFY_EMP`/`DELETE_EMP`, et
  mappe directement `documents_supprimes`/`documents_modifies`/
  `documents_uploades` sur `DELETE_DOC`/`MODIFY_DOC`/`UPLOAD`. Le lien
  `documents_uploades` est une approximation (best effort sur le journal
  `UPLOAD`, jamais parfaitement aligné avec le compteur qui ne compte que
  les documents encore présents) — signalée par une info-bulle sur la
  tuile côté UI. Une catégorie inconnue est ignorée silencieusement,
  comme les autres paramètres invalides de cette vue.

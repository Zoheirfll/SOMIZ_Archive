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

---

## Tableau de bord : encart d'échéances + audit des requêtes (2026-10-19)

- **Encart « Contrats arrivant à échéance »** (`components/dashboard/ContratsEcheanceCard.jsx`) :
  `GET /api/reporting/stats/` (`AdminStatsView`) renvoie désormais `contrats_echeance` (les 5 plus
  proches, fenêtre 30 jours = celle de la notification `notifier_echeances_contrat`) et
  `contrats_echeance_total` (nombre exact, pour « Voir tout » → /statistiques). Réutilise
  `audit/stats.py#_contrats_echeance`, qui expose `employee_matricule` (lien par matricule). Badge rouge à
  ≤ 7 jours, ambre sinon. Vue ADMIN/SUPERADMIN, organisation-wide comme le reste du dashboard.
- **Le cron `notifier_echeances_contrat` n'est toujours pas planifié** (voir `notifications.md`) : sans lui,
  l'encart est à jour mais aucune notification ne part.
- **N+1 corrigés** (tests : `test_admin_stats_view.py`, `test_stats_completude_groupes.py`,
  `test_employee_list_dossier_complet.py` — chacun compte les requêtes ou les jointures et échoue si elles
  croissent avec le nombre de types, de groupes ou de mois) :

  | Où | Avant | Après |
  |---|---|---|
  | `AdminStatsView` (complétude par type) | 1 requête par type de document | 1 requête agrégée |
  | `AdminStatsView`, `_dossiers_completes_par_mois_completion`, `_indicateurs` | 1 jointure `documents` par type obligatoire | `audit/stats.py#_employes_complets` (une annotation) |
  | `_completude_par` (par direction / département) | 1 requête + 1 jointure par type, **par groupe** | 2 requêtes au total |
  | `_evolution_mensuelle` | 2 requêtes par mois (≈ 50 pour 24 mois) | 2 requêtes agrégées (`TruncMonth`) |
  | `EmployeeListCreateView` `?dossier_complet=` | 1 jointure `documents` par type (3 pour 2 types, 10 pour 9) | 1 annotation `nb_obligatoires_presents` |
- **Règle conservée à l'identique** : sans aucun type obligatoire configuré, **tout dossier est complet**
  (`Employee.dossier_complet`, `EmployeeListSerializer.get_dossier_complet`, `AdminStatsView`,
  `?dossier_complet=true` → tous, `=false` → aucun). Un test le verrouille.
- **Non traité** : `EmployeeListSerializer` recalcule `types_total` / `types_obligatoires_total` à chaque
  requête de liste (2 `COUNT` triviaux) ; pas de cache. Les gains sont mesurés en **nombre de requêtes sur
  la base de test**, pas en millisecondes sur la base de production : à mesurer.
- **Chantier suivant** : complétude par type de contrat — spec à valider dans
  `docs/superpowers/specs/2026-10-19-completude-par-type-contrat-design.md`.

---

## Menu « Statistiques » — reporting RH par page (2026-10-30)

Spec : `docs/superpowers/specs/2026-10-30-reporting-statistiques-design.md` ; plan :
`docs/superpowers/plans/2026-10-30-reporting-rh-pages.md`.

- **Remplace la page unique `/statistiques`** (qui redirige désormais vers `/statistiques/synthese`) par un menu
  déroulant de 7 pages, liste unique dans `frontend/src/config/reportingPages.js` (navbar + routeur
  `pages/reporting/RapportRH.jsx`) : **Synthèse DRH**, **Effectifs**, **Parité**, **Démographie & retraites**,
  **Contrats**, **Qualité des données**, **Activité des comptes**. Tout le contenu de l'ancienne page est repris
  (répartitions → Effectifs ; pyramides → Démographie ; échéances → Contrats ; complétude → Qualité ; « Mon
  activité » et « Activité par administrateur » → Activité).
- **Backend : app `reporting`**. Endpoint unique `GET /api/reporting/rh/<page>/` (`RapportRHView`, `IsAdmin`),
  paramètres `date_debut`, `date_fin`, `echeance_jours` (1-365), `horizon` (1-10 ans) ; `?fmt=xlsx` renvoie un
  classeur (un onglet par table d'export du constructeur), tracé `AuditLog EXPORT` avec
  `details.type = 'reporting_rh'` et `details.page`. Un constructeur par page dans `reporting/rh/*.py`, fonction pure
  `construire(params, user)`, qui **réutilise** `audit/stats.py` sans le déplacer.
- **Définitions centralisées** : `reporting/rh/definitions.py` donne libellé et mode de calcul de chaque indicateur ;
  l'API les renvoie avec la valeur, l'UI les affiche en info-bulle (« i » sur chaque tuile). Ne jamais réécrire une
  formule dans une page.
- **Retraite** : 60 ans hommes, 55 ans femmes (`settings.REPORTING_AGE_RETRAITE`) ; sexe non renseigné → 60 ans et
  compté en « prévisions incertaines ». Les agents ayant déjà dépassé l'âge sont comptés en année 1. Effectif projeté
  = actifs − départs à la retraite − fins de CDD connues, **sans recrutement**.
- **Postes à risque** : fonctions dont **tous** les titulaires actifs, d'âge connu, atteignent l'âge de retraite dans
  l'horizon choisi (liste nominative, ADMIN/SUPERADMIN).
- **Masquage des petits effectifs** : seuil `settings.REPORTING_SEUIL_PETITS_EFFECTIFS = 2`, appliqué aux
  ventilations croisées avec le sexe ou l'âge (Parité par axe, Démographie par direction) : une cellule d'un seul
  agent affiche « — » et une info-bulle. Limite connue : avec 2, une cellule de 2 agents reste affichée.
- **Sorties** : encore datées par le journal d'audit (jour de l'archivage), libellées « Sorties (date
  d'archivage) » jusqu'au chantier `date_sortie` (`docs/superpowers/plans/2026-10-30-fondations-reporting.md`).
- **Performance** : aucune requête par employé ; un test vérifie que le nombre de requêtes de la Synthèse ne dépend
  pas des effectifs. Piège rencontré : des employés de test homonymes nés le même jour sont de vrais « doublons
  probables » et ajoutent une requête légitime (liste des doublons) — le test leur donne des noms distincts.
- **Conservés, plus utilisés par l'UI** : `GET /api/reporting/stats-detail/` et `stats-export.xlsx/` (tests
  existants inchangés). À retirer dans un chantier ultérieur si rien d'autre ne les appelle.
- **Liens de preuve vers /audit** (un clic par compteur de « Mon activité ») : **non repris** dans la page Activité
  (tableau simple). À rétablir si l'usage le demande.
- **Approches écartées** : une seule page à onglets (ne répond pas au besoin « une page par point » dans un menu
  déroulant) ; dupliquer `Statistiques.jsx` par thème (≈ 700 lignes copiées par page, incohérences) ; commencer par
  `date_sortie` et la photo mensuelle (rien de visible ; sans production, l'historique n'avait rien à accumuler).

---

## Photo mensuelle des effectifs (2026-10-30)

- **But** : comparaisons exactes dans le temps (N/N-1, évolution sur 12 à 36 mois) même après une réorganisation.
- **Modèle** `reporting.EffectifInstantane` : un **nombre** d'agents par date de photo × unité (direction,
  département, service) × sexe × catégorie × type de contrat × tranche d'âge × tranche d'ancienneté. **Aucune donnée
  nominative.** Libellés d'unité **figés** à la date de la photo.
- **Présence à une date** (`reporting/instantanes.py#_presents`) : recruté au plus tard ce jour-là et non sorti
  (actif, ou `date_sortie` postérieure). Un sorti **sans** `date_sortie` est exclu (on ne sait pas s'il était là) ;
  un actif sans date de recrutement n'est compté que dans la photo du jour, jamais dans une reconstitution.
- **Commande** `python manage.py photo_effectifs [--date AAAA-MM-JJ] [--amorcer N]` : idempotente (remplace les
  lignes de la date). `--amorcer N` reconstitue les N mois précédents, marqués `reconstitue=True` (affectation
  **actuelle** des agents, donc approximatif après une réorganisation) et **n'écrase jamais une vraie photo**.
- ⚠️ **À planifier le 1er de chaque mois lors de la mise en production** (avec `notifier_echeances_contrat`) : sans
  cela, l'historique reste vide sans aucune erreur visible. En développement, lancer la commande à la main.
- **App `reporting`** plutôt que `audit` : évite de dépendre des migrations `audit` en cours sur la branche congés.
- **Pas encore exploitée par les pages** : la page Mouvements & rétention et les comparaisons N/N-1 d'effectif
  viendront ensuite ; les sorties du reporting restent datées par l'audit d'ici là.


---

## Reporting complet : 13 pages, objectifs, faits marquants, rapports (2026-10-30)

Suite du menu Statistiques, dans la même app `reporting` et le même endpoint `GET /api/reporting/rh/<page>/`.

| Page | Route | Accès (en plus d'ADMIN/SUPERADMIN) | Constructeur |
|---|---|---|---|
| Synthèse DRH | `/statistiques/synthese` | — | `rh/synthese.py` |
| Effectifs | `/statistiques/effectifs` | — | `rh/effectifs.py` |
| Parité | `/statistiques/parite` | — | `rh/parite.py` |
| Démographie & retraites | `/statistiques/demographie` | — | `rh/demographie.py` |
| Mouvements & rétention | `/statistiques/mouvements` | — | `rh/mouvements.py` |
| Carrière & mobilité | `/statistiques/carriere` | — | `rh/carriere.py` |
| Contrats | `/statistiques/contrats` | — | `rh/contrats.py` |
| Comparaison des unités | `/statistiques/unites` | — | `rh/unites.py` |
| Qualité des données | `/statistiques/qualite` | — | `rh/qualite.py` |
| Documents & archives | `/statistiques/documents` | — | `rh/documents.py` |
| Congés | `/statistiques/conges` | `can_manage_conges` | `rh/conges.py` |
| Attestations & consultations | `/statistiques/demandes` | `can_manage_attestations` **ou** `can_manage_consultations` (chaque section n'est calculée que pour son traiteur) | `rh/demandes.py` |
| Activité des comptes | `/statistiques/activite` | — (tableau par administrateur : SUPERADMIN) | `rh/activite.py` |
| Bilan social (export seul) | `?fmt=xlsx` sur `rh/bilan/` | — | `rh/bilan.py` |

Le droit par page est porté par `reporting.views.PAGES` (403 côté serveur) et reflété dans le menu par
`frontend/src/config/reportingPages.js` (`visible(user)`) ; une page non autorisée redirige vers la Synthèse.

- **Mouvements sur la vraie date de sortie** : entrées (`date_embauche`), sorties (`date_sortie`), effectif moyen =
  moyenne des effectifs présents au premier et au dernier jour (même règle de présence que la photo mensuelle),
  turnover = ((entrées + sorties) / 2) / effectif moyen, taux de départ = sorties / effectif moyen. Les sortis **sans**
  date sont comptés à part (« sorties non datées ») et listés dans Qualité pour être complétés. **La Synthèse utilise
  désormais ces vraies sorties** (et non plus la date d'archivage de l'audit).
- **Rétention par promotion** : pour chaque année de recrutement (6 dernières), part encore présente 1, 3 et 5 ans
  après ; un jalon pas encore atteint est vide ; les sortis non datés sont exclus de leur promotion.
- **Carrière** : un « changement » est une période d'historique ouverte dans la période qui n'est pas la première de
  l'agent (affectation initiale exclue) ; « sans évolution » = aucune nouvelle période fonction/catégorie/échelle
  depuis 5 ans (à défaut, depuis le recrutement) ; transferts lus dans l'audit (`details.transfer`).
- **Comparaison des unités** : une ligne par direction + la ligne Organisation ; couleur d'une cellule selon son écart
  à l'organisation (≥ 10 %) et le sens de l'indicateur (`unites.INDICATEURS` : favorable haut/bas ou neutre).
  Colonnes sexe/âge masquées pour une direction d'un seul agent.
- **Congés** : jours pris = congés accordés ou interrompus (jours effectifs si interrompus) dont le départ tombe dans
  la période ; délai = date d'établissement − date de la demande ; soldes par exercice et 20 plus forts soldes
  restants (nominatif, traiteur des congés). Pas de « taux d'absentéisme » : SOMIZ ne connaît pas les absences.
- **Objectifs DRH** (`reporting.ObjectifIndicateur`, `GET/PUT /api/reporting/objectifs/`, `DELETE
  /api/reporting/objectifs/<code>/`) : une cible « au moins / au plus » par indicateur, appliquée à toute réponse
  par `reporting/objectifs.py#appliquer_objectifs` (une requête) : chaque KPI reçoit `cible`, `ecart`, `atteint`. Un
  objectif manqué devient un fait marquant. **Traçabilité limitée** : auteur et date de la dernière modification dans
  la table, **pas d'action d'audit dédiée** (en ajouter une demande une migration de `audit`, évitée tant que la
  migration `audit` du chantier congés n'est pas commitée).
- **Faits marquants** (`rh/synthese.py`) : règles fixes, seuils en tête du module — entrées ou sorties en variation
  d'au moins 50 % vs période précédente ; direction avec au moins 2 sorties et au moins le double de la période
  précédente ; objectif non atteint. Pas d'IA.
- **Bilan social** : `rh/bilan.py` concatène les tables d'export des pages Employés (onglets préfixés, titres
  dédoublonnés par `export.py`). Bouton sur la Synthèse ; export tracé comme les autres (`page = 'bilan'`).
- **Rapport mensuel** (`reporting.RapportMensuel`, commande `python manage.py rapport_mensuel [--mois AAAA-MM]`) :
  PDF ReportLab de la Synthèse du mois écoulé (indicateurs, cibles, alertes, faits marquants — agrégé uniquement),
  idempotent, notification `GENERIQUE` aux ADMIN/SUPERADMIN. Fichier sous `MEDIA_ROOT/rapports/` (nom aléatoire),
  servi **uniquement** par `GET /api/reporting/rapports-mensuels/<id>/fichier/`, téléchargement tracé
  (`EXPORT`, `type = rapport_mensuel`). ⚠️ À planifier le 1er du mois en production, **après** `photo_effectifs`.
- **Piège du shell** : sous Git Bash, un heredoc contenant des apostrophes françaises a été mal découpé par l'outil ;
  les scripts de génération ont été écrits dans des fichiers plutôt que passés en ligne de commande.

### Compléments du 2026-10-31

- **Objectifs DRH tracés** : action d'audit `MODIFY_OBJECTIF` (migration `audit/0020`), détails
  `operation` (creation/modification/suppression), `code`, `avant`, `apres`.
- **Liens de preuve rétablis** sur la page Activité : « Voir mon journal d'audit » et, pour le SUPERADMIN,
  une colonne « Preuve » par administrateur → `/audit?user=…&date_debut=…&date_fin=…` (non filtré par type
  d'action : /audit ne filtre pas sur `details`).
- **Tableaux paginés** : `TableauSimple` affiche 10 lignes par page + recherche dès que la liste dépasse
  10 lignes (ex. Effectifs par fonction : plusieurs centaines d'intitulés). Approche écartée : défilement
  interne (barre de scroll dans la carte) — moins lisible et pas de recherche.
- **Rapport mensuel PDF refait** (`reporting/rapport_pdf.py`, platypus) : bandeau, tuiles d'indicateurs
  (variation colorée selon que la hausse est favorable ou non — `HAUSSE_DEFAVORABLE` —, objectif atteint ou
  non), graphique de l'effectif sur 12 photos mensuelles, répartition par direction, encadrés alertes/faits
  marquants, pied de page « diffusion restreinte » paginé. Couleurs = palette claire de `theme.js`
  recopiée en tête du module (le PDF ne lit pas les tokens JS). Piège : les flèches ▲▼ n'existent pas dans
  la police Helvetica standard de ReportLab — retirées.

- **Droit d'accès `acces_statistiques`** (2026-10-31) : voir `securite.md` point 54. Le menu Statistiques n'apparaît
  qu'aux comptes ayant au moins une page visible (`pagesVisibles`, `config/reportingPages.js` :
  `peutVoirStatistiques` par défaut, `visible()` pour Congés/Demandes).

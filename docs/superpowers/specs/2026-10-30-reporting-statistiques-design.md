# Reporting complet — menu « Statistiques » (design)

> Spec issue du brainstorming du 2026-10-30. Seul le champ `Employee.sexe` est déjà implémenté ; le reste est à
> planifier. Lire avant : `docs/fonctionnel/statistiques-audit.md` (existant `/statistiques`, `audit/stats.py`).

## Objectif

Remplacer l'unique page `/statistiques` par un **menu déroulant « Statistiques »** (comme « Demandes » et
« Administration »), avec **une page par point**, pour donner à la DRH et à la GRH un reporting de **pilotage** :
des chiffres exacts, comparables dans le temps, et des analyses qui aident à décider (prévisions, risques, écarts
aux objectifs), pas seulement des répartitions.

## Décisions validées

| Sujet | Décision |
|---|---|
| Thèmes | Employés (8 pages), Documents & Archives, Attestations + Consultations, Congés |
| Architecture | Socle commun réutilisable + un module backend et une page par thème (pas de copie de `Statistiques.jsx`) |
| Accès | Par thème, selon les drapeaux « chargé de… » ; vérifié côté serveur sur chaque endpoint |
| Parité | Champ `Employee.sexe` (M/F) **ajouté le 2026-10-30** (`employes.md`, `securite.md` point 52) ; la part « non renseigné » est toujours affichée |
| Sorties | **Nouveau champ `Employee.date_sortie`** (vraie date de départ) — remplace la date du clic d'archivage |
| Historique | **Photo mensuelle des effectifs** (table d'instantanés figés) pour des comparaisons exactes dans le temps |
| Analyses | Prévision des départs + postes à risque, rétention par promotion, carte de chaleur + objectifs DRH, faits marquants + rapport mensuel |
| Retraite | **60 ans pour les hommes, 55 ans pour les femmes** (paramétrables par sexe). Sexe non renseigné : calcul à 60 ans, agent compté à part comme « prévision incertaine » |
| Turnover | Taux principal = ((entrées + sorties) / 2) / effectif moyen ; affiché **avec** le taux de départ = sorties / effectif moyen. Les deux définitions en info-bulle |
| Petits effectifs | Seuil **paramétrable, 2 par défaut** (une cellule d'1 seul agent est masquée) |
| Hors périmètre | Salaires (aucune donnée dans SOMIZ) ; absentéisme maladie (aucune donnée d'absence, seulement CP/CE/CS) |

## Fondations de données (préalable à tout indicateur de mouvement)

### Constat

Aujourd'hui une sortie est datée par l'audit au **jour du clic « Archiver »** (`audit/stats.py#_indicateurs`,
`AuditLog` `MODIFY_EMP` avec `details.transfer.statut.vers`), pas au jour du départ réel. Un employé parti en mars et
archivé en septembre compte en septembre ; un employé importé déjà archivé n'a aucune sortie ; l'effectif à une date
passée ne peut pas être reconstitué. Turnover, ancienneté au départ et comparaisons N/N-1 seraient faux.

### `Employee.date_sortie`

- `DateField` nullable. **Demandé à l'archivage** (modale d'archivage, unitaire et en masse ; défaut = aujourd'hui,
  modifiable) ; colonne d'import `date_sortie` ; vidé à la restauration.
- Validation : `date_sortie ≥ date_embauche` ; obligatoire pour passer au statut archivé/démobilisé via l'UI.
- **Saisie manuelle** au clic sur « Archiver » (décision du 2026-10-30) : la modale d'archivage exige la date de
  sortie. **Archivés existants** : aucune reprise automatique ni estimation ; ils restent `date_sortie` vide et sont
  listés dans la page Qualité des données pour saisie manuelle depuis leur fiche.
- Les indicateurs de mouvement lisent `date_sortie` ; un archivé sans `date_sortie` est compté à part
  (« sorties non datées ») au lieu d'être ignoré.

### Photo mensuelle des effectifs

- Table `EffectifInstantane` : date de la photo (1er du mois), unité (direction/département/service…), sexe,
  catégorie, type de contrat, tranche d'âge, tranche d'ancienneté, **nombre** d'agents. Uniquement des agrégats,
  **aucune donnée nominative** (pas de matricule ni de nom).
- Remplie par une **tâche planifiée** le 1er de chaque mois (commande `manage.py` idempotente, relançable sans
  doublon), avec les libellés d'unité **figés** au moment de la photo (une réorganisation ne réécrit pas le passé).
- **Amorçage** : les mois antérieurs sont reconstitués une fois à partir de `date_embauche` / `date_sortie`, marqués
  `reconstitue=True` et signalés comme tels dans l'UI (précision moindre après une réorganisation).
- ⚠️ Comme `notifier_echeances_contrat`, la tâche n'a de valeur que **planifiée en production** : à inscrire dans la
  checklist de déploiement, sinon l'historique reste vide sans erreur visible.

## Navigation et routes

Menu « Statistiques » à deux niveaux ; une entrée n'apparaît que si le compte y a droit, le menu disparaît si aucune
n'est accessible.

| Route | Page | Accès |
|---|---|---|
| `/statistiques/synthese` | Synthèse DRH (accueil du reporting) | ADMIN, SUPERADMIN |
| `/statistiques/effectifs` | Effectifs & structure | ADMIN, SUPERADMIN |
| `/statistiques/parite` | Parité & diversité | ADMIN, SUPERADMIN |
| `/statistiques/demographie` | Démographie & prévisions | ADMIN, SUPERADMIN |
| `/statistiques/mouvements` | Mouvements, turnover & rétention | ADMIN, SUPERADMIN |
| `/statistiques/contrats` | Contrats | ADMIN, SUPERADMIN |
| `/statistiques/carriere` | Carrière & mobilité | ADMIN, SUPERADMIN |
| `/statistiques/qualite` | Qualité des données | ADMIN, SUPERADMIN |
| `/statistiques/documents` | Documents & Archives | ADMIN, SUPERADMIN |
| `/statistiques/demandes` | Attestations / Consultations (sélecteur de section) | SUPERADMIN ou ADMIN `charge_attestation` / `charge_consultation` selon la section |
| `/statistiques/conges` | Congés | SUPERADMIN ou ADMIN `charge_conge` |

L'ancienne `/statistiques` **redirige** vers `/statistiques/synthese` ; les liens existants (dashboard, « Voir tout »
des échéances) sont repointés vers la page précise. Le contenu actuel est repris, sans changement de comportement,
dans Effectifs, Démographie, Contrats et Qualité.

## Socle commun

**Frontend** `components/reporting/` : barre de filtres (préréglages de période, plage libre, comparaison N-1,
périmètre organisationnel), tuiles KPI (valeur, variation, cible, info-bulle de définition), cartes de graphiques
(donut, barres, courbes, pyramide, carte de chaleur), tableaux triables, boutons d'export Excel/PDF. Tokens de
`theme.js`, styles inline, rafraîchissement silencieux (`fetch*(true)`).

**Backend** `audit/reporting/` : un module par thème avec une fonction `build_*()` pure, utilitaires partagés
(périodes, comparaison, seuil de petits effectifs, export xlsx), un endpoint JSON et un export par thème sous
`/api/reporting/`. `build_stats_detail()` est déplacée sans changement de comportement ; les tests existants doivent
rester verts.

**Définitions centralisées** : un seul module `audit/reporting/definitions.py` porte la formule et le libellé de
chaque indicateur (turnover, taux de féminisation, effectif moyen…) ; l'API renvoie la définition avec la valeur,
l'UI l'affiche en info-bulle. Une formule ne se réécrit jamais localement dans une page.

## Contenu des pages Employés

- **Synthèse DRH** : 8 à 10 KPI clés avec variation N/N-1 et écart à la cible (effectif, taux de féminisation, âge
  moyen, ancienneté moyenne, turnover, départs à la retraite à 12 mois, contrats à échéance, complétude des
  dossiers) ; bloc **Faits marquants** (voir plus bas) ; **alertes** (unités sans responsable, CDD à échéance < 30
  jours, postes à risque, dossiers incomplets, sorties non datées) ; chaque KPI renvoie à sa page détaillée.
- **Effectifs & structure** : effectif total / actifs / archivés ; évolution mensuelle (photo mensuelle) ; effectif par
  direction, pôle, département, service, cellule, section ; répartition par catégorie, échelle, poste, type de
  contrat ; part CDI/CDD ; taux d'encadrement ; postes sans titulaire ; unités sans responsable.
- **Parité & diversité** : répartition H/F globale et par direction, département, catégorie, échelle, poste, type de
  contrat ; **féminisation de l'encadrement** (responsables d'unité H/F) ; recrutements et départs par sexe ; pyramide
  des âges **par sexe** (gauche/droite) ; ancienneté moyenne par sexe ; part « non renseigné » toujours affichée.
- **Démographie & prévisions** : pyramide des âges ; âge moyen et médian par unité ; ancienneté moyenne et
  répartition ; agents de 55 ans et plus ; **prévision des départs à la retraite** à 1, 2, 3, 4 et 5 ans par unité et
  par fonction ; **effectif projeté** (actuel − retraites − fins de CDD connues, sans recrutement) ; **postes à
  risque** : fonction tenue par une seule personne (ou dont tous les titulaires) part à la retraite dans les N ans
  — liste nominative réservée ADMIN/SUPERADMIN, jamais exportée hors de cette page.
- **Mouvements, turnover & rétention** : entrées/sorties par mois, an et unité (sur `date_sortie`) ; taux de
  rotation ; sorties par motif d'archivage (`MotifArchivage.categorie`) ; ancienneté au départ ; départs de moins d'un
  an ; solde net ; **rétention par promotion** : pour chaque année de recrutement, part encore présente à 1, 3 et 5
  ans (tableau en escalier) ; sorties non datées comptées à part.
- **Contrats** : échéances (seuil réglable) ; contrats arrivés à terme sans renouvellement ; enchaînements de CDD ;
  durée moyenne ; agents sans contrat actif ou au statut incohérent.
- **Carrière & mobilité** : changements de poste, catégorie, échelle par période (`HistoriqueFonction/Categorie/
  Echelle`) ; durée moyenne dans un poste/une échelle ; agents sans évolution depuis N ans ; transferts entre unités.
- **Qualité des données** : score de qualité par unité ; complétude des dossiers par unité et par type de contrat ;
  champs manquants (date de naissance, sexe, date d'embauche, **date de sortie des archivés**) ; doublons probables ;
  incohérences (fin avant début, sortie avant embauche, archivé sans motif). Chaque ligne mène à la fiche à corriger.

## Analyses d'aide à la décision (transverses)

- **Carte de chaleur** : unités en lignes, indicateurs en colonnes (turnover, âge moyen, part de 55 ans et plus,
  féminisation, complétude…), couleur selon l'écart à la moyenne de l'organisation ou à la cible ; tri par colonne.
- **Objectifs DRH** : table `ObjectifIndicateur` (indicateur, périmètre optionnel, valeur cible, sens « au moins /
  au plus », exercice), saisie par un ADMIN/SUPERADMIN depuis le reporting ; chaque KPI affiche la cible et l'écart.
  Création/modification tracées dans l'audit.
- **Faits marquants** : règles **déterministes** (pas d'IA), seuils paramétrables — ex. turnover d'une unité ≥ 2 ×
  N-1, effectif d'une unité en baisse de plus de 10 %, cible manquée, hausse des dossiers incomplets, poste à risque
  apparu. Chaque fait cite les chiffres et renvoie à la page concernée.
- **Rapport mensuel** : PDF généré le 1er du mois (après la photo mensuelle) contenant la Synthèse DRH et les faits
  marquants ; stocké côté serveur, consultable depuis le reporting ; notification in-app aux ADMIN/SUPERADMIN
  (`notifications/service.py`). Téléchargement tracé dans l'audit. Même contrainte de planification que la photo.

## Fonctions transverses (toutes les pages)

- **Comparaison N / N-1** et évolution sur 12, 24 ou 36 mois pour chaque KPI (sur les photos mensuelles).
- **Drill-down** : chaque barre, tranche ou cellule ouvre la liste `/employees` filtrée (filtres existants +
  `?sexe=`, à compléter de `?sortie_debut=`/`?sortie_fin=`).
- **Tableaux croisés** : ventilation de n'importe quel indicateur par unité × catégorie/sexe/type de contrat.
- **Bilan social annuel** : export PDF/Excel consolidé (toutes les pages Employés sur l'exercice choisi). Tracé.
- **Notes de lecture** : info-bulle « définition et mode de calcul » sur chaque indicateur (module de définitions).

## Contenu des autres thèmes

- **Documents & Archives** : volumétrie et stockage, uploads par période et par type, complétude par type,
  suppressions (via l'audit), documents par unité.
- **Attestations + Consultations** : volume par statut, délai moyen et médian de traitement, taux de rejet, motifs,
  par demandeur et par unité, demandes en retard ; pour les consultations : prolongations, révocations.
- **Congés** : **jours de congé pris** par type (CP / CE / CS) et par mois, soldes par exercice, jours pris par unité,
  validations / rejets / annulations / interruptions, agents à fort solde. (Pas de « taux d'absentéisme » : SOMIZ ne
  connaît pas les absences maladie ou injustifiées.)

## Garde-fous (non négociables)

- Droit vérifié **côté serveur** sur chaque endpoint + un test d'intégration par thème sur la vraie route.
- Données **agrégées** dans les pages et exports ; seules exceptions nominatives : postes à risque et lignes de
  Qualité des données (ADMIN/SUPERADMIN, pour agir) — jamais de NIN / sécu / RIB.
- **Seuil de petits effectifs** : une cellule de ventilation sous le seuil (2 par défaut, paramétrable) est masquée,
  pour éviter l'identification par recoupement. Limite assumée : avec 2, une cellule de 2 agents reste affichée et
  chacun peut déduire l'information de l'autre (ex. « 2 femmes de 55 ans et plus » dans un service) ; relever à 3 si
  le reporting est diffusé au-delà de la DRH.
- La photo mensuelle ne contient **aucune donnée nominative**.
- Chaque export et chaque téléchargement de rapport est **tracé dans l'audit** (`AuditLog.action` ≤ 20 caractères).
- Tests de comptage de requêtes (pas de N+1), comme `test_admin_stats_view.py`.
- Chaque page documentée dans `docs/fonctionnel/` ; entrée dans `securite.md` pour les droits, exports et données
  nominatives.
- Scoping : vue organisation-wide pour ADMIN/SUPERADMIN (règle actuelle de /statistiques) ; à ne pas ouvrir aux
  comptes CONSULTANT/GESTIONNAIRE.

## Ordre de réalisation (un plan → implémentation par étape)

Ordre révisé le 2026-10-30 : **les pages visibles d'abord**. Sans production, l'argument « commencer tôt
l'historique » ne tient pas ; démarrer par les fondations n'aurait rien changé à l'écran.

1. **Socle commun** + menu navbar + redirection + module de définitions, puis les pages qui n'exigent pas
   `date_sortie` : Synthèse DRH, Effectifs, Parité, Démographie & prévisions (dont postes à risque), Contrats,
   Qualité (migration de l'existant d'abord). Les indicateurs de sortie existants restent datés par l'audit, avec la
   mention « date d'archivage ».
2. **Fondations de données** : `date_sortie` + photo mensuelle (app `reporting`) — plan
   `docs/superpowers/plans/2026-10-30-fondations-reporting.md`.
3. Mouvements & rétention, Carrière (sur `date_sortie` et les photos).
4. **Analyses** : carte de chaleur, objectifs DRH, faits marquants, rapport mensuel, bilan social.
5. Congés. 6. Demandes. 7. Documents & Archives.

## Questions ouvertes

- Si un champ personnalisé « SEXE » existe déjà en base : reprise des valeurs dans `Employee.sexe` (script validé,
  sauvegarde), puis désactivation.
- **Pas encore de production** (projet en développement au 2026-10-30) : la photo mensuelle et le rapport mensuel
  sont livrés comme commandes `manage.py` lançables à la main en dev ; leur planification (cron système ou Celery
  beat) est une **tâche de la checklist de mise en production**, avec `notifier_echeances_contrat`.

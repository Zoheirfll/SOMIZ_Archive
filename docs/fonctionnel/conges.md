# Demandes de congé, soldes et titre de congé

> À lire avant de toucher à l'app `conges` (demandes de congé, soldes **par exercice**, motifs à durée fixe, pièces
> jointes, validation, annulation, interruption, bascule du 1er juillet, titre de congé PDF, configuration).
>
> Spec de conception : `docs/superpowers/specs/2026-10-20-demandes-conge-design.md` — plan d'exécution du backend :
> `docs/superpowers/plans/2026-10-20-conges-backend.md`. **État au 2026-10-21 : backend et frontend livrés, révision
> « soldes par exercice » incluse** (migration `conges/0002_soldes_par_exercice`) ; restent l'import des soldes de
> départ, la planification de l'ouverture d'exercice et l'affinage du PDF — voir « Reste à faire ».
>
> **Révision du 2026-10-21** (demande de l'utilisateur après essai du formulaire) : le demandeur choisit lui-même
> type, motif et exercice ; les soldes passent de trois compartiments (reliquat/annuel/anticipé) à **une ligne par
> exercice** ; motifs à **durée fixe** et **pièces justificatives** configurables. L'ancien modèle à compartiments est
> décrit dans « Approches écartées ».

---

## Qui fait quoi

- **Demandeur** : `GESTIONNAIRE`/`CONSULTANT` portant `User.peut_demander_conge`, ou `SUPERADMIN`. Il saisit la demande
  pour un employé de son périmètre : **type** (CP/CE/CS), **motif** (filtré par type, actif), **exercice** (CP
  seulement), dates de départ et de retour, nombre de jours (prérempli, modifiable — **verrouillé** si le motif a une
  durée fixe), adresse durant le congé, commentaire, importance, **pièces justificatives facultatives**. Le traiteur
  retrouve ces choix préremplis et peut les corriger. Il ne voit que ses demandes.
- **Traiteur** : `SUPERADMIN`, ou `ADMIN` portant `User.charge_conge` (attribuable par un SUPERADMIN uniquement).
  Il valide, rejette, annule, interrompt, saisit et corrige les soldes, gère les motifs et la configuration.
- Un **ADMIN ordinaire** ne crée jamais de demande (séparation demandeur/traiteur), même avec `peut_demander_conge`
  en base.

## Soldes par exercice

- **`SoldeExercice`** : une ligne par employé **et par exercice** (`AAAA/AAAA`, du 1er juillet au 30 juin) — `droit`
  (jours acquis), `consomme`, propriété `restant = droit − consomme`. Contraintes en base : unicité
  (employé, exercice), `consomme ≥ 0`, `consomme ≤ droit`.
- **Groupe calculé, jamais stocké** (`services.categorie`) : exercice antérieur à l'exercice en cours → **Reliquat** ;
  exercice en cours → **Actuel** ; exercice suivant → **Anticipé**. Au-delà de l'anticipé : refusé partout.
  Exemple au 2026-10-21 : 2025/2026 et antérieurs = reliquat, 2026/2027 = actuel, 2027/2028 = anticipé.
- **`SoldeConge`** (un par employé) ne garde que les compteurs cumulés : `droit_initial`, `cp_consomme`, `retrait_cs`.
- **Totaux affichés** (`services.etat_soldes`, `GET soldes/<matricule>/`) : `reliquat`, `actuel`, `anticipe`,
  `disponible = reliquat + actuel` (l'anticipé n'y est pas compté), plus la liste `exercices` avec groupe et restant.
  La lecture **n'écrit rien** : un exercice en cours/anticipé pas encore ouvert y apparaît au droit annuel avec
  `ouvert: false`.
- **Droit annuel** : `ParametreConge.droit_annuel_jours`, **30 jours** par défaut (`GET|PUT /api/conges/parametres/`) —
  c'est le droit des exercices ouverts automatiquement.
- **Saisie initiale** (`POST soldes/<matricule>/initial/`, une seule fois) : `{"exercices": {"2025/2026": 13, …},
  droit_initial, cp_consomme, retrait_cs, motif}` — jours **restants** par exercice ; l'exercice en cours et
  l'anticipé non saisis sont ouverts au droit annuel.
- **Correction** (`…/correction/`, motif obligatoire) : `{"exercices": {exercice: variation signée}, compteurs…}` ;
  un exercice absent est créé (variation positive). Refus si un restant ou un compteur deviendrait négatif.
- Un solde **ne se modifie jamais directement** : uniquement par `conges/services.py` (`verrouiller_soldes()` =
  `select_for_update()` sur l'en-tête **et** les lignes, dans une transaction).

### Historique et intégrité (`MouvementConge`)

Chaque variation écrit une ligne **immuable** (`save()` sur une ligne existante et `delete()` lèvent `RuntimeError`) :
nature (`INITIAL`, `OUVERTURE`, `DEBIT`, `RETRAIT_CS`, `RESTITUTION_ANNULATION`, `RESTITUTION_INTERRUPTION`,
`CORRECTION`), **au plus un exercice** (`exercice`, `d_droit`, `d_consomme`) et/ou les compteurs (`d_droit_initial`,
`d_cp_consomme`, `d_retrait_cs`), instantané avant/après, motif, auteur. Un débit sur deux exercices écrit donc deux
lignes. **Invariant** : chaque compteur et chaque `droit`/`consomme` de ligne égale la somme des mouvements
(`services.ecarts_solde`, clés `cp_consomme` ou `2025/2026.droit`). `manage.py verifier_soldes_conges` le contrôle et
échoue (code ≠ 0) au moindre écart — à lancer après toute intervention manuelle en base.

**Piège technique** : l'agrégat par exercice (`values('exercice').annotate(Sum…)`) doit passer `order_by()` vide —
sinon le tri par défaut de `MouvementConge` (`-created_at`) s'ajoute au `GROUP BY` et casse le regroupement.

## Règles de débit (à la **validation** d'un titre, jamais à la demande)

- **CP** : **le plus ancien exercice qui a encore des jours se consomme d'abord** (`services.calculer_ventilation`).
  L'exercice de départ proposé est celui-là ; le serveur **refuse** de démarrer sur un exercice plus récent tant
  qu'un plus ancien n'est pas vidé (message « L'exercice X a encore N jour(s) : il doit être consommé avant Y »).
  L'excédent **déborde en cascade** sur les exercices suivants, jusqu'à l'anticipé ; si le total ne suffit pas,
  refus (`SoldeInsuffisant`, aucune écriture). Le titre stocke `ventilation = [{exercice, jours}, …]` et
  `categorie_exercice` (groupe de l'exercice de départ **figé à la validation**) ; `exercice` = exercice de départ.
  `cp_consomme` augmente du total.
- **CE** : aucun débit, tracé avec son motif. Fonctionne même sans solde initialisé. `exercice` vidé.
- **CS** : congé non payé, **aucun calcul** : aucun exercice débité ; seul le compteur technique `retrait_cs`
  augmente (trace). `exercice` vidé. **Décision du 2026-10-21** : ce compteur n'est **plus affiché** dans l'interface
  (carte des soldes, saisie initiale/correction) pour ne pas le confondre avec les soldes ; il reste en base, dans
  l'historique des mouvements et dans l'API.
- **CE** (décès, mariage, naissance…) : jamais comptabilisé avec l'annuel ni avec aucun exercice.
- **Motif à durée fixe** (`MotifConge.nb_jours_fixe`, ex. Mariage = 3 j) : le nombre de jours doit être exactement
  celui-ci, à la demande comme à la validation (sérialiseurs) ; l'interface le verrouille et calcule la date de retour.
- **Solde non initialisé** : une validation CP/CS est refusée avec un message explicite (« …ne sont pas initialisés »).

## Bascule du 1er juillet = ouverture d'exercice

**Aucun jour ne se déplace** : les groupes glissent tout seuls avec la date (l'actuel devient reliquat, l'anticipé
devient actuel). Il faut seulement **ouvrir la ligne du nouvel anticipé** au droit annuel.

- `services.ouvrir_exercices()` crée les lignes manquantes de l'exercice en cours et de l'anticipé (mouvement
  `OUVERTURE`). Elle est appelée par `verrouiller_soldes()` : **toute opération sur un solde rattrape d'elle-même** un
  1er juillet manqué. Idempotente.
- `manage.py basculer_exercice` fait la même chose pour tous les employés (une ligne d'audit `BASCULE_CONGE` si au
  moins un exercice a été ouvert). **Pas de Celery beat** : à planifier côté hôte chaque 1er juillet (facultatif grâce
  au rattrapage, mais utile pour que les soldes affichés soient à jour).
- **Restitution** (annulation, rejet d'un titre prêt, interruption) : vers les **mêmes exercices** que la ventilation,
  le plus ancien d'abord — aucun cas particulier après le 1er juillet puisque les exercices ne bougent jamais.

## Workflow d'un titre

Statuts : `recue` → `prete` → `recuperee`, plus `rejetee`, `annulee`, `interrompue`.

| Action | Route (traiteur) | Effet sur les soldes |
|---|---|---|
| Valider | `POST demandes/<ref>/valider/` | débit (voir ci-dessus), `traite_par`, `validateur_nom` figé |
| Rejeter | `POST …/rejeter/` | motif obligatoire ; si le titre était prêt, restitution intégrale |
| Marquer récupéré | `POST …/recuperee/` | aucun |
| **Annuler** (même signé) | `POST …/annuler/` | restitution intégrale, titre **conservé** (`Annulée`) |
| **Interrompre** | `POST …/interrompre/` | restitution des jours non pris |
| Observations | `PATCH …/observations/` | aucun ; modifiable tant que le titre n'est ni récupéré, ni annulé, ni interrompu |

- **À la validation** le traiteur vérifie (préremplis depuis la demande) et corrige au besoin : type, motif, exercice
  de départ, nombre de jours, dates ; il renseigne la date d'établissement, l'adresse, les observations ; signataire
  (titulaire ou intérim, **figé** sur le titre) ; il peut modifier la référence (format `NNNNN/AA`, unique).
- **Annulation** : motif obligatoire, **confirmation renforcée côté serveur** (`reference_confirmation` doit égaler la
  référence du titre), statuts annulables : `prete` et `recuperee`. Un titre `interrompue` n'est pas annulable en v1.
- **Interruption** (rappel de l'employé, ex. 10 jours prévus, rappelé au bout de 4) : statuts `prete`/`recuperee`,
  **une seule fois**. Le traiteur saisit la date de rappel (strictement entre départ et retour) et un motif ;
  `jours_effectifs = date_rappel − date_depart` ; la différence est restituée **exercice le plus ancien d'abord**, dans
  la limite de ce qui y avait été débité. Le titre d'origine reste intact (`ventilation` inchangée) ; la période effective devient
  `[départ, rappel[` pour le contrôle de chevauchement. Aucun nouveau document.
- **Congé terminé = titre figé (2026-10-28)** : dès que `date_retour <= aujourd'hui` (`DemandeConge.conge_termine`,
  exposé par l'API), un titre établi (`prete`/`recuperee`) ne peut plus être **annulé, interrompu ni rejeté** — les
  jours ont été consommés, les restituer fausserait les soldes. Contrôle dans `conges/workflow.py`
  (`_refuser_si_termine`, sous le verrou de la demande) ; l'UI masque les boutons et affiche une mention. Restent
  possibles : marquer récupéré, observations, aperçu PDF. Une demande encore `recue` (jamais validée, aucun débit)
  reste rejetable même si sa période est passée, pour pouvoir la clore.
- **Annulation par le demandeur** : `DELETE demandes/<ref>/`, statut `recue` seulement, soft-delete
  (`is_active=False`), sans effet sur les soldes.
- **Chevauchement** : période `[date_depart, date_retour[` (`date_retour` = date de reprise). Refus si elle recoupe
  une demande active (`recue`, `prete`, `recuperee`, `interrompue`) du même employé. `rejetee`, `annulee` et
  supprimées sont ignorées ; une reprise le jour d'un nouveau départ est acceptée.

## Titre de congé PDF (`conges/pdf.py`)

Calé sur le **modèle papier officiel** (relevé sur une photo du 2026-10-20) : en-tête société + logo, filet, cadre
« TITRE DE CONGE », **sous-titre** d'après `categorie_exercice` figé à la validation (« - RELIQUAT - »,
« - ANNUEL - » pour l'actuel, « - ANTICIPE - » ; « - CONGE EXCEPTIONNEL - » pour un CE ; « - CONGE SANS SOLDE - »
pour un CS) ; l'**Exercice** imprimé est l'exercice de départ, bloc REF N° /
MATRICULE / CONTRAT N°, Nom & Prénom, Fonction, **Structure** (direction / département) puis, **sur sa propre
ligne**, **Affectation** (service) — les deux en **abréviations** (`code` du référentiel, ex. « DAT / GMO »,
« GL3/Z » ; nom complet seulement si le code est vide). Corrigé le 2026-10-21 : côte à côte et en noms complets, la
structure chevauchait « Affectation ». Une valeur trop longue réduit sa police puis passe sur 2 lignes
(`_ligne_ajustee`), sans jamais sortir du cadre. La ligne **Exercice n'est imprimée que pour un CP** (CE/CS n'ont pas
d'exercice).
Nombre de jour, Date de Départ avec Date de Retour, Adresse durant Congé, Exercice, « Fait à Arzew, le : », bloc
signataire (« P.I » si intérim), pied de page. **Le papier ne porte pas de cadre « réservé à l'administration »** :
reliquat et ventilation restent dans la page du traiteur ; l'observation n'est pas imprimée.

- Réutilise l'en-tête, le cadre de titre et le bloc de référence de `attestations/pdf.py` ; `_draw_title(c, mention,
  titre=…)` a gagné un paramètre `titre` (valeur par défaut inchangée, test de non-régression). **Piège** : ne jamais
  réaffecter `titre` dans le corps de `_draw_title`, sinon le paramètre est ignoré (un test le garde).
- `GET demandes/<ref>/apercu/` : traiteur seul, uniquement après validation (`400` sinon). **Date imprimée figée au
  premier aperçu** (`date_document`) ; rouvrir un autre jour renvoie **409** `{needs_confirmation, date_document,
  date_nouvelle}` tant que `?confirmer_date=1` est absent. Un titre `annulee` imprime un filigrane « ANNULE ».
- **Mode test** : « (mode test) » en rouge sous le sous-titre tant que `CongeTemplateConfig.mode_test` est actif.
- **Mise en page** : positions en constantes `Y_*` / `X_*` de `conges/pdf.py`, ajustées par comparaison avec la photo
  (colonne des deux-points à 78 mm, 2e colonne placée dynamiquement après son libellé). **À affiner à partir du PDF
  officiel** que l'utilisateur doit fournir. Pour vérifier le rendu : générer un PDF d'exemple et le convertir avec
  `pdftoppm -png`.
- **Fax par défaut des congés : `213 (0) 41.68.01.03`** (valeur relevée sur le papier de congé) ; les attestations
  gardent leur valeur actuelle (`…01.63`) — incohérence à clarifier avec l'utilisateur.

## Configuration

`CongeTemplateConfig` (singleton `pk=1`, mêmes champs que l'attestation : société, adresse, signataire titulaire /
intérim, logo, `mode_test`). Routes : `GET|PUT|PATCH config/` (le logo s'envoie en `PATCH` multipart séparé),
`POST config/apercu/` (aperçu live, valeurs non enregistrées + titre fictif, **rien n'est persisté**),
`GET config/logo-defaut/`. Motifs : `GET|POST motifs/`, `GET|PATCH|DELETE motifs/<id>/` (DELETE = désactivation ;
champ `nb_jours_fixe` facultatif ; la réponse inclut `pieces`). **Lecture ouverte aux demandeurs** (ils choisissent le
motif), écriture réservée au traiteur. Pièces attendues : `POST motifs/<id>/pieces/`, `PATCH|DELETE
motifs/pieces/<id>/` (désactivation, jamais de suppression) — traiteur seul.

## Pièces jointes d'une demande (`PieceJointeConge`)

- **Facultatives**, téléversées par le demandeur (tant que la demande est `recue`) ou par le traiteur (tant qu'elle
  n'est ni rejetée ni annulée) : `POST demandes/<ref>/pieces/` (multipart `fichier`, `piece` = pièce attendue du
  **même motif**, ou `libelle` libre). MIME réel vérifié par python-magic, 20 Mo maximum, **nom de fichier régénéré
  en UUID** (`conge_piece_upload_path`, extension assainie) — le nom d'origine n'est gardé que pour l'affichage.
- `GET demandes/<ref>/pieces/` (liste, sans URL de fichier) et `GET demandes/<ref>/pieces/<id>/` (contenu servi par
  l'API, `X-Content-Type-Options: nosniff`) : traiteur, ou demandeur de **sa** demande uniquement.
- Ajout et **chaque consultation** tracés (`PIECE_CONGE`, `details.operation` = `ajout` / `consultation`).
- Le formulaire crée la demande puis téléverse les pièces : un échec d'envoi n'annule pas la demande, il est signalé
  sur la page de détail.

## Statistiques

`GET stats/?date_debut=&date_fin=` (traiteur) : `total`, `par_gestionnaire`, `par_employe`, `par_statut`,
`evolution_mensuelle`, `delai_moyen_jours` — mêmes clés que les statistiques des attestations. Exclut les demandes
supprimées par leur demandeur.

## Audit et notifications

- **Audit** : `CREATE_CONGE`, `VALIDER_CONGE`, `REJETER_CONGE`, `RECUPERER_CONGE`, `ANNULER_CONGE`,
  `INTERROMPRE_CONGE`, `DELETE_CONGE`, `MODIFY_CONGE`, `INITIAL_SOLDE_CONGE`, `CORRIGER_SOLDE_CONGE`, `BASCULE_CONGE`,
  `APERCU_CONGE`, `SCAN_CONGE`, `PIECE_CONGE`. **`AuditLog.action` est limité à 20 caractères.** La validation trace
  la ventilation par exercice et le groupe ; l'annulation trace les jours restitués par exercice.
- **Notifications** (`conges/notifications.py`, via `notify()`) : nouvelle demande (traiteurs), titre prêt / rejeté /
  annulé / interrompu (demandeur). Textes neutres : la référence uniquement. **Piège de test** : `notify()` diffère
  via `transaction.on_commit()` → utiliser `django_capture_on_commit_callbacks(execute=True)`.

## Autres points

- **URL par référence** : `/api/conges/demandes/00001-26/…` (le `/` de `NNNNN/AA` est encodé `-`,
  `ReferenceLookupMixin`).
- **Scan du titre signé** (`POST|PATCH …/scan/`) : optionnel, jamais bloquant ; type MIME vérifié par python-magic,
  20 Mo maximum.
- **Erreurs métier** : toute `CongeError` devient un HTTP 400 `{"error": "<message en français>"}`.
- **Scoping** : `GET soldes/<matricule>/` — le traiteur voit tout (avec l'historique des mouvements) ; un demandeur
  voit le solde d'un employé de son périmètre, sans l'historique ; hors périmètre → 403.

## Approches écartées

- Généraliser `attestations` en « demandes » à types multiples (risque de régression sur un module en production).
- Un socle commun à extraire d'abord (refactor disproportionné).
- Solde calculé depuis la date de recrutement (règles d'acquisition non fournies) : saisie initiale + calcul auto.
- Deux titres automatiques en cas de dépassement du reliquat : le papier porte un **seul** titre.
- Document officiel d'interruption : non demandé, l'interruption est un enregistrement avec recalcul et audit.
- Édition directe de la ventilation d'un titre validé : passer par annulation puis nouvelle demande.
- **Soldes à trois compartiments** (`reliquat`, `annuel`, `anticipe` sur `SoldeConge`, avec bascule qui déplaçait les
  jours au 1er juillet et `exercice_debit` pour restituer après une bascule) — première version livrée le
  2026-10-20, remplacée le 2026-10-21 : l'utilisateur a besoin de choisir l'exercice dans une **liste**
  (2025/2026, 2026/2027…) et de voir chaque exercice séparément ; un compartiment « reliquat » unique mélangeait
  plusieurs exercices et rendait la restitution après bascule complexe. Migration `0002` destructive sans perte
  (tables vides à ce moment-là).
- Pièces jointes obligatoires : refusé, elles sont facultatives (choix de l'utilisateur).
- Débit cantonné à l'exercice choisi : refusé, l'excédent déborde en cascade sur les exercices suivants.

## Frontend

- **Pages** : `/conges` (liste, « mes demandes » ou vue traiteur, onglet Statistiques réservé au traiteur),
  `/conges/nouvelle` (formulaire : infos de l'employé en lecture seule, type, motif filtré par type, exercice en
  **liste groupée Reliquat / Actuel / Anticipé** avec les jours restants — seul le plus ancien exercice non vide est
  sélectionnable, `ExerciceSelect.jsx` — nombre de jours prérempli depuis les dates et modifiable, verrouillé si le
  motif a une durée fixe, pièces justificatives facultatives), `/conges/:ref` (détail, pièces jointes, traitement).
  Routes protégées par `canSeeConges` / `canRequestConges` (`config/accesSections.js`) ; `/conges/nouvelle` précède
  `/conges/:ref` dans `App.js`. **Masquer un lien n'est qu'un confort : l'API reste le garde-fou.**
- **Détail d'un titre** (`CongeDetail.jsx`) : cartes employé / demande / titre établi / interruption / annulation /
  rejet, carte des soldes (traiteur) et actions selon le statut. **Valider** ouvre `ValiderModal` : le traiteur
  vérifie (préremplis depuis la demande) type, motif, exercice de départ, dates, adresse, observations, référence ;
  l'**aperçu du débit par exercice** (`calculerVentilation` de `utils/conges.js`, mêmes règles que le serveur) n'est qu'indicatif,
  le serveur reste l'unique juge. Après validation, le titre PDF s'ouvre (iframe sur une URL de blob, jamais de
  navigation directe vers `/api/...`). **Annuler le titre** exige de retaper la référence (`AnnulerModal`, revérifié
  côté serveur). **Interrompre le congé** : date de rappel + motif (`InterrompreModal`). Erreurs serveur affichées
  dans la modale, qui reste ouverte. Rouvrir l'aperçu un autre jour ouvre une confirmation (409).
- **Onglet « Congés » de la fiche employé** (`CongesTab.jsx`, à côté de Carrière) : soldes, titres de l'employé,
  historique des mouvements (traiteur seulement), saisie initiale / correction des soldes (`SoldeModal`). Bouton
  « Demander un congé » dans la sidebar du dossier (`DossierTab.jsx`).
- **Navigation** : entrée « Congés » dans le menu « Demandes » avec badge (traiteur : demandes reçues ; demandeur :
  titres prêts), palette de commandes (page + « Nouvelle demande de congé »), cases `charge_conge` /
  `peut_demander_conge` et boutons « Congés ✓/✗ » dans `/users` (le bouton traiteur n'apparaît que pour un SUPERADMIN).
- **Configuration** (`/parametres` → « Titre de congé », visible du traiteur seul) : `CongeParametresPanel` (droit
  annuel, motifs par type — désactivation, jamais de suppression) et le modèle du titre (aperçu live, mode test,
  signataire / intérim, logo). **Le panneau de configuration des attestations a été paramétré sur place**
  (`DocumentConfigPanel` dans `Parametres.jsx`, props `basePath`, `documentLabel`, `modeTestLabel`) : mêmes champs et
  mêmes valeurs par défaut pour les attestations, aucun comportement changé.
- **Tests** : `Conges`, `CongeNouvelle`, `CongeDetail`, `CongesTab`, `CongeParametresPanel`, `congesUtils`, plus les
  ajouts à `Navbar`, `Users`, `commandPaletteActions`, `accesSections` et `EmployeeDetail`.

- **Liste `/conges` (2026-10-26)** : navigation par année/mois de réception, regroupement par jour, colonnes Reçue/Prête/Récupérée, tri par en-tête, filtres importance et dates de départ — pattern commun décrit dans `ui-conventions.md` (« Listes de demandes »). Le détail `/conges/:ref` affiche le stepper Reçue → Prête → Récupérée (bandeau pour rejetée/annulée/interrompue), comme les attestations.

## Reste à faire

- Importer les soldes de départ des employés (saisie initiale en masse, aujourd'hui employé par employé).
- Planifier `basculer_exercice` (1er juillet) sur l'hôte — facultatif grâce au rattrapage automatique.
- Appliquer la migration `conges/0002_soldes_par_exercice` (+ `audit/0014`) sur la base de dev, après accord.
- Affiner les positions du PDF sur le fichier officiel fourni par l'utilisateur ; trancher le fax (`01.03` / `01.63`).

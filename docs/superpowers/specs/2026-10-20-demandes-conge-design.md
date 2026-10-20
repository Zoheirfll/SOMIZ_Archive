# Demandes de congé, soldes et titre de congé — conception

Date : 2026-10-20 · Statut : à valider (v2 — remplace la v1 du même jour : ajout des soldes, des types CP/CE/CS, de l'annulation, de l'interruption, de l'onglet profil et du modèle officiel de titre) · Approche retenue : **A** (nouvelle app `conges`, calquée sur `attestations`, sans toucher à l'existant).

## 1. Objectif

Un GESTIONNAIRE/CONSULTANT autorisé (ou un SUPERADMIN) saisit une demande de congé pour un employé de son périmètre. Un traiteur (SUPERADMIN, ou ADMIN portant `User.charge_conge`) la vérifie, renseigne le titre, la **valide** — ce qui débite les soldes de l'employé — et imprime le **titre de congé**. Le traiteur peut ensuite **annuler** un titre (même signé) ou **interrompre** un congé en cours ; chaque événement met à jour les soldes avec un audit complet.

Hors périmètre v1 : jours fériés/week-ends automatiques (jours calendaires), validation hiérarchique à deux niveaux, export Excel, plusieurs interruptions sur un même titre, document officiel d'interruption (aucun nouveau papier), demi-journées.

## 2. Soldes de congé

### 2.1 Compartiments (`SoldeConge`, un par employé)

| Champ | Sens |
|---|---|
| `reliquat` | jours des exercices antérieurs |
| `annuel` | droit de l'exercice en cours |
| `anticipe` | jours pris par avance sur l'exercice suivant — **jamais comptés** dans le solde actuel |
| `droit_initial` | droit cumulé depuis l'intégration |
| `cp_consomme` | CP pris depuis l'intégration (cumul) |
| `retrait_cs` | jours de congé sans solde (cumul) |

- **Solde actuel** = `reliquat` + `annuel`.
- **Exercice** : du 1er juillet au 30 juin, noté `2024/2025` (année de début / année de fin). L'exercice proposé pour un titre se déduit de sa date de départ ; l'admin peut le corriger.
- **Paramètre global** `ParametreConge` (singleton, `/parametres`) : `droit_annuel_jours` = **30**.
- **Alimentation** : saisie initiale par le traiteur (à la main ou par import) du solde de départ de chaque employé, avec confirmation et audit ; ensuite le calcul est automatique. Les entiers suffisent en v1 (pas de demi-journée).

### 2.2 Historique vérifiable (`MouvementConge`)

Chaque modification de solde écrit une ligne immuable : employé, titre concerné (nullable), nature (`INITIAL`, `DEBIT`, `RESTITUTION_ANNULATION`, `RESTITUTION_INTERRUPTION`, `BASCULE`, `CORRECTION`, `RETRAIT_CS`), variations par compartiment (`d_reliquat`, `d_annuel`, `d_anticipe`, `d_cp_consomme`, `d_retrait_cs`), instantané avant/après, motif, auteur, horodatage. Le solde en base doit toujours égaler la somme des mouvements : un test le vérifie, et une commande de contrôle (`verifier_soldes_conges`) signale tout écart.

### 2.3 Règles de débit à la validation d'un titre

- **CP** : débite le **reliquat d'abord**, puis l'annuel. Un seul titre peut mélanger les deux. `cp_consomme` augmente du nombre de jours.
- **Excédent** : si `nb_jours` dépasse reliquat + annuel, l'excédent passe en **anticipé** (plafonné à `droit_annuel_jours`) ; au-delà, la validation est refusée. L'aperçu du débit est affiché à l'admin avant validation.
- **CE** : aucun débit, tracé avec son motif.
- **CS** : aucun débit de compartiment ; `retrait_cs` augmente du nombre de jours.
- Le débit a lieu **à la validation** (statut `Prête`), jamais à la demande : une demande reçue ne bloque aucun jour. La ventilation (`debit_reliquat`, `debit_annuel`, `debit_anticipe`) est conservée sur le titre.
- Tout se fait dans une transaction avec verrou (`select_for_update()`) sur `SoldeConge`.

### 2.4 Bascule du 1er juillet

Commande de gestion `basculer_exercice` (comme `notifier_echeances_consultation` : le projet n'a pas de Celery beat, les tâches récurrentes sont des commandes lancées par le planificateur du serveur), idempotente par exercice : pour chaque employé, `reliquat += annuel` (jours non pris de l'exercice écoulé), puis `annuel = droit_annuel_jours − anticipe` et `anticipe = 0`. Un `MouvementConge` `BASCULE` par employé, une ligne d'audit globale. **Rattrapage automatique** : `SoldeConge.exercice` mémorise l'exercice auquel le solde est à jour ; toute lecture ou opération sur un solde dont l'exercice est en retard applique d'abord la bascule de cet employé (sous verrou), de sorte qu'un oubli du planificateur ne fausse jamais un débit. **Hypothèse à valider** : le reliquat reçoit les jours annuels non consommés de l'exercice clos.

**Restitution après une bascule** : le titre mémorise `exercice_debit` (l'exercice du solde au moment du débit, distinct du libellé `exercice` imprimé, qui peut viser un exercice antérieur comme sur le papier « 2024/2025 »). Si le solde a basculé depuis, les jours restitués d'un débit « annuel » retournent au reliquat et ceux d'un débit « anticipé » retournent à l'annuel, comme l'a fait la bascule ; le reliquat retourne toujours au reliquat.

## 3. Données de la demande

**Saisi par le demandeur** (création) : employé (infos automatiques ci-dessous), date de départ, date de retour, nombre de jours (prérempli depuis les dates, modifiable), adresse durant le congé, commentaire, importance.

**Automatiques depuis la fiche employé** (lecture seule) : nom, prénom, matricule, contrat, fonction (`poste`), date de recrutement, **Structure** = direction / département, **Affectation** = service.

**Renseigné par le traiteur à la validation** : N° de référence (proposé automatiquement, modifiable, unique), type (`CP`, `CE`, `CS`), motif (référentiel `MotifConge` par type, géré dans `/parametres`), date d'établissement, nombre de jours, dates de départ/retour (corrigeables), exercice, adresse, observation, signataire (titulaire ou intérim « P.I » d'après la configuration, **figé sur le titre** : nom, titre, mention d'intérim).

Le traiteur voit à côté les soldes de l'employé et l'aperçu du débit avant de valider.

## 4. Workflow

Statuts : `Reçue → Prête → Récupérée`, plus `Rejetée` (motif obligatoire, avant `Récupérée`), `Annulée` et `Interrompue`.

- **Rejet par le traiteur** (statut `Reçue`/`Prête` avant `Récupérée`, motif obligatoire) : un titre `Prête` rejeté restitue d'abord son débit (même mécanique que l'annulation ci-dessous) ; un titre `Reçue` rejeté n'a rien débité.
- **Annulation par le demandeur** (statut `Reçue` seulement) : soft-delete `is_active=False`, sans effet sur les soldes (rien n'a été débité), tracé.
- **Chevauchement** : refus si la période `[départ, retour[` recoupe un titre actif (`Reçue`, `Prête`, `Récupérée`, `Interrompue` sur sa période effective) du même employé. `Rejetée`, `Annulée` et soft-deleted sont ignorés ; une reprise le jour d'un nouveau départ est acceptée.
- **Annulation par le traiteur** (statuts `Prête`/`Récupérée`, même signé) : motif obligatoire, confirmation renforcée (saisie de la référence), restitution intégrale de la ventilation aux compartiments d'origine, `cp_consomme`/`retrait_cs` rectifiés, statut `Annulée`, titre conservé dans l'historique (jamais supprimé). Un titre `Interrompue` n'est pas annulable en v1.
- **Interruption** (statuts `Prête`/`Récupérée`, une fois par titre) : le traiteur saisit la **date de rappel réelle** (strictement entre départ et retour) et un motif ; `jours_effectifs` = `date_rappel − date_depart` ; la différence est restituée aux compartiments d'origine (reliquat d'abord, dans la limite de ce qui y avait été débité) ; le titre original reste intact, une ligne d'interruption (dates, jours avant/après, motif, auteur) est ajoutée à son historique ; statut `Interrompue`. Aucun nouveau document.
- **Cadre admin** : `observations` est modifiable par le traiteur tant que le titre n'est ni `Récupérée`, ni `Annulée`, ni `Interrompue` ; changer la ventilation passe par annulation puis nouvelle demande, jamais par édition directe.
- Seul le traiteur valide, rejette, annule, interrompt et saisit des soldes. Un ADMIN ordinaire reste traiteur seul : il ne crée jamais de demande.

## 5. Modèles (`backend/conges/`)

- `DemandeConge` : `employee`, `contrat`, `date_depart`, `date_retour`, `nb_jours`, `adresse_conge`, `commentaire`, `importance`, `statut`, `motif_rejet`, `type_conge`, `motif` (FK `MotifConge`), `exercice`, `date_etablissement`, `observations`, `debit_reliquat`/`debit_annuel`/`debit_anticipe`, `signataire_nom`/`signataire_titre`/`signataire_interim` (figés), `validateur_nom`, `motif_annulation`/`annulee_par`/`date_annulation`, `date_rappel`/`jours_effectifs`/`motif_interruption`/`interrompue_par`/`date_interruption`, `date_prete`, `date_recuperee`, `date_document`, `scan_document`, `demandeur`, `traite_par`, `reference` unique `NNNNN/AA`, `is_active`.
- `SoldeConge`, `MouvementConge` (§2), `MotifConge` (nom, type, `is_active`), `ParametreConge` (singleton), `ReferenceCounter`, `CongeTemplateConfig` (singleton : en-tête, signataire titulaire/intérim, logo, `mode_test`, **fax par défaut `213 (0) 41.68.01.03`** d'après le papier ; la valeur des attestations reste inchangée).
- `accounts.User` : `charge_conge` (traiteur, SUPERADMIN seul peut l'attribuer) et `peut_demander_conge` (demandeur, tout ADMIN peut l'attribuer), propriétés `can_manage_conges` / `can_request_conges`, mêmes règles que `charge_attestation` / `peut_demander_attestation`.

## 6. Titre de congé imprimable (`conges/pdf.py`, ReportLab)

Recalé sur le **modèle officiel** (photo du titre papier), même mécanique que l'attestation (PDF ouvert en blob, date imprimée figée au premier aperçu avec 409 et confirmation, mode test, rien codé en dur, typographie libellés gras/valeurs plus petites, `saveState()/restoreState()`) :

- En-tête société + logo, cadre « TITRE DE CONGE » et **sous-titre** : « - RELIQUAT - » dès qu'il y a du reliquat débité ; sinon « - ANNUEL - » ou « - ANTICIPE - » selon le compartiment ; « - CONGE EXCEPTIONNEL - » pour un CE ; « - CONGE SANS SOLDE - » pour un CS.
- Bloc REF N° / MATRICULE / CONTRAT N°.
- Corps : Nom & Prénom, Fonction, Structure (direction / département) avec Affectation (service) sur la même ligne, Nombre de jour, Date de Départ avec Date de Retour sur la même ligne, Adresse durant Congé, Exercice.
- « Fait à Arzew, le : » (date d'établissement), bloc signataire (titre, nom, « P.I » si intérim), pied de page.
- **Pas de cadre « réservé à l'administration »** sur le papier : reliquat et ventilation restent dans la page de l'admin ; l'observation n'est pas imprimée.
- Positions en constantes `Y_*`, à affiner en comparant le rendu au papier.
- Un titre `Annulée` imprime un filigrane « ANNULE » à la réouverture ; un titre `Interrompue` garde son texte d'origine (la page affiche l'interruption).

## 7. API (`/api/conges/`)

`demandes/` (liste scopée, création) ; `demandes/<ref>/` (détail, annulation par le demandeur) ; `demandes/<ref>/valider/` (traiteur : saisie des champs §3, débit, transaction) ; `demandes/<ref>/statut/` (rejet, récupérée) ; `demandes/<ref>/annuler/` ; `demandes/<ref>/interrompre/` ; `demandes/<ref>/apercu/` (PDF) ; `demandes/<ref>/scan/` ; `soldes/<matricule>/` (lecture scopée, historique des mouvements) ; `soldes/<matricule>/initial/` et `soldes/<matricule>/correction/` (traiteur) ; `motifs/` (CRUD traiteur) ; `parametres/` ; `config/`, `config/apercu/`, `config/logo-defaut/` ; `stats/`.

## 8. Frontend

- Pages `/conges`, `/conges/nouvelle`, `/conges/:ref`, panneau de validation (champs §3 + soldes + aperçu du débit), modales d'annulation (confirmation par saisie de la référence) et d'interruption, via `useConfirm()`/`usePrompt()`. Refresh silencieux, tokens `theme.js`.
- **Onglet « Congés » sur la fiche employé**, à côté de Dossier, Contrat et Carrière : soldes (reliquat, annuel, anticipé à part, actuel, droit initial, CP consommés, retrait CS), historique des titres (type, dates, jours, statut, interruptions, annulations) et des mouvements. Traiteurs : tout, avec saisie initiale/correction. Demandeurs : lecture seule dans leur périmètre. Autres rôles : onglet masqué.
- Navbar (menu Demandes, badge), palette de commandes, `/users` (cases `charge_conge`, `peut_demander_conge`), bouton « Demander un congé » sur la fiche, onglet de configuration « Titre de congé » dans `/parametres` (aperçu live, mode test, signataire/intérim) et gestion des motifs de congé.
- Un ADMIN ordinaire ne voit ni le lien ni la route de création.

## 9. Audit, notifications, scoping

- Actions d'audit (limite de 20 caractères de `AuditLog.action`) : `CREATE_CONGE`, `VALIDER_CONGE`, `REJETER_CONGE`, `RECUPERER_CONGE`, `ANNULER_CONGE`, `INTERROMPRE_CONGE`, `DELETE_CONGE`, `MODIFY_CONGE`, `INITIAL_SOLDE_CONGE`, `CORRIGER_SOLDE_CONGE`, `BASCULE_CONGE`, `APERCU_CONGE`, `SCAN_CONGE` ; chacune trace qui, quand, pourquoi et avant/après des soldes. `/audit` suit la règle de visibilité des attestations.
- Notifications : nouvelle demande (traiteurs), titre prêt et rejet (demandeur), annulation et interruption (demandeur, texte neutre : référence seulement).
- Scoping : toute vue listant des titres ou des soldes applique `can_access_employee()` ; un demandeur ne voit que ses demandes et les soldes de son périmètre.

## 10. Tests (TDD, ≥ 80 %)

Calcul des soldes et ordre reliquat→annuel ; excédent en anticipé et plafond ; CE neutre, CS en retrait ; transaction et verrou (deux validations concurrentes) ; annulation et interruption (restitutions, `cp_consomme`, historique, audit) ; bascule du 1er juillet idempotente ; invariant « solde = somme des mouvements » ; chevauchement ; cadre admin et saisies réservés au traiteur ; permissions sur de vraies routes métier ; scoping des soldes ; PDF (sous-titres, intérim, filigrane, 409) ; frontend (formulaire, panneau de validation, onglet profil, visibilité).

## 11. Documentation à tenir à jour

`docs/fonctionnel/conges.md` (nouveau), `CLAUDE.md` (rôles, routes, index, règles critiques), `securite.md` (drapeaux, transactions, restitutions, annulation après signature), `docs/fonctionnel/notifications.md`, `docs/fonctionnel/employes.md` (onglet Congés de la fiche), configuration `/parametres`.

## 12. Approches écartées

Généraliser `attestations` (risque de régression) ; socle commun préalable (refactor disproportionné) ; solde calculé depuis le recrutement (règles d'acquisition non fournies) ; saisie 100 % manuelle des soldes ; deux titres automatiques en cas de dépassement du reliquat (le papier porte un seul titre) ; document officiel d'interruption (non demandé) ; édition directe de la ventilation d'un titre validé.

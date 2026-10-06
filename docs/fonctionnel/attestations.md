# Demandes d'attestation de travail

> À lire avant de toucher à l'app attestations (workflow de statuts, PDF ReportLab, configuration du modèle, mode test, statistiques).
>
> Extrait de `CLAUDE.md` (découpage du 2026-10-01) — contenu déplacé tel quel, sans réécriture.
> Les renvois « voir section X » peuvent pointer vers un autre fichier de `docs/fonctionnel/` ou vers `CLAUDE.md` : voir l'index de `CLAUDE.md`.

---

## Demandes d'attestation de travail (2026-09-22)

Un compte `GESTIONNAIRE` (libellé d'affichage "Secrétaire"/"Superviseur"
possible, voir en-tête de ce fichier) peut demander une attestation de
travail pour un employé de son périmètre organisationnel — traitée par un
ADMIN/SUPERADMIN via un workflow de statuts, jusqu'à récupération physique
du document signé. Spec complète :
`docs/superpowers/specs/2026-09-22-demandes-attestation-travail-design.md`.

- **App dédiée `attestations`** (`backend/attestations/`) : modèle
  `DemandeAttestation` (`employee`, `contrat` optionnel, `motif` — FK vers
  `employees.MotifArchivage` (catégorie Attestation), voir section "Motifs
  — référentiel générique" —, `commentaire`, `statut`, `motif_rejet`,
  `scan_document` optionnel, `demandeur`, `traite_par`, `reference` unique
  format `NNNNN/AA`, `date_prete`/`date_recuperee`) ; `ReferenceCounter`
  (compteur annuel, incrémenté sous `select_for_update()` — voir
  `attestations/reference.py`) ; `AttestationTemplateConfig` (singleton
  `pk=1`, champs du modèle papier : adresse, ville, signataire, en-tête,
  pied de page, logo).
- **Workflow des statuts (simplifié le 2026-09-23)** : `Reçue → Prête →
  Récupérée`, plus `Rejetée` (terminal, motif obligatoire, atteignable
  depuis n'importe quel statut avant `Récupérée`) — transitions
  séquentielles uniquement, validées côté serveur
  (`DemandeAttestationStatutSerializer.ORDRE`). Seul un ADMIN/SUPERADMIN
  change un statut (`PATCH /api/attestations/demandes/<id>/statut/`), y
  compris `Récupérée` — le gestionnaire n'est pas devant l'écran au
  moment où il vient chercher le document physique. Les anciens statuts
  intermédiaires `Imprimée`/`Signée` ont été supprimés (pas seulement
  masqués) — migration `attestations/migrations/0004_motif_dates.py` :
  les demandes qui s'y trouvaient sont retombées sur `Reçue`.
  `DemandeAttestationStatutView.patch()` horodate le passage à `Prête`
  (`date_prete`) et `Récupérée` (`date_recuperee`) — `created_at` sert
  déjà de date "Reçue". `AttestationDetail.jsx#StatutStepper` affiche ces
  3 dates sous chaque cercle du stepper.
- **Importance (2026-10-05)** : `DemandeAttestation.importance`
  (`haute`/`moyenne`/`faible`, défaut `moyenne`, migration `0009`) choisie
  par le demandeur à la création (`AttestationNouvelle.jsx`) pour aider
  l'ADMIN à prioriser. Information seulement : aucun effet sur le workflow
  de statuts ni sur les permissions, et non modifiable après création (pas
  dans les `read_only_fields` du serializer de statut). Affichée via
  `components/attestations/ImportanceBadge.jsx` dans la liste et le détail.
  Pas encore de tri/filtre par importance dans `/attestations`.
- **Périmètre** : `DemandeAttestationCreateSerializer.validate_employee()`
  réutilise `User.can_access_employee()` — un GESTIONNAIRE ne peut créer
  de demande que pour un employé de son périmètre (mêmes champs
  `scope_*` que CONSULTANT, voir section Scoping). Un GESTIONNAIRE ne
  voit que ses propres demandes (`GET /api/attestations/demandes/`), un
  ADMIN voit tout.
- **Annulation** : le demandeur peut supprimer sa propre demande
  uniquement tant qu'elle est au statut `Reçue`
  (`DemandeAttestationDetailView.perform_destroy`).
- **Onglet "Attestations" sur la fiche employé** (2026-09-23,
  `components/employeeDetail/AttestationsTab.jsx`, à côté de "Carrière")
  — historique des demandes pour CET employé précis
  (`GET /attestations/demandes/?employee=<id>`, `employee_id` combiné avec
  le scoping demandeur/admin habituel dans
  `DemandeAttestationListCreateView.get_queryset()`). Onglet visible
  uniquement si `user.can_manage_attestations || role === "GESTIONNAIRE"`
  (même condition que l'accès à `/attestations`) — masqué du tout pour
  CONSULTANT et pour un ADMIN non chargé des attestations, pas seulement
  vidé. Un GESTIONNAIRE n'y voit que ses propres demandes pour cet
  employé (jamais celles d'un collègue) ; bouton "+ Nouvelle demande"
  affiché pour SUPERADMIN/GESTIONNAIRE uniquement, même règle que le
  bouton déjà présent dans la sidebar Documents (`DossierTab.jsx`).
- **Document PDF** : `GET /api/attestations/demandes/<id>/apercu/`
  (ADMIN only) renvoie un **PDF** (`application/pdf`, généré par
  `attestations/pdf.py` avec **ReportLab** — nouvelle dépendance,
  `requirements.txt`) reproduisant la mise en page du modèle papier :
  logo + en-tête société, titre encadré, bloc REF/MATRICULE/CONTRAT aux
  deux-points alignés, corps du texte, lieu/date, bloc signataire (espace
  laissé libre pour la signature et le cachet apposés à la main), pied de
  page avec coordonnées et mention "Édité le". Le frontend récupère le
  PDF via axios puis l'ouvre en blob dans un onglet (lecteur PDF du
  navigateur = impression et téléchargement directs) — **jamais** par
  navigation directe vers `/api/...` : le proxy CRA de dev ne relaie pas
  les requêtes de navigation (`Accept: text/html`) et la page
  atterrissait sur le 404 du routeur React.
  - **Date imprimée figée au premier aperçu (2026-09-23)** — la date "Arzew
    le :"/"Édité le :" imprimée sur le document (`demande.date_document`,
    `DateField` distinct de `date_prete`/`date_recuperee` qui tracent le
    workflow de statut) se fige à la toute première génération plutôt que
    d'être recalculée à chaque ouverture de l'aperçu : entre l'impression
    et la signature effective, un jour ou deux peuvent s'écouler (imprimé
    le 23, signé le 24) — rouvrir l'aperçu le lendemain ne doit pas
    silencieusement dater le document différemment de ce qui a été
    réellement imprimé/signé. `AttestationApercuView.get` renvoie **409**
    (`{needs_confirmation, date_document, date_nouvelle}`, pas le PDF) si
    la date du jour diffère de celle déjà figée et que
    `?confirmer_date=1` n'est pas passé ; le frontend
    (`AttestationDetail.jsx#ouvrirApercu`) intercepte ce 409, affiche une
    modale `useConfirm()` avec les deux dates, et ne relance la requête
    avec `confirmer_date=1` (qui met à jour `date_document` et régénère)
    que si l'ADMIN confirme explicitement.
    - **Piège jsdom** : `Blob.text()` n'est pas implémentée par le
      polyfill `Blob` de jsdom (tests Jest) — `err.response.data.text()`
      échouerait silencieusement en test alors que ça fonctionne dans un
      vrai navigateur. `lireBlobEnTexte()` (`AttestationDetail.jsx`) lit
      le corps JSON de la réponse 409 via `FileReader.readAsText()` à la
      place, supportée par jsdom comme par tout navigateur.
  - **Typographie calée sur le papier (2026-09-23)** — le rendu doit être
    identique au modèle papier en vigueur, pas seulement contenir les
    mêmes informations. Règles constatées sur un exemplaire signé
    (**corrigées le 2026-09-27** d'après une photo de l'original — la
    règle précédente "rien n'est en gras" était fausse) : (1) **libellés
    fixes en gras** (`Helvetica-Bold` 12,5 pt, taille calée sur la
    largeur de la ligne "La présente Attestation..." ≈ 75 % de la page),
    y compris "Arzew le :" et le bloc signataire ; valeurs en normal ;
    majuscules sans accents (`_maj()`, "DEPARTEMENT") ; titre sans
    espacement inter-lettres, cadre épais à ombre portée ; pied de page en
    italique ; (2) les **valeurs saisies
    sont dans un corps plus petit que les libellés** (`TAILLE_VALEUR`
    10.5 vs `TAILLE_LABEL` 12.5) — le texte fixe du formulaire et les
    données de l'employé ne sont pas à la même taille sur le papier ;
    (3) l'interligne du corps est resserré (~13 mm) avec un intervalle
    volontairement plus large avant "Et occupe le poste de" — le papier
    n'a pas un pas régulier, d'où les constantes `Y_*` relevées une à une
    plutôt qu'une boucle à pas fixe. `Helvetica` est utilisée comme
    équivalent métrique de l'Arial du papier (police de base ReportLab,
    pas de fichier de fontes à embarquer).
  - **Piège `setCharSpace`** : l'espacement inter-lettres du titre ne se
    règle que sur un objet texte (`Canvas` n'expose pas `setCharSpace`),
    et il fait partie de l'**état graphique PDF** — sans
    `saveState()`/`restoreState()` autour, il reste actif sur tout le
    reste du document : texte étiré et, surtout, valeurs qui chevauchent
    leur libellé (les positions dynamiques de `_label_valeur()` sont
    calculées avec `stringWidth()`, qui ignore la chasse et sous-estime
    donc la largeur réellement rendue).
  - Le "lieu de naissance" (champ personnalisé, pas de colonne directe
    sur `Employee`) est résolu par recherche approximative du nom du champ
    (`EmployeeChampValeur`, voir `AttestationApercuView.get`).
  - Le N° de contrat figure toujours sur le document : si la demande ne
    vise pas un contrat précis, le dernier contrat de l'employé est repris.
  - **Aucune valeur n'est codée en dur dans le PDF** — tout l'en-tête, le
    signataire et le pied de page viennent de `AttestationTemplateConfig`
    (testé : `test_apercu_reprend_la_configuration_du_modele`). Les
    `default` du modèle reprennent simplement les valeurs du document
    papier en vigueur pour qu'une attestation soit correcte sans
    configuration préalable.
- **Mode test + aperçu live (2026-09-27)** — `AttestationTemplateConfig.mode_test`
  (bool, `True` par défaut) imprime "(mode test)" en rouge sous le titre de
  **toute** attestation générée, tant qu'un ADMIN ne décoche pas la case
  dans `/parametres` → "Attestation de travail" (évite qu'un document
  imprimé pendant les tests passe pour officiel). Ce même panneau affiche
  un aperçu PDF live à côté du formulaire (debounce 500 ms) via
  `POST /api/attestations/config/apercu/` (`AttestationTemplateConfigApercuView`) :
  valeurs du formulaire non enregistrées + employé fictif, rien n'est
  persisté (instance mutée en mémoire seulement).
- **Scan du document signé** : optionnel, jamais bloquant pour avancer un
  statut (`POST /api/attestations/demandes/<id>/scan/`, ADMIN only) — un
  simple aide-mémoire, pas un document RH permanent du dossier employé.
- **Configuration du modèle** : `/parametres` → onglet "Attestation de
  travail" (`AttestationConfigPanel` dans `Parametres.jsx`, pas de
  `RefTable`/`RefForm` générique — un seul enregistrement). `GET/PUT
  /api/attestations/config/`, ADMIN only ; le logo s'envoie séparément en
  `PATCH` multipart (le `PUT` des champs texte exclut volontairement
  `logo`, sinon l'URL de lecture renvoyée par l'API serait resoumise comme
  valeur et rejetée par l'`ImageField`).
- **Audit** : nouvelles valeurs `AuditLog.Action`
  (`CREATE_ATTESTATION`, `STATUT_ATTESTATION`, `DELETE_ATTESTATION`).
  `AuditLogListView` étend la règle de visibilité déjà en place pour
  CONSULTANT (un ADMIN voit ses propres actions + celles des comptes
  qu'il administre) aux comptes GESTIONNAIRE.
- **Reporting** : `GET /api/attestations/stats/?date_debut=&date_fin=`
  (ADMIN only) — nombre de demandes par gestionnaire demandeur, par
  employé, répartition par statut, délai moyen `Reçue → Récupérée`.
  Affiché dans un onglet "Statistiques" sur `/attestations` elle-même
  (pas dans `/statistiques`, qui reste dédiée aux indicateurs RH
  globaux).
  - **Enrichi le 2026-09-27** (aligné sur le look & feel de
    `/statistiques`) : `total` (nb de demandes sur la période),
    `par_gestionnaire`/`par_employe` reformatés en `{id, nom, count}`
    (au lieu de `{demandeur_id, demandeur_nom, count}` /
    `{employee_id, employee_nom, count}`) pour être directement
    consommables par `StatDonutChart` (`frontend/src/components/charts/`,
    déjà utilisé par `/statistiques`) ; `par_statut` passé d'un dict
    `{code: count}` à une liste `[{id, nom, count}]` (libellés lisibles,
    codes à `count=0` omis). Nouveau champ `evolution_mensuelle`
    (`[{mois, recues, recuperees}]`, un point par mois calendaire
    couvrant la période, même principe que
    `audit.stats._evolution_mensuelle` mais sur les dates de création/
    récupération des demandes plutôt qu'une plage de dates fixe — utile
    y compris sur le préréglage "Tout", où il n'y a pas de plage
    explicite à découper).
  - Frontend (`Attestations.jsx`, onglet Statistiques) : mêmes
    préréglages de période que `/statistiques` (30j/3m/12m/année en
    cours/tout + plage libre), 3 cartes KPI (Total, En attente = statut
    `recue`, Délai moyen), 3 `StatDonutChart` (Par statut/gestionnaire/
    employé) et un `StatAreaChart` (évolution reçues vs récupérées) —
    réutilise les mêmes composants graphiques que `/statistiques`
    plutôt que des listes texte ad hoc.
- **URL par référence, pas par UUID** : `/attestations/<ref>` (et les
  endpoints `/api/attestations/demandes/<ref>/...`) utilisent la
  référence (`00001/26`) plutôt que l'UUID technique — plus lisible/
  partageable. Le `/` de la référence est illisible dans un segment
  d'URL : encodé en `-` côté frontend (`00001-26`, voir les `Link`/
  `navigate` dans `Attestations.jsx`/`AttestationNouvelle.jsx`) et
  reconverti côté serveur par `ReferenceLookupMixin`
  (`attestations/views.py`, `reference.replace('-', '/', 1)` — un seul
  remplacement, le format `NNNNN/AA` ne contient qu'un seul `/`).
- **Qui peut demander** (2026-09-22, révisé après première livraison) :
  seuls GESTIONNAIRE et **SUPERADMIN** créent des demandes
  (`CanRequestAttestation`, `attestations/permissions.py`) — un ADMIN
  ordinaire reste **uniquement traiteur**. Décision volontaire : le
  laisser aussi créer ses propres demandes casserait la séparation
  demandeur/traiteur utile à l'audit (un même compte auteur et
  validateur de la même demande). Un ADMIN garde tout accès en
  lecture/traitement (`/attestations`, `/attestations/:ref`, statuts,
  aperçu PDF, config, reporting) — seul le bouton "Nouvelle demande" lui
  est masqué (`Attestations.jsx`, `DossierTab.jsx`), et la route
  `/attestations/nouvelle` lui est fermée côté client
  (`ProtectedRoute allowedRoles`) comme côté serveur.
- **UI** : `/attestations` (liste + reporting, ADMIN/SUPERADMIN/
  GESTIONNAIRE), `/attestations/nouvelle` (formulaire, SUPERADMIN/
  GESTIONNAIRE uniquement — recherche employé via `/employees/search/`
  déjà scopée serveur), `/attestations/:ref` (détail, actions de statut,
  aperçu, scan, annulation). Bouton "Demander une attestation" sur la
  fiche employé (`DossierTab.jsx`, sidebar Documents), pré-remplit
  l'employé via `location.state`. Badge navbar "N en attente" — compte
  uniquement les demandes au statut `Reçue` (pas encore prises en charge ;
  dès qu'un ADMIN passe une demande à `Imprimée`, elle n'est plus
  comptée même si le document n'est pas encore récupéré), visible
  ADMIN/SUPERADMIN, rechargé à chaque navigation (`Navbar.jsx`, effet
  dépendant de `location.pathname`).

# Congés — validation hiérarchique (spec, 2026-10-28)

Statut (2026-10-28) : **implémenté** (backend + interface : filtre « À viser »,
visa/refus et chronologie sur le détail, propositions de compte sur /users,
bouton « Désigner » sur l'Organigramme, écran /mot-de-passe forcé). Journal :
`securite.md` point 49.
**Périmètre (décision du 2026-10-28, révise « visa = congés seulement »)** :
à la validation d'un compte, l'unité dirigée est ajoutée à son périmètre. Le
chef lit donc les dossiers de son unité et peut y saisir des demandes de
congé ; l'ADMIN peut le restreindre ensuite (modal « Périmètre »). Seulement
à la création du compte (toutes les unités dirigées). Un compte GESTIONNAIRE/
CONSULTANT déjà existant reçoit l'unité dès la désignation (sans proposition).

## Responsables désignés avant cette fonctionnalité (rattrapage)
Bloc « N responsables désignés sans compte » sur `/users` : aperçu nominatif
puis « Générer les propositions » (`/admin-users/propositions/rattrapage/`).
Crée seulement des propositions (`source: rattrapage`), à valider une à une.
Rejouable sans doublon.

## Implémentation du visa (backend)
- `conges/hierarchie.py` : `chaine_validation(employee)` (fonction pure).
- `conges/visas.py` : `initialiser_chaine` (fige la chaîne en `VisaConge`),
  `viser`, `refuser`. Statut `visa` (« En attente de visa ») avant `recue` :
  sans chaîne la demande est `recue` d'emblée (comportement historique).
- API : `POST /api/conges/demandes/<ref>/viser/` et `.../refuser-visa/`
  (`motif` obligatoire) ; liste `?a_viser=1` ; `visas` et `peut_viser` dans
  le serializer. Le droit de viser est vérifié dans `visas.py` (compte du
  maillon ou d'un niveau supérieur), jamais seulement par la permission de
  vue. Audit : `VISER_CONGE`, `REFUSER_VISA_CONGE`.
- Le traiteur RH ne peut valider qu'une demande `recue` : impossible tant que
  les visas ne sont pas donnés.
- `CanAccessConges` laisse entrer tout compte à qui un visa est adressé.
- Piège : `notify()` est différé à `on_commit` ; les tests doivent utiliser
  `django_capture_on_commit_callbacks`.

## Besoin
Une demande de congé doit être visée par la voie hiérarchique avant le
traitement RH : chef direct (section / cellule / service) → chef de
département (s'il existe) → directeur. Le traiteur RH (`charge_conge`)
garde l'étape finale (débit des soldes, titre PDF).

## Décisions (validées avec Zoheir)
- **Pas de nouveaux rôles.** On réutilise les champs `responsable`
  (FK Employee) déjà présents sur Direction, Département, Service,
  Cellule, Section (migration `employees/0023`). Seul ajout de modèle :
  `User.employee` (OneToOne nullable) — un compte est « chef de X » si son
  employé lié est le `responsable` de X. Un seul endroit de saisie
  (`/parametres`), aucun risque de désynchronisation.
- Les chefs/directeurs sont toujours des employés (compte lié à une fiche).
- Chaîne : unité de l'employé → responsable de l'unité → responsable du
  département (si l'unité en a un) → directeur de la direction.
- **Maillon vacant ou employé = lui-même le chef : sauté** (défaut retenu,
  à revoir si besoin). Le **Pôle est ignoré** dans la chaîne.
- Un **refus à n'importe quelle étape clôt** la demande (défaut retenu).
- Saisie : GESTIONNAIRE (comme aujourd'hui) **et** chefs pour leur équipe ;
  le congé d'un chef suit la chaîne de son supérieur.
- Portée : le visa ne donne accès **qu'aux demandes de congé** du périmètre.
  Le scoping des dossiers RH (`employee_scope_q`) ne change pas.

## Plan d'implémentation
1. `User.employee` + migration + gestion sur `/users` (audit `MODIFY_USER`).
2. `conges/hierarchie.py` : `chaine_validation(employee)` pure, testée seule
   (unité sous Direction directe, sous Département, via Service, vacants).
3. Workflow : statuts d'attente de visa, modèle `VisaConge` immuable
   (étape, visa_par, décision, date, motif), transitions dans
   `conges/workflow.py`, `RECUE → PRETE` impossible tant que la chaîne
   n'est pas complète. `AuditLog.action` ≤ 20 caractères.
4. Notifications au visiteur suivant ; file « à viser » côté UI.
5. Test d'intégration sur une vraie route : un chef ne vise que son
   périmètre ; documenter dans `securite.md` et `conges.md`.

## Décisions complémentaires (2026-10-28)
- **Demandes existantes** : ce sont des données de test, elles seront
  supprimées au déploiement — aucune migration de statut à prévoir.
- **Délégation / saut de niveau (obligatoire)** : un niveau supérieur
  reçoit la demande **dès sa création**, avec la mention « en attente de
  visa de <niveau inférieur> ». Il peut la viser **sans attendre** le
  niveau en dessous (chef absent) ; le visa d'un niveau supérieur solde
  les niveaux inférieurs encore en attente (tracé : « visé en lieu et
  place de … »). L'inverse est impossible : un niveau inférieur ne vise pas
  à la place d'un supérieur.
- **Désignation facile des responsables** : aujourd'hui le champ
  `responsable` est enfoui dans les formulaires de `/parametres`
  (`ResponsableField.jsx`). Prévoir une désignation en un clic depuis la
  page Organigramme, avec indicateur « sans compte lié » quand l'employé
  choisi n'a pas de `User.employee`. Toute désignation est tracée dans
  l'audit.

## Création automatique du compte d'un chef (2026-10-28)
- Déclencheurs : désignation d'un `responsable` (Organigramme, `/parametres`)
  **et** import Excel/CSV des référentiels. Si l'employé désigné n'a pas de
  `User.employee`, une **proposition de compte** « en attente » est créée
  (jamais un compte actif directement).
- **Validation par un ADMIN** depuis `/users` : il valide ou refuse chaque
  proposition. À la validation il **choisit le rôle** (GESTIONNAIRE ou
  CONSULTANT) ; `peut_demander_conge` est activé par défaut ; le lien
  `User.employee` est posé à la création. Le périmètre organisationnel du
  compte est proposé d'après l'unité dirigée (modifiable).
- Identifiant : `prenom.nom` (normalisé, sans accents), suffixe numérique
  en cas d'homonyme.
- Mot de passe : temporaire, généré, **affiché une seule fois** à l'ADMIN
  qui valide, changement obligatoire à la première connexion ; rien n'est
  envoyé par e-mail. Il passe par `validate_password()`.
- Tracé dans l'audit : proposition créée, validée (rôle choisi), refusée ;
  `AuditLog.action` ≤ 20 caractères. Un import de masse ne crée que des
  propositions : aucun compte n'apparaît sans clic d'un ADMIN.
- Si le responsable change, l'ancien garde son compte (on ne le supprime
  pas) mais perd le droit de visa sur l'unité.

## Page /users à grande échelle (2026-10-28)

La liste `/api/admin-users/` est paginée (25 par page, `page_size` jusqu'à 100) avec `?q=` (identifiant, nom, prénom,
libellé), `?role=` (liste séparée par des virgules) et un champ `compteurs` (comptes par rôle, hors filtre de rôle).
L'interface a un onglet par rôle (Tous, Administrateurs, Gestionnaires, Consultants, À valider), une recherche
temporisée et une pagination ; périmètre, droits et actions sont derrière le « + » de chaque ligne.
Piège : `order_by()` vide avant le `values('role').annotate(...)` des compteurs, sinon le tri entre dans le GROUP BY.
Avant ce changement l'interface ne lisait que la première page (25 comptes). `AuditLogs.jsx` charge encore
`/admin-users/` sans pagination : son filtre « utilisateur » est limité à 25 comptes (à traiter).

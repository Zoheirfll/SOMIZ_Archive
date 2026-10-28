# Congés — validation hiérarchique (spec, 2026-10-28)

Statut : **conception validée, pas encore implémentée.**

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

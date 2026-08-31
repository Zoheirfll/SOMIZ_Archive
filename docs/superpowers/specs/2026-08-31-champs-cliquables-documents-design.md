# Champs cliquables vers le document source

## Contexte

Sur la fiche employé, le panneau "Informations" (`EmployeeDetail.jsx`,
`infoFields`) affiche des champs (Date de naissance, NIN...) qui sont en
réalité justifiés par un document scanné précis (Acte de naissance, Carte
d'identité...). L'utilisateur veut pouvoir cliquer sur un champ pour être
amené directement au document correspondant dans la sidebar "Documents" —
que ce document existe déjà (le sélectionner/l'ouvrir) ou soit encore
manquant (surligner l'entrée "manquant" correspondante).

## Décisions validées

- L'association champ ↔ type de document est **configurable côté admin**,
  pas codée en dur : nouveau champ `TypeDocument.champ_source`.
- S'applique aussi bien aux champs système (Date de naissance, Statut...)
  qu'aux champs personnalisés (RIB, NIN...).
- Au clic sur un champ associé :
  - document déjà présent → bascule sur l'onglet "Dossier" et sélectionne
    ce document (même effet qu'un clic direct dans la sidebar).
  - document manquant → bascule sur l'onglet "Dossier", scroll + surligne
    temporairement la ligne "manquant" correspondante.
  - champ sans association → pas de changement de comportement (curseur
    normal, pas de clic géré).

## Modèle de données (`backend/employees/models.py`)

`TypeDocument.champ_source` — nouveau `CharField(max_length=100,
blank=True, verbose_name="Champ source")`. Stocke soit le code d'un champ
système (ex. `date_naissance`, `nin`, `statut`...), soit le `code` d'un
`ChampPersonnalise` actif. Pas de FK — un simple code texte, résolu côté
frontend (comme `RESERVED_CHAMP_CODES`/`SYSTEM_FIELDS` déjà utilisés pour
d'autres besoins similaires). Pas de contrainte d'unicité stricte en base
(deux types de documents pourraient en théorie pointer vers le même champ
sans que ça casse quoi que ce soit — le frontend prend simplement le
premier match trouvé) ; validé côté serializer pour empêcher qu'une
catégorie (`is_categorie`) ait un `champ_source` (une catégorie n'est
jamais elle-même un document sélectionnable).

## Backend — CRUD

- `TypeDocumentSerializer` (`referentiel_views.py`) : ajoute `champ_source`
  aux `fields`. `validate()` (déjà existant pour forcer `obligatoire=False`
  sur une catégorie) refuse aussi `champ_source` non vide si l'instance a
  des `sous_types` (catégorie).
- `EmployeeDocumentSerializer` (`serializers.py`) : expose déjà
  `type_doc_id`/`type_document` — ajoute `champ_source` (lecture seule,
  `source='type_doc.champ_source'`) pour que le frontend construise la
  map sans requête supplémentaire. Idem pour la sérialisation des
  documents manquants (`documents_manquants[].champ_source`, déjà
  construite dans `Employee`/`EmployeeDetailSerializer` — ajouter le champ
  à la structure existante).

## Frontend — `Parametres.jsx`

- Formulaire d'ajout/édition de l'onglet "Types de documents" : nouveau
  `<select>` "Champ source" (optionnel), désactivé/vidé automatiquement si
  le type a des sous-types (même garde-fou visuel que le champ
  "Obligatoire" existant pour les catégories). Options : les 12 champs de
  `SYSTEM_FIELDS` + les champs personnalisés actifs chargés via
  `/ref/champs-personnalises/` (déjà disponible dans ce fichier).

## Frontend — `EmployeeDetail.jsx`

- `infoFields` : chaque entrée reçoit un nouveau champ `code` (le code
  système du champ, ex. `date_naissance`, ou l'id du `ChampPersonnalise`
  pour les champs dynamiques — déjà présent dans
  `employee.champs_personnalises[].code`).
- Nouvelle map dérivée `champToDoc`, construite à partir de
  `typesDocumentsList` (déjà chargée au montage) : `{champ_source:
  type_doc}` pour les types actifs non-catégorie ayant un `champ_source`
  renseigné.
- Rendu de chaque ligne `infoFields` : si `champToDoc[item.code]` existe,
  le label devient cliquable (style lien discret, `cursor: pointer`,
  `textDecoration: underline` au survol). Handler `handleFieldClick(code)` :
  1. `setActiveTab("dossier")`.
  2. Cherche un document existant de ce type dans `documentsAffiches`
     (par `type_doc_id`) → si trouvé, `handleSelectDoc()` dessus.
  3. Sinon, cherche l'entrée correspondante dans
     `employee.documents_manquants` (par `code`) → scroll
     (`scrollIntoView({behavior:'smooth', block:'center'})`) sur son
     élément DOM (via un `ref` map indexée par `m-${code}`, réutilisant le
     système `docOrderMap`/`docHeaderBefore` déjà en place) et applique un
     état `highlightedMissingCode` pendant 2 secondes (classe
     `anim-pop` ou fond `theme.primaryBg` clignotant via une transition
     CSS), puis le réinitialise via `setTimeout`.

## Hors scope

- Pas de contrainte d'unicité DB sur `champ_source` (deux types pointant
  vers le même champ ne sont pas bloqués, juste redondants côté UX).
- Pas d'association pour les champs de contrat (numéro, dates) ni pour la
  hiérarchie organisationnelle (Direction/Département/Service) — seuls les
  champs système "personnels" (identité, dates, champs personnalisés) et
  les champs personnalisés sont concernés par cette fonctionnalité.
- Pas de lien inverse (cliquer un document pour surligner son champ
  source) — uniquement champ → document dans ce chantier.

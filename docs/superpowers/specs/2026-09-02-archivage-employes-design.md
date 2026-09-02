# Archivage employé — sortie de l'organisation, motif, suppression définitive

Date : 2026-09-02

## Contexte

`Employee.statut` a déjà 4 valeurs (`actif`, `inactif`, `archive`,
`demobilise`), mais tous les statuts sont aujourd'hui mélangés dans le
drill-down organisationnel de `/employees` (Direction → Département →
Service) — un employé Archivé/Inactif/Démobilisé reste visible et compté
au même endroit qu'un employé Actif, ce qui encombre la navigation.

Découverte en cours de conception : le bouton "Supprimer" existant sur un
employé (`EmployeeDetailView.perform_destroy`, `backend/employees/views.py:378-386`)
ne supprime pas réellement l'employé — il le fait déjà basculer en
`statut=archive` ("Soft delete — on archive, on ne supprime pas"). C'est
donc aujourd'hui le seul chemin qui produit des employés "Archivés", sans
motif ni distinction avec les 3 autres statuts.

Objectif de ce chantier :
1. Les employés Inactif/Archivé/Démobilisé sortent du drill-down
   organisationnel et vivent dans une liste séparée.
2. Un motif d'archivage configurable (référentiel) et facultatif peut être
   associé à un employé non-Actif.
3. **Changement de politique** (décision explicite prise pendant la
   conception, confirmée après avertissement) : "Supprimer" devient une
   vraie suppression définitive et irréversible (employé + contrats +
   documents + fichiers physiques). "Archiver" devient une action à part,
   réversible, qui porte le motif. La suppression définitive n'est
   possible que sur un employé déjà non-Actif, jamais en un clic depuis la
   vue organisationnelle — garde-fou contre une suppression accidentelle.

## 1. Modèle de données

### `MotifArchivage` (nouveau référentiel simple)

Même pattern que `Categorie`/`TypeContrat`/`Echelle` :

```python
class MotifArchivage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True)
    ordre = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
```

- CRUD ADMIN : `/ref/motifs-archivage/`, `/ref/motifs-archivage/<uuid:pk>/`.
- Onglet "Motifs d'archivage" dans `/parametres` (mêmes fonctionnalités que
  Catégorie : import xlsx, suppression en masse, tri).
- Ajouté à `ReferentielImportView.MODELS` / `ReferentielImportTemplateView.TEMPLATES`
  (`motifs_archivage`, colonne obligatoire `nom`) pour rester cohérent avec
  les autres référentiels simples.
- Toujours facultatif : aucune validation ne le rend obligatoire nulle
  part.

### `Employee.motif_archivage`

```python
motif_archivage = models.ForeignKey(
    MotifArchivage, null=True, blank=True,
    on_delete=models.SET_NULL, related_name='employees'
)
```

- Exposé par `EmployeeDetailSerializer`/`EmployeeListSerializer` en
  `motif_archivage` (id) + `motif_archivage_nom` (`SerializerMethodField`
  ou `source='motif_archivage.nom'`, `default=None`).
- `EmployeeCreateUpdateSerializer` : champ writable classique (FK
  optionnelle), aucune contrainte croisée avec `statut` — un motif peut
  rester renseigné même si l'employé redevient Actif plus tard (pas
  auto-effacé sauf action explicite "Restaurer", voir section 2), pour ne
  pas perdre l'information historique par erreur.

Pas de migration de données nécessaire (nouveau champ, toujours vide au
départ).

## 2. Actions sur un employé

Toutes les actions d'écriture restent `IsAdmin` (CONSULTANT reste lecture
seule partout, y compris sur le nouvel onglet Archivés).

### Archiver (nouveau, remplace le comportement actuel de "Supprimer")

- Bouton visible uniquement quand `employee.statut === 'actif'`.
- Ouvre une modale (`useConfirm()`-style, nouveau composant léger réutilisant
  `ConfirmDialog.jsx`) : texte de confirmation + `<select>` "Motif
  (optionnel)" alimenté par `/ref/motifs-archivage/` (actifs uniquement).
- Envoie `PATCH /api/employees/<id>/` avec `{statut: 'archive', motif_archivage: <id ou null>}`
  — réutilise l'endpoint existant, pas de nouvelle route. Réversible.
- `EmployeeDetailView.perform_update` (déjà générique par diff de champs,
  voir `TRANSFER_FIELDS`/`CARRIERE_AXES`) reçoit `'statut'` dans un
  nouveau dict `STATUT_TRACKED = ['statut', 'motif_archivage']` : si l'un
  des deux change, ajoute `details['transfer']['statut']`/
  `details['transfer']['motif_archivage']` à l'entrée `MODIFY_EMP`
  existante (même mécanique que le transfert organisationnel — libellés
  lisibles ajoutés à `TRANSFER_FIELD_LABELS` dans `AuditLogs.jsx`).

### Restaurer (nouveau)

- Bouton visible uniquement quand `employee.statut !== 'actif'` (donc
  dans l'onglet Archivés ou sur la fiche d'un employé non-Actif).
- Un clic (pas de modale) → confirmation simple puis
  `PATCH /api/employees/<id>/` `{statut: 'actif', motif_archivage: null}`.
  Le motif est effacé à la restauration (il ne s'applique qu'à l'épisode
  d'archivage qui vient de se terminer) — seule cette action précise vide
  `motif_archivage`, pas un changement de statut quelconque (voir note
  section 1).

### Supprimer définitivement (comportement changé)

- Bouton visible **uniquement** quand `employee.statut !== 'actif'` —
  jamais sur un employé Actif (il faut d'abord Archiver). Renommé
  clairement "Supprimer définitivement" dans l'UI pour ne pas le confondre
  avec l'ancien "Supprimer".
- `DELETE /api/employees/<id>/` (même route) :
  - `EmployeeDetailView.perform_destroy` refuse avec `400` explicite si
    `instance.statut == Employee.Statut.ACTIF` ("Archivez d'abord cet
    employé avant de le supprimer définitivement.") — garde-fou serveur,
    pas seulement UI (cohérent avec le reste du projet : la sécurité réelle
    n'est jamais uniquement côté frontend).
  - Sinon : log `AuditLog.Action.DELETE_EMP` **avant** suppression avec un
    snapshot (`matricule`, `nom`, `dernier_statut`, `motif_archivage_nom`).
  - Supprime les fichiers physiques : `instance.photo` (si présent) +
    tous les `EmployeeDocumentFile.fichier` des documents de l'employé
    (dossier général et contrats — même requête que celle réutilisée pour
    le nettoyage dans `TypeDocumentDetailView.destroy`/`_delete_type_document()`),
    best-effort (`os.remove` dans un `try/except`, ne bloque pas la
    suppression DB si un fichier manque déjà sur disque — cohérent avec
    l'incident du 2026-07-22 documenté dans CLAUDE.md, où l'absence d'un
    fichier ne doit jamais lever une exception qui empêcherait l'opération
    globale).
  - `instance.delete()` — vrai DELETE, cascade DB déjà en place sur toutes
    les FK vers `Employee` (`on_delete=CASCADE` : `Contrat`,
    `EmployeeDocument`, `EmployeeChampValeur`, `HistoriqueFonction`/
    `Categorie`/`Echelle`, `EmployeeAccessGrant` — vérifié dans
    `backend/employees/models.py`). Irréversible, aucune récupération
    possible (même politique que la suppression de documents, voir
    CLAUDE.md section "Documents employés — suppression définitive").
- Frontend : confirmation renforcée — modale avec un champ texte où
  l'admin doit **retaper le matricule exact** de l'employé pour activer le
  bouton "Supprimer définitivement" (nouveau variant de `usePrompt()`/
  `useConfirm()`, comparaison stricte côté client avant l'appel API ; le
  serveur reste la garde réelle via le contrôle de statut ci-dessus, cette
  saisie n'est qu'une protection UX contre le clic accidentel).

### Formulaire de modification (`EmployeeForm.jsx`)

- Le `<select name="statut">` existant garde ses 4 options (édition
  manuelle libre, couvre aussi le cas où le statut a été
  synchronisé automatiquement depuis un contrat — voir
  `sync_statut_from_dernier_contrat` — et où l'admin veut a posteriori
  renseigner un motif).
- Dès que `form.statut !== 'actif'`, un `<select name="motif_archivage">`
  "Motif (optionnel)" apparaît juste en dessous, alimenté par
  `/ref/motifs-archivage/` (actifs). Cache et vide `form.motif_archivage`
  si l'admin repasse le statut à `actif` dans ce même formulaire (cohérence
  avec la règle "Restaurer vide le motif").

## 3. UI `/employees`

- Deux onglets en haut de la page (même pattern visuel que les onglets de
  `/parametres`) : **"Organisation"** et **"Archivés (N)"** (N =
  `count()` serveur des 3 statuts non-Actif dans le périmètre de
  l'utilisateur, affiché sur l'onglet).
- **Onglet Organisation** : le drill-down actuel (Direction → Département
  → Service → cartes employé), désormais **implicitement filtré aux
  employés Actif** — le filtre "Statut" est retiré de la barre d'outils de
  cet onglet (il n'a plus de sens : il n'y a qu'un statut possible ici).
- **Onglet Archivés** : liste à plat (réutilise le composant de table
  existant utilisé pour les résultats de recherche au niveau Service —
  colonnes configurables, pagination, tri), toujours filtrée serveur à
  `statut != actif`, avec :
  - Un filtre "Statut" scopé à 3 valeurs (Inactif / Archivé / Démobilisé),
    "Tous" par défaut.
  - Une colonne "Motif" (nouvelle, dans la liste des colonnes
    configurables, cachée par défaut comme les autres colonnes ajoutées
    récemment — voir CLAUDE.md section "Liste employés — colonnes
    configurables").
  - Actions par ligne : "Restaurer" et "Supprimer définitivement" (voir
    section 2), en plus des actions déjà disponibles (voir fiche détail).
- Backend `EmployeeListCreateView` (`backend/employees/views.py`) : nouveau
  paramètre de query `?vue=archives` (au lieu du `?statut=` actuel pour ce
  cas) → `statut__in=['inactif', 'archive', 'demobilise']`, combinable
  avec `?statut=<une des 3>` pour affiner. Sans `?vue=archives`, le
  comportement par défaut de la vue Organisation devient
  `statut='actif'` implicite (au lieu de "tous les statuts" aujourd'hui).
  `employee_search` (utilisé ailleurs — recherche pour les grants
  ponctuels, etc.) n'est **pas** changé : il doit continuer à trouver un
  employé quel que soit son statut, cas d'usage différent.

## 4. Comptage — badges organisationnels

- `nb_employes` sur `DirectionSerializer`/`PoleSerializer`/
  `DepartementSerializer`/`ServiceSerializer`/`CelluleSerializer`/
  `SectionSerializer` (`backend/employees/referentiel_views.py`) : le
  `SerializerMethodField` passe de `employees.count()` à
  `employees.filter(statut='actif').count()` — cohérent avec le fait que
  ces employés "sortent" visuellement de l'organisation.

## 5. Dashboard

Pour rester cohérent avec le reste (l'organisation ne montre que les
Actifs), les KPIs principaux du Dashboard (total employés, taux de
complétude, dossiers complets) sont recalculés sur les employés **Actif
uniquement** — une tuile supplémentaire "Archivés / Inactifs / Démobilisés"
affiche le total des 3 autres statuts (lien direct vers l'onglet Archivés
de `/employees`), pour ne pas perdre cette information en la retirant
purement et simplement des statistiques.

## 6. Sécurité / audit (à ajouter à `securite.md`)

- Nouveau point numéroté : changement de politique sur la suppression
  d'employé (soft-delete implicite → suppression définitive explicite,
  bloquée tant que l'employé n'a pas été archivé au préalable). Documenter
  le garde-fou serveur (`400` si `statut=actif`) et le fait que
  l'irréversibilité est intentionnelle et confirmée par l'utilisateur,
  symétrique à la politique déjà en place sur les documents.
- Vérifier que `IsAdmin` protège bien les 3 actions (Archiver/Restaurer via
  `PATCH` existant déjà protégé, Supprimer via `DELETE` existant déjà
  protégé) — aucun nouvel endpoint, donc pas de nouvelle surface de
  permission à auditer, seulement le nouveau contrôle de statut dans
  `perform_destroy`.
- CONSULTANT : vérifier que l'onglet Archivés respecte le même scoping que
  l'onglet Organisation (`employee_scope_q()` déjà appliqué par
  `EmployeeListCreateView.get_queryset()`, inchangé par ce chantier — le
  nouveau paramètre `?vue=archives` ne fait que changer le filtre
  `statut`, pas le scoping).

## Hors scope (explicitement laissé de côté)

- Pas de suppression en masse depuis l'onglet Archivés dans cette première
  version (pas de cases à cocher + bouton groupé, contrairement à
  `/parametres`) — un employé à la fois, vu la sensibilité de l'opération.
- Pas de restauration groupée.
- Pas de délai de rétention automatique (ex. suppression auto après N mois
  d'archivage) — purement manuel pour l'instant.

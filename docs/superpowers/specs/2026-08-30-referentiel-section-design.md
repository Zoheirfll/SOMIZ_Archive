# Nouveau référentiel organisationnel "Section"

## Contexte

L'utilisateur veut ajouter un nouveau niveau organisationnel "Section",
qui doit se comporter **exactement comme `Cellule`** (voir
`backend/employees/models.py:131-167`) : une unité terminale rattachée à
UNE Direction OU UN Département (jamais à un Service, jamais aux deux à
la fois), pouvant contenir directement des employés.

## Décisions validées

- Rattachement identique à `Cellule` : `direction` OU `departement`
  (XOR, validé via `clean()`), jamais un Service.
- `Section` et `Cellule` **coexistent** comme deux référentiels
  indépendants — un Département/une Direction peut avoir des Cellules ET
  des Sections en même temps. Pas de fusion, pas de migration de données
  existantes, pas de renommage de `Cellule`.
- Un employé est rattaché à Service **OU** Cellule **OU** Section — même
  absence de contrainte DB stricte que l'exclusivité Service/Cellule
  actuelle (gérée côté formulaire, pas en base).

## Modèle de données

Nouveau modèle `Section` (`backend/employees/models.py`), copie conforme
de `Cellule` :

```python
class Section(models.Model):
    """
    Unité terminale (contient des employés, comme un Service ou une
    Cellule) rattachée directement à une Direction OU à un Département —
    jamais à un Service. Exactement un des deux champs
    `direction`/`departement` doit être renseigné (validé côté serializer
    et en base via `clean()`). Référentiel indépendant de Cellule — les
    deux coexistent, un Département peut avoir des Cellules ET des
    Sections.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    direction = models.ForeignKey(
        Direction, null=True, blank=True, on_delete=models.CASCADE,
        related_name='sections', verbose_name="Direction"
    )
    departement = models.ForeignKey(
        Departement, null=True, blank=True, on_delete=models.CASCADE,
        related_name='sections', verbose_name="Département"
    )
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'sections'
        verbose_name = "Section"
        ordering = ['nom']

    def __str__(self):
        parent = self.direction.nom if self.direction_id else self.departement.nom
        return f"{parent} → {self.nom}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if bool(self.direction_id) == bool(self.departement_id):
            raise ValidationError(
                "Une Section doit être rattachée à exactement une Direction OU un Département."
            )
```

`Employee.section` — nouveau `ForeignKey(Section, null=True, blank=True,
on_delete=models.SET_NULL, related_name='employees')`, ajouté juste après
le champ `cellule` existant (même style).

## Scoping (`accounts/models.py`)

Miroir exact de ce qui existe pour `scope_cellules` :

- `User.scope_sections` — nouveau `ManyToManyField('employees.Section',
  blank=True, related_name='scoped_users', verbose_name="Périmètre —
  Sections")`.
- `_scope_ids()` retourne un 6ᵉ set `section_ids` (direction, pole,
  departement, service, cellule, section).
- `_org_employee_scope_q()`/`employee_scope_q()` : ajout de
  `Q(**{f'{prefix}section_id__in': section_ids})` dans le OR, même
  emplacement que la ligne `cellule_id__in`.
- `_org_can_access_employee()`/`can_access_employee()` : ajout de
  `or employee.section_id in section_ids`.
- `accessible_directions_qs()` : ajout de
  `Q(sections__id__in=section_ids)` et
  `Q(departements__sections__id__in=section_ids)` au OR (miroir des deux
  lignes équivalentes pour `cellules`).
- `accessible_departements_qs()` : ajout de
  `Q(sections__id__in=section_ids)` au OR (miroir de la ligne
  `cellules__id__in`).
- Nouvelle méthode `accessible_sections_qs()` — copie conforme de
  `accessible_cellules_qs()`.

## CRUD référentiel (`referentiel_views.py` + `referentiel_urls.py`)

- `SectionSerializer` — copie de `CelluleSerializer` (mêmes champs,
  même validation `direction` XOR `departement`, même `nb_employes`
  `SerializerMethodField` — le point corrigé début de ce chantier pour
  `ServiceSerializer` s'applique aussi ici, `Section` doit l'avoir dès sa
  création).
- `SectionListCreateView`/`SectionDetailView` — copie de
  `CelluleListCreateView`/`CelluleDetailView`. Le `GET` liste applique
  `?all=1` (bypass périmètre, réservé à `/organigramme`) selon le même
  mécanisme que les autres référentiels.
- Routes `referentiel_urls.py` : `/ref/sections/`,
  `/ref/sections/<uuid:pk>/` — même schéma que `/ref/cellules/`.
- `ReferentielBulkDeleteView` : `'sections'` ajouté au dict des modèles
  autorisés (même pattern que `'cellules'`).

## Import (`import_views.py`)

- `sections` ajouté à `ReferentielImportView.MODELS` et
  `ReferentielImportTemplateView.TEMPLATES`, copie conforme du traitement
  `cellules` : colonne `nom` obligatoire, **au moins une** des colonnes
  `direction`/`departement` renseignée (jamais aucune des deux), même
  désambiguïsation `resoudre_departement()` (le nom de Département n'est
  unique qu'au sein de sa Direction), même détection de doublon scopée à
  `(parent_id, nom)`.

## Frontend

- **`Parametres.jsx`** : nouvel onglet "Sections" — copie exacte de
  l'onglet "Cellules" (`RefTable`, formulaire d'ajout/édition, import/
  template, suppression en masse, tri `sortableTab`, colonne pseudo-champ
  "Rattachée à" avec `sortable: false` comme pour `cellules`).
- **`EmployeeForm.jsx`** : nouveau `<Select>` "Section (alternative au
  Service)" à la suite du champ "Cellule (alternative au Service)"
  (lignes ~688-711), même structure exacte : `onChange` vide `service` et
  `cellule` (Service/Cellule/Section restent mutuellement exclusifs côté
  formulaire, comme aujourd'hui Service/Cellule), filtré par
  `form.departement`/`form.direction` comme le filtre Cellule actuel, State
  `sections` chargé via `api.get("/ref/sections/")` au montage (comme
  `cellules`). Message de transfert (`AuditLogs.jsx#formatTransfer`) et
  `TRANSFER_FIELDS` côté backend (`employees/views.py`) : ajouter
  `'section'` à la liste, même mécanisme que `'cellule'`.
- **`Employees.jsx`** (drill-down Direction→Département→Service/Cellule→
  Employé) : les cartes Section apparaissent au même niveau que les
  cartes Cellule, avec badge `nb_employes` (`TYPE_META.section.countKey`,
  copie de l'entrée `cellule` existante).
- **`Organigramme.jsx`** : Section ajoutée à l'arbre affiché, mêmes règles
  de grisage hors périmètre (`isAccessible()`/`accessibleDirIds`) que
  Cellule ; `/ref/sections/?all=1` utilisé ici comme les autres
  référentiels (bypass périmètre, affichage grisé côté frontend).
- **`Users.jsx`** (modale "Périmètre") : nouvelle entrée `sections` dans
  la cascade organisationnelle (`visibleSections` calculé comme
  `visibleCellules` — OR entre Directions cochées et Départements cochés,
  pas de cascade exclusive), boutons Tout/Aucun, `toggleSection()` copie
  de `toggleCellule()`, `scope_sections` ajouté au payload
  `handleSaveScope`/à la création de compte.

## Hors scope

- Pas de fusion/renommage de `Cellule` — les deux référentiels restent
  strictement indépendants.
- Pas de migration de données existantes.
- Pas de champ `section` dans le périmètre "employés spécifiques"
  (`EmployeeAccessGrant`, chantier précédent) — ce chantier ne touche que
  le périmètre organisationnel classique.

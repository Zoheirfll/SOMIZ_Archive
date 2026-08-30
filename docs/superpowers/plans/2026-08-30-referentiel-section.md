# Référentiel "Section" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un nouveau référentiel organisationnel "Section", clone fonctionnel exact de "Cellule" (rattachée à Direction OU Département, jamais Service, avec ses propres employés), coexistant avec Cellule sans la remplacer.

**Architecture:** Nouveau modèle `Section` (même forme que `Cellule`), branché partout où `Cellule` apparaît déjà : scoping (`accounts/models.py`), CRUD référentiel, import CSV/xlsx, filtre employés, et cinq pages frontend (Paramètres, EmployeeForm, Employés, Organigramme, Utilisateurs).

**Tech Stack:** Django 4.2 / DRF 3.15 (backend), React 19 (frontend), pytest (tests backend).

## Global Constraints

- Section et Cellule coexistent comme deux référentiels indépendants — aucune fusion, aucun renommage de Cellule, aucune migration de données existantes.
- Une Section est rattachée à exactement une Direction OU un Département (XOR, jamais Service, jamais les deux) — même règle que Cellule.
- Styles frontend 100% inline (`style={{}}`), tokens `theme.js`.
- Toute vue listant/retrouvant des employés doit appliquer le scoping (`employee_scope_q()`/`can_access_employee()`) — Section doit y être intégrée comme Cellule.
- Pas de `window.confirm`/`window.prompt` — ce chantier n'introduit aucune nouvelle confirmation.

---

### Task 1: Modèle `Section` + champ `Employee.section` + migration

**Files:**
- Modify: `backend/employees/models.py` (ajouter `Section` après `Cellule`, ligne ~168 ; ajouter `Employee.section` après `Employee.cellule`, ligne ~294)
- Create: `backend/employees/migrations/0016_section_employee_section.py`
- Test: `backend/tests/test_employees_models.py`

**Interfaces:**
- Produces: `Section(direction, departement, nom, code, description, is_active, created_at)`, `Section.clean()` (XOR direction/departement), `Employee.section` (FK nullable).

- [ ] **Step 1: Écrire le modèle `Section`**

Dans `backend/employees/models.py`, juste après la classe `Cellule` (avant `class Poste(models.Model):`) :

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

- [ ] **Step 2: Ajouter `Employee.section`**

Dans `backend/employees/models.py`, juste après le champ `cellule` de `Employee` (ligne ~291-294) :

```python
    cellule = models.ForeignKey(
        Cellule, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    section = models.ForeignKey(
        Section, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
```

(`Section` est définie plus haut dans le même fichier, avant `Employee` — pas de problème de référence.)

- [ ] **Step 3: Générer et appliquer la migration**

Run: `cd backend && ./venv/Scripts/python.exe manage.py makemigrations employees`
Expected: crée `employees/migrations/0016_section_employee_section.py` (le nom exact peut varier).

Run: `./venv/Scripts/python.exe manage.py migrate employees`
Expected: `Applying employees.0016_..._... OK`

- [ ] **Step 4: Écrire un test de validation `clean()`**

Ajouter à `backend/tests/test_employees_models.py` :

```python
class TestSectionModel:
    def test_clean_rejects_both_direction_and_departement(self, direction, departement):
        from employees.models import Section
        s = Section(nom="Section Test", direction=direction, departement=departement)
        with pytest.raises(ValidationError):
            s.clean()

    def test_clean_rejects_neither(self):
        from employees.models import Section
        s = Section(nom="Section Test")
        with pytest.raises(ValidationError):
            s.clean()

    def test_clean_accepts_direction_only(self, direction):
        from employees.models import Section
        s = Section(nom="Section Test", direction=direction)
        s.clean()  # ne lève pas

    def test_str_shows_parent(self, departement):
        from employees.models import Section
        s = Section.objects.create(nom="Section Paie", departement=departement)
        assert str(s) == f"{departement.nom} → Section Paie"
```

Vérifier que `from django.core.exceptions import ValidationError` est déjà
importé en haut de `test_employees_models.py` (sinon l'ajouter).

- [ ] **Step 5: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_employees_models.py -k Section -v --no-cov`
Expected: `4 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/ backend/tests/test_employees_models.py
git commit -m "feat(employees): modèle Section (clone de Cellule) + Employee.section"
```

---

### Task 2: Scoping — `Section` dans `accounts/models.py`

**Files:**
- Modify: `backend/accounts/models.py` (ajout `scope_sections` M2M ligne ~103, et extension de `_scope_ids`/`has_scope_restriction`/`_org_employee_scope_q`/`_org_can_access_employee`/`accessible_directions_qs`/`accessible_departements_qs` + nouvelle `accessible_sections_qs`)
- Create: `backend/accounts/migrations/0009_user_scope_sections.py`
- Test: `backend/tests/test_employee_scoping.py`

**Interfaces:**
- Produces: `User.scope_sections` (M2M), `User.accessible_sections_qs()`. `employee_scope_q()`/`can_access_employee()`/`accessible_directions_qs()`/`accessible_departements_qs()` étendus pour inclure Section.

- [ ] **Step 1: Ajouter le champ `scope_sections`**

Dans `backend/accounts/models.py`, juste après `scope_cellules` (avant le commentaire "Périmètre indépendant") :

```python
    scope_cellules = models.ManyToManyField(
        'employees.Cellule', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Cellules"
    )
    scope_sections = models.ManyToManyField(
        'employees.Section', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Sections"
    )
```

- [ ] **Step 2: Étendre `_scope_ids`/`has_scope_restriction`**

Remplacer :

```python
    def _scope_ids(self):
        """(direction_ids, pole_ids, departement_ids, service_ids, cellule_ids)
        sélectionnés — sets vides si aucune restriction (ADMIN, ou CONSULTANT
        sans périmètre assigné)."""
        if self.is_admin or not self.pk:
            return set(), set(), set(), set(), set()
        return (
            set(self.scope_directions.values_list('id', flat=True)),
            set(self.scope_poles.values_list('id', flat=True)),
            set(self.scope_departements.values_list('id', flat=True)),
            set(self.scope_services.values_list('id', flat=True)),
            set(self.scope_cellules.values_list('id', flat=True)),
        )

    @property
    def has_scope_restriction(self):
        """True si ce compte est restreint à un périmètre organisationnel."""
        if self.is_admin or not self.pk:
            return False
        d, pol, dep, s, cel = self._scope_ids()
        return bool(d or pol or dep or s or cel)
```

Par :

```python
    def _scope_ids(self):
        """(direction_ids, pole_ids, departement_ids, service_ids,
        cellule_ids, section_ids) sélectionnés — sets vides si aucune
        restriction (ADMIN, ou CONSULTANT sans périmètre assigné)."""
        if self.is_admin or not self.pk:
            return set(), set(), set(), set(), set(), set()
        return (
            set(self.scope_directions.values_list('id', flat=True)),
            set(self.scope_poles.values_list('id', flat=True)),
            set(self.scope_departements.values_list('id', flat=True)),
            set(self.scope_services.values_list('id', flat=True)),
            set(self.scope_cellules.values_list('id', flat=True)),
            set(self.scope_sections.values_list('id', flat=True)),
        )

    @property
    def has_scope_restriction(self):
        """True si ce compte est restreint à un périmètre organisationnel."""
        if self.is_admin or not self.pk:
            return False
        d, pol, dep, s, cel, sec = self._scope_ids()
        return bool(d or pol or dep or s or cel or sec)
```

- [ ] **Step 3: Étendre `_org_employee_scope_q`/`_org_can_access_employee`**

Remplacer :

```python
    def _org_employee_scope_q(self, prefix=''):
        """employee_scope_q() sans les grants ponctuels — périmètre
        organisationnel seul. Utilisé en interne par
        accessible_type_doc_ids_for_employee()."""
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Q()
        q = Q()
        if direction_ids:
            q |= Q(**{f'{prefix}direction_id__in': direction_ids})
        if pole_ids:
            q |= Q(**{f'{prefix}departement__pole_id__in': pole_ids})
        if departement_ids:
            q |= Q(**{f'{prefix}departement_id__in': departement_ids})
        if service_ids:
            q |= Q(**{f'{prefix}service_id__in': service_ids})
        if cellule_ids:
            q |= Q(**{f'{prefix}cellule_id__in': cellule_ids})
        return q
```

Par :

```python
    def _org_employee_scope_q(self, prefix=''):
        """employee_scope_q() sans les grants ponctuels — périmètre
        organisationnel seul. Utilisé en interne par
        accessible_type_doc_ids_for_employee()."""
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids, section_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids or section_ids):
            return Q()
        q = Q()
        if direction_ids:
            q |= Q(**{f'{prefix}direction_id__in': direction_ids})
        if pole_ids:
            q |= Q(**{f'{prefix}departement__pole_id__in': pole_ids})
        if departement_ids:
            q |= Q(**{f'{prefix}departement_id__in': departement_ids})
        if service_ids:
            q |= Q(**{f'{prefix}service_id__in': service_ids})
        if cellule_ids:
            q |= Q(**{f'{prefix}cellule_id__in': cellule_ids})
        if section_ids:
            q |= Q(**{f'{prefix}section_id__in': section_ids})
        return q
```

Remplacer :

```python
    def _org_can_access_employee(self, employee):
        """can_access_employee() sans les grants ponctuels."""
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return True
        return (
            employee.direction_id in direction_ids
            or (employee.departement_id and employee.departement.pole_id in pole_ids)
            or employee.departement_id in departement_ids
            or employee.service_id in service_ids
            or employee.cellule_id in cellule_ids
        )
```

Par :

```python
    def _org_can_access_employee(self, employee):
        """can_access_employee() sans les grants ponctuels."""
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids, section_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids or section_ids):
            return True
        return (
            employee.direction_id in direction_ids
            or (employee.departement_id and employee.departement.pole_id in pole_ids)
            or employee.departement_id in departement_ids
            or employee.service_id in service_ids
            or employee.cellule_id in cellule_ids
            or employee.section_id in section_ids
        )
```

- [ ] **Step 4: Étendre `accessible_directions_qs`/`accessible_departements_qs`, ajouter `accessible_sections_qs`**

Remplacer :

```python
    def accessible_directions_qs(self):
        """Directions visibles pour ce compte (ex. filtre de la page Employés).
        Non restreint pour ADMIN ou CONSULTANT sans périmètre."""
        from employees.models import Direction
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Direction.objects.all()
        return Direction.objects.filter(
            Q(id__in=direction_ids)
            | Q(poles__id__in=pole_ids)
            | Q(departements__id__in=departement_ids)
            | Q(departements__services__id__in=service_ids)
            | Q(cellules__id__in=cellule_ids)
            | Q(departements__cellules__id__in=cellule_ids)
        ).distinct()
```

Par :

```python
    def accessible_directions_qs(self):
        """Directions visibles pour ce compte (ex. filtre de la page Employés).
        Non restreint pour ADMIN ou CONSULTANT sans périmètre."""
        from employees.models import Direction
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids, section_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids or section_ids):
            return Direction.objects.all()
        return Direction.objects.filter(
            Q(id__in=direction_ids)
            | Q(poles__id__in=pole_ids)
            | Q(departements__id__in=departement_ids)
            | Q(departements__services__id__in=service_ids)
            | Q(cellules__id__in=cellule_ids)
            | Q(departements__cellules__id__in=cellule_ids)
            | Q(sections__id__in=section_ids)
            | Q(departements__sections__id__in=section_ids)
        ).distinct()
```

`accessible_poles_qs` et `accessible_services_qs` restent inchangées
(Section n'apparaît pas dans leur logique, exactement comme Cellule n'y
apparaît pas).

Remplacer :

```python
    def accessible_departements_qs(self):
        """Départements visibles pour ce compte."""
        from employees.models import Departement
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Departement.objects.all()
        return Departement.objects.filter(
            Q(direction_id__in=direction_ids)
            | Q(pole_id__in=pole_ids)
            | Q(id__in=departement_ids)
            | Q(services__id__in=service_ids)
            | Q(cellules__id__in=cellule_ids)
        ).distinct()
```

Par :

```python
    def accessible_departements_qs(self):
        """Départements visibles pour ce compte."""
        from employees.models import Departement
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids, section_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids or section_ids):
            return Departement.objects.all()
        return Departement.objects.filter(
            Q(direction_id__in=direction_ids)
            | Q(pole_id__in=pole_ids)
            | Q(id__in=departement_ids)
            | Q(services__id__in=service_ids)
            | Q(cellules__id__in=cellule_ids)
            | Q(sections__id__in=section_ids)
        ).distinct()
```

`accessible_poles_qs`/`accessible_services_qs` restent inchangées. Après
`accessible_cellules_qs` (inchangée), ajouter :

```python
    def accessible_sections_qs(self):
        """Sections visibles pour ce compte."""
        from employees.models import Section
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids, section_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids or section_ids):
            return Section.objects.all()
        return Section.objects.filter(
            Q(direction_id__in=direction_ids)
            | Q(departement_id__in=departement_ids)
            | Q(id__in=section_ids)
        ).distinct()
```

**Piège de cohérence** : `_scope_ids()` renvoie désormais un tuple à 6
éléments — toute méthode qui le déstructure (`accessible_poles_qs`,
`accessible_services_qs`, `accessible_cellules_qs` inclus) doit être mise
à jour pour ajouter `, section_ids` à l'unpacking même si `section_ids`
n'est pas utilisé dans le corps, sinon `ValueError: too many values to
unpack`. Vérifier chaque site d'appel de `self._scope_ids()` dans le
fichier avant de considérer cette étape terminée.

- [ ] **Step 5: Générer et appliquer la migration**

Run: `cd backend && ./venv/Scripts/python.exe manage.py makemigrations accounts`
Expected: crée `accounts/migrations/0009_user_scope_sections.py`.

Run: `./venv/Scripts/python.exe manage.py migrate accounts`
Expected: `Applying accounts.0009_user_scope_sections... OK`

- [ ] **Step 6: Écrire les tests de scoping**

Ajouter à `backend/tests/test_employee_scoping.py` :

```python
class TestSectionScoping:
    def test_consultant_matching_section_scope(self, scoped_consultant, employee):
        from employees.models import Section
        section = Section.objects.create(nom="Section Test", direction=employee.direction)
        employee.section = section
        employee.service = None
        employee.save()
        scoped_consultant.scope_sections.set([section])
        assert scoped_consultant.can_access_employee(employee) is True

    def test_consultant_mismatched_section_scope(self, scoped_consultant, employee, direction):
        from employees.models import Section
        other_direction = Direction.objects.create(nom="Direction Section Autre", code="DSA")
        section = Section.objects.create(nom="Section Autre", direction=other_direction)
        scoped_consultant.scope_sections.set([section])
        assert scoped_consultant.can_access_employee(employee) is False

    def test_accessible_sections_qs_unrestricted_by_default(self, consultant_user):
        from employees.models import Section
        Section.objects.create(nom="Section X", direction=Direction.objects.create(nom="Dir X", code="DX"))
        assert consultant_user.accessible_sections_qs().count() == Section.objects.count()
```

- [ ] **Step 7: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_employee_scoping.py -v --no-cov`
Expected: tous PASS (aucune régression sur les tests Cellule/Direction/etc. existants).

- [ ] **Step 8: Commit**

```bash
git add backend/accounts/models.py backend/accounts/migrations/ backend/tests/test_employee_scoping.py
git commit -m "feat(accounts): intègre Section dans le scoping CONSULTANT"
```

---

### Task 3: Serializers employé — `section` dans List/Detail/CreateUpdate

**Files:**
- Modify: `backend/employees/serializers.py`
- Test: `backend/tests/test_employees_models.py`

**Interfaces:**
- Consumes: `Employee.section`, `Section` (Task 1).
- Produces: `EmployeeListSerializer.section_nom`, `EmployeeDetailSerializer.section`/`section_nom`, `EmployeeCreateUpdateSerializer` accepte `section` et l'aligne automatiquement sur `direction`/`departement`, vide `service`/`cellule`.

- [ ] **Step 1: `EmployeeListSerializer`**

Dans `backend/employees/serializers.py`, ajouter le champ et l'inclure
dans `Meta.fields` :

```python
    cellule_nom = serializers.CharField(source='cellule.nom', read_only=True, default=None)
    section_nom = serializers.CharField(source='section.nom', read_only=True, default=None)
```

```python
            'direction_nom', 'departement_nom', 'service_nom', 'cellule_nom', 'section_nom',
```

(remplace la ligne `'direction_nom', 'departement_nom', 'service_nom', 'cellule_nom',` existante dans `Meta.fields` de `EmployeeListSerializer`.)

- [ ] **Step 2: `EmployeeDetailSerializer`**

Même ajout de `section_nom` (champ), et dans `Meta.fields` :

```python
            'cellule', 'cellule_nom',
            'section', 'section_nom',
```

- [ ] **Step 3: `EmployeeCreateUpdateSerializer`**

Remplacer :

```python
class EmployeeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'date_fin_contrat', 'statut',
            'direction', 'departement', 'service', 'cellule',
            'poste', 'type_contrat', 'categorie',
        ]
        read_only_fields = ['id']
    def validate_matricule(self, value):
        return value.strip().upper()

    def validate_nom(self, value):
        return value.strip().upper()

    def validate_prenom(self, value):
        return value.strip().capitalize()

    def validate(self, attrs):
        # Une Cellule est rattachée à une Direction OU un Département — on
        # aligne automatiquement direction/departement/service de l'employé
        # sur celui de la Cellule choisie, pour que le scoping CONSULTANT
        # (basé sur ces champs) continue de fonctionner sans modification.
        cellule = attrs.get('cellule', getattr(self.instance, 'cellule', None))
        if cellule is not None:
            attrs['service'] = None
            if cellule.departement_id:
                attrs['departement'] = cellule.departement
                attrs['direction'] = cellule.departement.direction
            else:
                attrs['departement'] = None
                attrs['direction'] = cellule.direction
        return attrs
```

Par :

```python
class EmployeeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'date_fin_contrat', 'statut',
            'direction', 'departement', 'service', 'cellule', 'section',
            'poste', 'type_contrat', 'categorie',
        ]
        read_only_fields = ['id']
    def validate_matricule(self, value):
        return value.strip().upper()

    def validate_nom(self, value):
        return value.strip().upper()

    def validate_prenom(self, value):
        return value.strip().capitalize()

    def validate(self, attrs):
        # Une Cellule/Section est rattachée à une Direction OU un
        # Département — on aligne automatiquement direction/departement de
        # l'employé sur celui choisi, et on vide les deux autres champs
        # d'affectation terminale (service/cellule/section sont mutuellement
        # exclusifs), pour que le scoping CONSULTANT (basé sur ces champs)
        # continue de fonctionner sans modification.
        cellule = attrs.get('cellule', getattr(self.instance, 'cellule', None))
        section = attrs.get('section', getattr(self.instance, 'section', None))
        if cellule is not None:
            attrs['service'] = None
            attrs['section'] = None
            if cellule.departement_id:
                attrs['departement'] = cellule.departement
                attrs['direction'] = cellule.departement.direction
            else:
                attrs['departement'] = None
                attrs['direction'] = cellule.direction
        elif section is not None:
            attrs['service'] = None
            attrs['cellule'] = None
            if section.departement_id:
                attrs['departement'] = section.departement
                attrs['direction'] = section.departement.direction
            else:
                attrs['departement'] = None
                attrs['direction'] = section.direction
        return attrs
```

- [ ] **Step 4: Écrire les tests**

Ajouter à `backend/tests/test_employees_models.py` :

```python
class TestEmployeeCreateUpdateSerializerSection:
    def test_section_aligns_direction_departement_and_clears_service_cellule(
        self, employee, departement
    ):
        from employees.models import Section
        from employees.serializers import EmployeeCreateUpdateSerializer
        section = Section.objects.create(nom="Section Paie", departement=departement)
        serializer = EmployeeCreateUpdateSerializer(
            instance=employee, data={'section': str(section.id)}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        emp = serializer.save()
        assert emp.section_id == section.id
        assert emp.departement_id == departement.id
        assert emp.direction_id == departement.direction_id
        assert emp.service_id is None
        assert emp.cellule_id is None

    def test_cellule_still_clears_section(self, employee, departement):
        from employees.models import Section, Cellule
        section = Section.objects.create(nom="Section Paie", departement=departement)
        employee.section = section
        employee.save()
        cellule = Cellule.objects.create(nom="Cellule Test", departement=departement)
        from employees.serializers import EmployeeCreateUpdateSerializer
        serializer = EmployeeCreateUpdateSerializer(
            instance=employee, data={'cellule': str(cellule.id)}, partial=True
        )
        assert serializer.is_valid(), serializer.errors
        emp = serializer.save()
        assert emp.cellule_id == cellule.id
        assert emp.section_id is None
```

Vérifier le nom exact de la fixture `departement` dans `conftest.py`
(déjà utilisée ailleurs dans ce fichier de test).

- [ ] **Step 5: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_employees_models.py -k Section -v --no-cov`
Expected: `6 passed` (les 4 du Task 1 + les 2 nouveaux).

- [ ] **Step 6: Commit**

```bash
git add backend/employees/serializers.py backend/tests/test_employees_models.py
git commit -m "feat(employees): section dans les serializers employé + exclusivité service/cellule/section"
```

---

### Task 4: CRUD référentiel `Section` (`referentiel_views.py` + `referentiel_urls.py`)

**Files:**
- Modify: `backend/employees/referentiel_views.py`
- Modify: `backend/employees/referentiel_urls.py`
- Test: `backend/tests/test_permissions.py` (ou nouveau test dédié, voir Step 4)

**Interfaces:**
- Consumes: `Section` (Task 1), `User.accessible_sections_qs()` (Task 2).
- Produces: `SectionSerializer`, `SectionListCreateView`, `SectionDetailView`,
  routes `/ref/sections/`, `/ref/sections/<uuid:pk>/`.

- [ ] **Step 1: Import du modèle**

Dans `backend/employees/referentiel_views.py`, ligne ~20 :

```python
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument,
    EmployeeDocument, EmployeeDocumentFile,
    ChampPersonnalise, SystemFieldLabel,
    Pole, Cellule, Section,
)
```

- [ ] **Step 2: `SectionSerializer` + vues**

Juste après `CelluleDetailView` (ligne ~355), ajouter :

```python
class SectionSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True, default=None)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True, default=None)
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = Section
        fields = [
            'id', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
        ]
    def get_nb_employes(self, obj):
        return obj.employees.count()

    def validate(self, attrs):
        direction = attrs.get('direction', getattr(self.instance, 'direction', None))
        departement = attrs.get('departement', getattr(self.instance, 'departement', None))
        if bool(direction) == bool(departement):
            raise serializers.ValidationError(
                "Une Section doit être rattachée à exactement une Direction OU un Département."
            )
        return attrs


class SectionListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = SectionSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Section.objects.select_related('direction', 'departement').all()
        else:
            qs = self.request.user.accessible_sections_qs().select_related('direction', 'departement')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement=departement)
        return self.filter_search(qs)

class SectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SectionSerializer
    permission_classes = [IsAdmin]
    queryset = Section.objects.select_related('direction', 'departement')
```

- [ ] **Step 3: `ReferentielBulkDeleteView.MODELS`**

Ajouter `'sections': Section,` juste après `'cellules': Cellule,` dans le
dict `MODELS` de `ReferentielBulkDeleteView`.

- [ ] **Step 4: Routes**

Dans `backend/employees/referentiel_urls.py` :

```python
from employees.referentiel_views import (
    DirectionListCreateView, DirectionDetailView,
    PoleListCreateView, PoleDetailView,
    DepartementListCreateView, DepartementDetailView,
    ServiceListCreateView, ServiceDetailView,
    CelluleListCreateView, CelluleDetailView,
    SectionListCreateView, SectionDetailView,
    PosteListCreateView, PosteDetailView,
    TypeContratListCreateView, TypeContratDetailView,
    CategorieListCreateView, CategorieDetailView,
    TypeDocumentListCreateView, TypeDocumentDetailView,
    ChampPersonnaliseListCreateView, ChampPersonnaliseDetailView,
    SystemFieldLabelListView, SystemFieldLabelUpdateView,
    ReferentielBulkDeleteView,
)

urlpatterns = [
    path('directions/', DirectionListCreateView.as_view()),
    path('directions/<uuid:pk>/', DirectionDetailView.as_view()),
    path('poles/', PoleListCreateView.as_view()),
    path('poles/<uuid:pk>/', PoleDetailView.as_view()),
    path('departements/', DepartementListCreateView.as_view()),
    path('departements/<uuid:pk>/', DepartementDetailView.as_view()),
    path('services/', ServiceListCreateView.as_view()),
    path('services/<uuid:pk>/', ServiceDetailView.as_view()),
    path('cellules/', CelluleListCreateView.as_view()),
    path('cellules/<uuid:pk>/', CelluleDetailView.as_view()),
    path('sections/', SectionListCreateView.as_view()),
    path('sections/<uuid:pk>/', SectionDetailView.as_view()),
    path('postes/', PosteListCreateView.as_view()),
    path('postes/<uuid:pk>/', PosteDetailView.as_view()),
    path('types-contrat/', TypeContratListCreateView.as_view()),
    path('types-contrat/<uuid:pk>/', TypeContratDetailView.as_view()),
    path('categories/', CategorieListCreateView.as_view()),
    path('categories/<uuid:pk>/', CategorieDetailView.as_view()),
    path('types-documents/', TypeDocumentListCreateView.as_view()),
    path('types-documents/<uuid:pk>/', TypeDocumentDetailView.as_view()),
    path('champs-personnalises/', ChampPersonnaliseListCreateView.as_view()),
    path('champs-personnalises/<uuid:pk>/', ChampPersonnaliseDetailView.as_view()),
    path('system-field-labels/', SystemFieldLabelListView.as_view()),
    path('system-field-labels/<str:code>/', SystemFieldLabelUpdateView.as_view()),
    path('bulk-delete/<str:model>/', ReferentielBulkDeleteView.as_view()),
]
```

- [ ] **Step 5: Écrire les tests**

Créer `backend/tests/test_section_referentiel.py` :

```python
"""Tests — CRUD référentiel Section (clone de Cellule)."""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import Direction, Departement, Section

pytestmark = pytest.mark.django_db

User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


class TestSectionCRUD:
    def test_admin_can_create_section_on_direction(self, admin_user, direction):
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/sections/",
            {"nom": "Section Test", "direction": str(direction.id)},
            format="json",
        )
        assert resp.status_code == 201, resp.data
        assert Section.objects.filter(nom="Section Test", direction=direction).exists()

    def test_rejects_both_direction_and_departement(self, admin_user, direction, departement):
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/sections/",
            {"nom": "Section Test", "direction": str(direction.id), "departement": str(departement.id)},
            format="json",
        )
        assert resp.status_code == 400

    def test_rejects_neither(self, admin_user):
        client = auth_client(admin_user)
        resp = client.post("/api/ref/sections/", {"nom": "Section Test"}, format="json")
        assert resp.status_code == 400

    def test_consultant_cannot_create(self, consultant_user):
        client = auth_client(consultant_user)
        resp = client.post("/api/ref/sections/", {"nom": "Section Test"}, format="json")
        assert resp.status_code == 403

    def test_bulk_delete_section(self, admin_user, direction):
        section = Section.objects.create(nom="Section À supprimer", direction=direction)
        client = auth_client(admin_user)
        resp = client.post(
            "/api/ref/bulk-delete/sections/",
            {"ids": [str(section.id)]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_supprimes"] == 1
        assert not Section.objects.filter(pk=section.id).exists()
```

- [ ] **Step 6: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_section_referentiel.py -v --no-cov`
Expected: `5 passed`

- [ ] **Step 7: Commit**

```bash
git add backend/employees/referentiel_views.py backend/employees/referentiel_urls.py backend/tests/test_section_referentiel.py
git commit -m "feat(employees): CRUD référentiel Section (clone de Cellule)"
```

---

### Task 5: Filtre `?section=` sur la liste employés + transferts

**Files:**
- Modify: `backend/employees/views.py` (`EmployeeListCreateView.get_queryset` ligne ~93-146, `EmployeeDetailView.TRANSFER_FIELDS` ligne ~245)
- Test: `backend/tests/test_employees_views.py`

**Interfaces:**
- Consumes: `Employee.section` (Task 1).

- [ ] **Step 1: `select_related` + filtre `section`**

Dans `backend/employees/views.py`, `EmployeeListCreateView.get_queryset` :

Remplacer :
```python
        qs = Employee.objects.select_related(
            'direction', 'departement', 'service', 'cellule', 'poste', 'type_contrat'
        ).prefetch_related(
```
Par :
```python
        qs = Employee.objects.select_related(
            'direction', 'departement', 'service', 'cellule', 'section', 'poste', 'type_contrat'
        ).prefetch_related(
```

Après le bloc `cellule = self.request.query_params.get('cellule') / if cellule: qs = qs.filter(cellule=cellule)`, ajouter :

```python
        section = self.request.query_params.get('section')
        if section:
            qs = qs.filter(section=section)
```

- [ ] **Step 2: `TRANSFER_FIELDS`**

Remplacer :
```python
    TRANSFER_FIELDS = ['direction', 'departement', 'service', 'cellule']
```
Par :
```python
    TRANSFER_FIELDS = ['direction', 'departement', 'service', 'cellule', 'section']
```

- [ ] **Step 3: Écrire un test du filtre**

Ajouter à `backend/tests/test_employees_views.py` (dans `TestEmployeeListView` ou classe équivalente déjà présente pour les filtres) :

```python
def test_filter_by_section(self, admin_user, employee, direction):
    from employees.models import Section
    section = Section.objects.create(nom="Section Filtre", direction=direction)
    employee.section = section
    employee.service = None
    employee.save()
    client = auth_client(admin_user)
    resp = client.get("/api/employees/", {"section": str(section.id)})
    assert resp.status_code == 200
    results = resp.data.get("results", resp.data)
    assert any(e["id"] == str(employee.id) for e in results)
```

Vérifier le nom exact de la classe/fonction `auth_client` déjà définie
dans `test_employees_views.py` (même pattern que les autres fichiers de
test de ce dépôt).

- [ ] **Step 4: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_employees_views.py -k section -v --no-cov`
Expected: `1 passed`

- [ ] **Step 5: Lancer la suite complète backend**

Run: `./venv/Scripts/python.exe -m pytest --no-cov -q`
Expected: tous les tests passent (aucune régression).

- [ ] **Step 6: Commit**

```bash
git add backend/employees/views.py backend/tests/test_employees_views.py
git commit -m "feat(employees): filtre ?section= sur la liste employés + traçabilité des transferts"
```

---

### Task 6: Import CSV/xlsx référentiel `sections`

**Files:**
- Modify: `backend/employees/import_views.py`
- Test: `backend/tests/test_document_upload.py` (ou nouveau fichier — voir Step 4)

**Interfaces:**
- Consumes: `Section` (Task 1).
- Produces: `sections` accepté par `ReferentielImportView`/`ReferentielImportTemplateView`.

- [ ] **Step 1: Import du modèle + `MODELS['sections']`**

Ligne ~17 :
```python
    Service, Cellule, Section, Poste, TypeContrat, Categorie, Contrat,
```

Dans `ReferentielImportView.MODELS`, juste après l'entrée `'cellules'` :

```python
        'sections': {
            'model': Section,
            'required': {'nom'},
            # Mêmes règles que 'cellules' (voir commentaire ci-dessus) :
            # 'direction' sert à la fois de parent direct (departement vide)
            # et de désambiguïsation (departement rempli).
            'optional': {'code', 'direction', 'departement', 'description'},
        },
```

- [ ] **Step 2: Détection de doublons + parsing par ligne**

Remplacer :
```python
        elif model == 'cellules':
            existants = {
                (c.direction_id, c.departement_id, c.nom.upper())
                for c in Cellule.objects.all()
            }
```
Par :
```python
        elif model in ('cellules', 'sections'):
            existants = {
                (c.direction_id, c.departement_id, c.nom.upper())
                for c in ModelClass.objects.all()
            }
```

Remplacer :
```python
            elif model == 'cellules':
```
Par :
```python
            elif model in ('cellules', 'sections'):
```

(le corps de ce bloc `elif`, qui résout `direction`/`departement` et
construit `cle_doublon`, reste identique — il utilise déjà `ModelClass`
générique de façon implicite via les variables `direction`/`departement`
locales, pas de référence en dur à `Cellule`.)

- [ ] **Step 3: Template `sections`**

Dans `ReferentielImportTemplateView.TEMPLATES`, juste après l'entrée
`'cellules'` :

```python
        'sections': {
            'headers': ['nom', 'code', 'direction', 'departement', 'description'],
            'example': ['Section Contrôle Qualité', 'SCQ', '', 'DAP', ''],
        },
```

- [ ] **Step 4: Écrire les tests**

Ajouter à `backend/tests/test_section_referentiel.py` :

```python
class TestSectionImport:
    def test_import_section_attached_to_direction(self, admin_user, direction):
        import io
        client = auth_client(admin_user)
        csv_content = "nom;code;direction;departement;description\nSection Import;SIMP;{};;\n".format(direction.nom)
        file = io.BytesIO(csv_content.encode("utf-8"))
        file.name = "sections.csv"
        resp = client.post(
            "/api/ref/import/sections/",
            {"file": file},
            format="multipart",
        )
        assert resp.status_code == 200, resp.data
        assert resp.data["nb_crees"] == 1
        assert Section.objects.filter(nom="Section Import", direction=direction).exists()

    def test_import_template_sections(self, admin_user):
        client = auth_client(admin_user)
        resp = client.get("/api/ref/import/sections/template/")
        assert resp.status_code == 200
```

- [ ] **Step 5: Lancer les tests**

Run: `./venv/Scripts/python.exe -m pytest tests/test_section_referentiel.py -v --no-cov`
Expected: tous PASS (5 du Task 4 + 2 nouveaux = 7).

- [ ] **Step 6: Lancer la suite complète backend**

Run: `./venv/Scripts/python.exe -m pytest --no-cov -q`
Expected: tous les tests passent.

- [ ] **Step 7: Commit**

```bash
git add backend/employees/import_views.py backend/tests/test_section_referentiel.py
git commit -m "feat(employees): import CSV/xlsx du référentiel Section"
```

---

### Task 7: Frontend — onglet "Sections" dans `Parametres.jsx`

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`

**Interfaces:**
- Consumes: `/ref/sections/`, `/ref/import/sections/`, `/api/ref/bulk-delete/sections/` (Tasks 4/6), state `directions`/`departements` déjà chargés dans `Parametres.jsx` pour les autres onglets.

- [ ] **Step 1: Onglet + colonnes d'import**

Dans `TABS` (ligne ~357-368), ajouter après `cellules` :

```javascript
  { key: "sections", label: "Sections" },
```

Dans `REF_COLUMNS_INFO` (ligne ~381-398), ajouter après `cellules` :

```javascript
  sections: {
    obligatoires: ["nom"],
    optionnelles: ["code", "direction", "departement", "description"],
    note: 'Au moins une des deux colonnes "direction" ou "departement" doit être remplie par ligne. Si "departement" est rempli, "direction" devient facultative et sert seulement à lever l\'ambiguïté si plusieurs départements portent ce nom.',
  },
```

- [ ] **Step 2: Colonnes du tableau (`RefTable`)**

Après le `case "cellules":` existant (celui qui retourne le tableau de
colonnes, ligne ~881-920 — se termine juste avant `case "postes":`),
ajouter :

```javascript
      case "sections":
        return [
          { key: "nom", label: "Nom", bold: true },
          { key: "code", label: "Code", mono: true, primary: true },
          {
            key: "rattachement",
            label: "Rattachée à",
            sortable: false,
            render: (i) =>
              i.direction_nom
                ? `Direction : ${i.direction_nom}`
                : `Département : ${i.departement_nom}`,
          },
          {
            key: "nb_employes",
            label: "Employés",
            render: (i) => (
              <Badge count={i.nb_employes} color={theme.primary} />
            ),
          },
          {
            key: "is_active",
            label: "Statut",
            render: (i) => (
              <span
                style={{
                  background: i.is_active ? theme.primaryBg : theme.dangerBg,
                  color: i.is_active ? theme.primary : theme.danger,
                  border: `1px solid ${i.is_active ? theme.primaryBorder : theme.dangerBorder}`,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {i.is_active ? "Actif" : "Inactif"}
              </span>
            ),
          },
        ];
```

- [ ] **Step 3: Formulaire d'ajout/édition**

Après le `case "cellules": { ... }` du formulaire (ligne ~1344-1442, se
termine juste avant `case "postes":`), ajouter :

```javascript
      case "sections": {
        const rattachement = form.departement ? "departement" : "direction";
        return (
          <>
            <label style={labelStyle}>
              Rattachée à <span style={{ color: theme.danger }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={rattachement === "direction"}
                  onChange={() => setForm({ ...form, direction: form.direction || "", departement: "" })}
                />
                Une Direction
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={rattachement === "departement"}
                  onChange={() => setForm({ ...form, departement: form.departement || "", direction: "" })}
                />
                Un Département
              </label>
            </div>
            {rattachement === "direction" ? (
              <select
                name="direction"
                value={form.direction || ""}
                onChange={handleChange}
                className="input-focus" style={inputStyle}
              >
                <option value="">-- Sélectionner une Direction --</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom}
                  </option>
                ))}
              </select>
            ) : (
              <select
                name="departement"
                value={form.departement || ""}
                onChange={handleChange}
                className="input-focus" style={inputStyle}
              >
                <option value="">-- Sélectionner un Département --</option>
                {departements.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom} ({d.direction_nom})
                  </option>
                ))}
              </select>
            )}
            <label style={labelStyle}>
              Nom <span style={{ color: theme.danger }}>*</span>
            </label>
            <input
              name="nom"
              value={form.nom || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="Section Contrôle Qualité"
            />
            <label style={labelStyle}>Code</label>
            <input
              name="code"
              value={form.code || ""}
              onChange={handleChange}
              className="input-focus" style={inputStyle}
              placeholder="SCQ"
            />
            <label style={labelStyle}>Description</label>
            <textarea
              name="description"
              value={form.description || ""}
              onChange={handleChange}
              className="input-focus" style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
            />
            <label style={labelStyle}>Statut</label>
            <select
              name="is_active"
              value={form.is_active ?? true}
              onChange={(e) =>
                setForm({ ...form, is_active: e.target.value === "true" })
              }
              className="input-focus" style={inputStyle}
            >
              <option value="true">Actif</option>
              <option value="false">Inactif</option>
            </select>
          </>
        );
      }
```

- [ ] **Step 4: Test manuel**

Démarrer `npm start` (frontend) + backend, aller sur `/parametres` →
onglet "Sections", créer une Section rattachée à une Direction puis une
autre rattachée à un Département, vérifier la colonne "Rattachée à",
tester Template/Import/suppression en masse/tri.

- [ ] **Step 5: Vérifier lint + parse**

Run: `cd frontend && node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/Parametres.jsx','utf8'), {presets:['@babel/preset-react'], filename:'Parametres.jsx'}); console.log('PARSE OK')"`
Expected: `PARSE OK`

Run: `CI=true npx eslint src/pages/Parametres.jsx`
Expected: aucune sortie (pas d'erreur).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Parametres.jsx
git commit -m "feat(parametres): onglet Sections (clone de Cellules)"
```

---

### Task 8: Frontend — `Section` dans `EmployeeForm.jsx`

**Files:**
- Modify: `frontend/src/pages/EmployeeForm.jsx`

**Interfaces:**
- Consumes: `/ref/sections/` (Task 4).

- [ ] **Step 1: État + chargement**

Ligne ~132 (état initial `form`), ajouter après `cellule: "",` :
```javascript
    section: "",
```

Ligne ~149 (états référentiels), ajouter après `const [cellules, setCellules] = useState([]);` :
```javascript
  const [sections, setSections] = useState([]);
```

Dans `fetchReferentiels` (ligne ~167-192), ajouter `/ref/sections/` à la
liste des appels parallèles et son state :

```javascript
      const [dir, dept, srv, cel, sec, pos, tc, cat, champs] = await Promise.all([
        api.get("/ref/directions/"),
        api.get("/ref/departements/"),
        api.get("/ref/services/"),
        api.get("/ref/cellules/"),
        api.get("/ref/sections/"),
        api.get("/ref/postes/"),
        api.get("/ref/types-contrat/"),
        api.get("/ref/categories/"),
        api.get("/ref/champs-personnalises/"),
      ]);
      setDirections(dir.data.results || dir.data);
      setDepartements(dept.data.results || dept.data);
      setServices(srv.data.results || srv.data);
      setCellules(cel.data.results || cel.data);
      setSections(sec.data.results || sec.data);
      setPostes(pos.data.results || pos.data);
```

- [ ] **Step 2: `fetchEmployee`/`originalAffectation`**

Dans `newForm` (ligne ~198-213), ajouter après `cellule: emp.cellule || "",` :
```javascript
        section: emp.section || "",
```

Dans `setOriginalAffectation` (ligne ~215-220), ajouter après `cellule: newForm.cellule,` :
```javascript
        section: newForm.section,
```

- [ ] **Step 3: `handleDirectionChange`/`handleDepartementChange`**

Remplacer :
```javascript
  const handleDirectionChange = (e) => {
    const dirId = e.target.value;
    setForm({
      ...form,
      direction: dirId,
      departement: "",
      service: "",
      cellule: "",
    });
    setDepartementsFiltres(departements.filter((d) => d.direction === dirId));
    setServicesFiltres([]);
  };

  const handleDepartementChange = (e) => {
    const deptId = e.target.value;
    setForm({ ...form, departement: deptId, service: "", cellule: "" });
    setServicesFiltres(services.filter((s) => s.departement === deptId));
  };
```
Par :
```javascript
  const handleDirectionChange = (e) => {
    const dirId = e.target.value;
    setForm({
      ...form,
      direction: dirId,
      departement: "",
      service: "",
      cellule: "",
      section: "",
    });
    setDepartementsFiltres(departements.filter((d) => d.direction === dirId));
    setServicesFiltres([]);
  };

  const handleDepartementChange = (e) => {
    const deptId = e.target.value;
    setForm({ ...form, departement: deptId, service: "", cellule: "", section: "" });
    setServicesFiltres(services.filter((s) => s.departement === deptId));
  };
```

- [ ] **Step 4: `affectationLabel` + `handleSubmit` changedFields**

Remplacer :
```javascript
    const listByField = {
      direction: directions,
      departement: departements,
      service: services,
      cellule: cellules,
    };
```
Par :
```javascript
    const listByField = {
      direction: directions,
      departement: departements,
      service: services,
      cellule: cellules,
      section: sections,
    };
```

Remplacer :
```javascript
      const changedFields = [
        "direction",
        "departement",
        "service",
        "cellule",
      ].filter(
```
Par :
```javascript
      const changedFields = [
        "direction",
        "departement",
        "service",
        "cellule",
        "section",
      ].filter(
```

- [ ] **Step 5: Champ `<select>` "Section" dans le JSX**

Juste après le bloc `<Field label="Cellule (alternative au Service)">
...</Field>` (ligne ~688-712), ajouter :

```javascript
              <Field label="Section (alternative au Service)">
                <Select
                  name="section"
                  value={form.section || ""}
                  onChange={(e) =>
                    setForm({ ...form, section: e.target.value, service: "", cellule: "" })
                  }
                  disabled={!form.direction}
                >
                  <option value="">-- Aucune --</option>
                  {sections
                    .filter(
                      (s) =>
                        s.is_active &&
                        (form.departement
                          ? s.departement === form.departement
                          : s.direction === form.direction),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                </Select>
              </Field>
```

Et modifier le `<Field label="Cellule (alternative au Service)">` existant
pour qu'il vide aussi `section` à la sélection (cohérence de
l'exclusivité) :

```javascript
              <Field label="Cellule (alternative au Service)">
                <Select
                  name="cellule"
                  value={form.cellule || ""}
                  onChange={(e) =>
                    setForm({ ...form, cellule: e.target.value, service: "", section: "" })
                  }
```

(seule la ligne `onChange` change — le reste du bloc Cellule existant est
inchangé.)

- [ ] **Step 6: Test manuel**

`/employees/nouveau` puis `/employees/:id/modifier` : sélectionner une
Direction, vérifier que "Section" se filtre comme "Cellule" ; choisir une
Section, vérifier que Service et Cellule se vident ; sauvegarder,
recharger la fiche employé, vérifier la persistance. Éditer un employé
déjà en Section et changer sa Direction : vérifier la modale de
confirmation de transfert liste bien "Section" si elle change.

- [ ] **Step 7: Vérifier lint + parse**

Run: `cd frontend && node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/EmployeeForm.jsx','utf8'), {presets:['@babel/preset-react'], filename:'EmployeeForm.jsx'}); console.log('PARSE OK')"`
Expected: `PARSE OK`

Run: `CI=true npx eslint src/pages/EmployeeForm.jsx`
Expected: aucune sortie.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/EmployeeForm.jsx
git commit -m "feat(employee-form): champ Section (alternative au Service, clone de Cellule)"
```

---

### Task 9: Frontend — cartes Section dans `Employees.jsx` (drill-down)

**Files:**
- Modify: `frontend/src/pages/Employees.jsx`

**Interfaces:**
- Consumes: `/ref/sections/` (Task 4), `?section=<id>` (Task 5).

- [ ] **Step 1: Icône `IconSection`**

Après `IconCellule` (ligne ~85-101), ajouter une icône distincte (motif
"couches") :

```javascript
const IconSection = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
```

- [ ] **Step 2: État + chargement**

Après `const [cellulesDirection, setCellulesDirection] = useState([]);`
(ligne ~539) et son équivalent département (ligne ~541), ajouter :

```javascript
  const [sectionsDirection, setSectionsDirection] = useState([]);
  const [sectionsDepartement, setSectionsDepartement] = useState([]);
```

Dans le premier `useEffect` (déclenché par `selectedDirection`, lignes
~691-719), ajouter `/ref/sections/` à `Promise.all` :

```javascript
        const [deptRes, poleRes, celRes, secRes] = await Promise.all([
          api.get("/ref/departements/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/poles/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/cellules/", {
            params: { direction: selectedDirection.id },
          }),
          api.get("/ref/sections/", {
            params: { direction: selectedDirection.id },
          }),
        ]);
        setDepartements(deptRes.data.results || deptRes.data);
        setPoles(poleRes.data.results || poleRes.data);
        setCellulesDirection(celRes.data.results || celRes.data);
        setSectionsDirection(secRes.data.results || secRes.data);
      } catch {
        setDepartements([]);
        setPoles([]);
        setCellulesDirection([]);
        setSectionsDirection([]);
```

Dans le `useEffect` déclenché par `selectedDepartement` (lignes ~739-762),
même ajout :

```javascript
        const [srvRes, celRes, secRes] = await Promise.all([
          api.get("/ref/services/", {
            params: { departement: selectedDepartement.id },
          }),
          api.get("/ref/cellules/", {
            params: { departement: selectedDepartement.id },
          }),
          api.get("/ref/sections/", {
            params: { departement: selectedDepartement.id },
          }),
        ]);
        setServices(srvRes.data.results || srvRes.data);
        setCellulesDepartement(celRes.data.results || celRes.data);
        setSectionsDepartement(secRes.data.results || secRes.data);
      } catch {
        setServices([]);
        setCellulesDepartement([]);
        setSectionsDepartement([]);
```

- [ ] **Step 3: Arrivée depuis l'Organigramme (`?section=<id>`)**

Dans le `useEffect` de lecture des `searchParams` (lignes ~833-865),
ajouter `sectionId` :

```javascript
    const celluleId = searchParams.get("cellule");
    const sectionId = searchParams.get("section");
    if (!directionId && !departementId && !serviceId && !poleId && !celluleId && !sectionId)
      return;
    (async () => {
      try {
        if (serviceId) {
          const res = await api.get(`/ref/services/${serviceId}/`);
          setSelectedService(res.data);
        } else if (celluleId) {
          const res = await api.get(`/ref/cellules/${celluleId}/`);
          setOrgFilter({ type: "cellule", id: celluleId, nom: res.data.nom });
        } else if (sectionId) {
          const res = await api.get(`/ref/sections/${sectionId}/`);
          setOrgFilter({ type: "section", id: sectionId, nom: res.data.nom });
        } else if (departementId) {
```

- [ ] **Step 4: `selectSection` + breadcrumb + bannière filtre**

Après `selectCellule` (ligne ~905-910), ajouter :

```javascript
  const selectSection = (section) => {
    setOrgFilter({ type: "section", id: section.id, nom: section.nom });
    setView("employees");
    setPage(1);
    setHierarchyKey((k) => k + 1);
  };
```

Ligne ~1046 (breadcrumb) — remplacer :
```javascript
    ...(orgFilter?.type === "cellule"
      ? [{ label: orgFilter.nom, onClick: null }]
      : []),
```
Par :
```javascript
    ...(orgFilter && (orgFilter.type === "cellule" || orgFilter.type === "section")
      ? [{ label: orgFilter.nom, onClick: null }]
      : []),
```

Ligne ~1378 (bannière filtre) — remplacer :
```javascript
            Filtré par {orgFilter.type === "pole" ? "pôle" : "cellule"} :{" "}
```
Par :
```javascript
            Filtré par {orgFilter.type === "pole" ? "pôle" : orgFilter.type === "section" ? "section" : "cellule"} :{" "}
```

- [ ] **Step 5: `TYPE_META` + `configs`**

Après l'entrée `cellule:` de `TYPE_META` (ligne ~1132-1140), ajouter :

```javascript
      section: {
        color: "#0369a1",
        gradient:
          "linear-gradient(135deg, #082f49 0%, #0369a1 60%, #0ea5e9 100%)",
        icon: <IconSection size={28} />,
        countLabel: "employé(s)",
        countKey: "nb_employes",
        onSelect: selectSection,
      },
```

Dans `configs.directions.items` (ligne ~1148-1161), ajouter le comptage
sections au badge composé :

```javascript
          const parts = [];
          if (d.nb_departements) parts.push(`${d.nb_departements} départ.`);
          if (d.nb_poles) parts.push(`${d.nb_poles} pôle(s)`);
          if (d.nb_cellules) parts.push(`${d.nb_cellules} cellule(s)`);
          if (d.nb_sections) parts.push(`${d.nb_sections} section(s)`);
```

(`d.nb_sections` nécessite que `DirectionSerializer` l'expose — voir
Step 6 ci-dessous.)

Dans `configs.departements` (branche `else`, lignes ~1173-1185), ajouter
les items sections :

```javascript
            items: [
              ...poles.map((p) => ({ ...p, __type: "pole" })),
              ...departements
                .filter((d) => !d.pole)
                .map((d) => ({ ...d, __type: "departement" })),
              ...cellulesDirection.map((c) => ({ ...c, __type: "cellule" })),
              ...sectionsDirection.map((s) => ({ ...s, __type: "section" })),
            ],
```

Dans `configs.services` (lignes ~1186-1194) :

```javascript
        items: [
          ...services.map((s) => ({ ...s, __type: "service" })),
          ...cellulesDepartement.map((c) => ({ ...c, __type: "cellule" })),
          ...sectionsDepartement.map((s) => ({ ...s, __type: "section" })),
        ],
```

- [ ] **Step 6: `nb_sections` sur `DirectionSerializer` (backend)**

Dans `backend/employees/referentiel_views.py`, `DirectionSerializer`
(ligne ~100-117, celui qui a déjà `nb_cellules`) — ajouter :

```python
    nb_sections = serializers.SerializerMethodField()
```

Dans `Meta.fields`, ajouter `'nb_sections'` après `'nb_cellules'`.

```python
    def get_nb_sections(self, obj):
        return obj.sections.filter(is_active=True).count()
```

(`obj.sections` fonctionne car `Section.direction` a
`related_name='sections'`, comme `Cellule.direction` a
`related_name='cellules'`.)

Ajouter un test dans `backend/tests/test_section_referentiel.py` :

```python
def test_direction_serializer_exposes_nb_sections(admin_user, direction):
    from employees.models import Section
    Section.objects.create(nom="Section A", direction=direction)
    client = auth_client(admin_user)
    resp = client.get("/api/ref/directions/")
    results = resp.data.get("results", resp.data)
    row = next(d for d in results if d["id"] == str(direction.id))
    assert row["nb_sections"] == 1
```

- [ ] **Step 7: Lancer le test backend**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest tests/test_section_referentiel.py -v --no-cov`
Expected: `8 passed` (7 précédents + 1 nouveau).

- [ ] **Step 8: Test manuel frontend**

`/employees` : vérifier que les cartes Section apparaissent au niveau
Direction (rattachement direct) et Département, avec badge nb_employes,
navigation vers la liste employés filtrée, retour arrière via breadcrumb.

- [ ] **Step 9: Vérifier lint + parse**

Run: `cd frontend && node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/Employees.jsx','utf8'), {presets:['@babel/preset-react'], filename:'Employees.jsx'}); console.log('PARSE OK')"`
Expected: `PARSE OK`

Run: `CI=true npx eslint src/pages/Employees.jsx`
Expected: aucune sortie.

- [ ] **Step 10: Commit**

```bash
git add backend/employees/referentiel_views.py backend/tests/test_section_referentiel.py frontend/src/pages/Employees.jsx
git commit -m "feat(employees): cartes Section dans le drill-down /employees"
```

---

### Task 10: Frontend — `Section` dans `Organigramme.jsx`

**Files:**
- Modify: `frontend/src/pages/Organigramme.jsx`

**Interfaces:**
- Consumes: `/ref/sections/`, `/ref/sections/?all=1` (Task 4).

- [ ] **Step 1: `LEVEL`/`CHILD_LABEL`**

Après l'entrée `cellule:` de `LEVEL` (ligne ~34-39), ajouter :

```javascript
  section: {
    label: "Section",
    color: "#0369a1",
    bg: "#F0F9FF",
    border: "#BAE6FD",
  },
```

Mettre à jour `CHILD_LABEL` (ligne ~42-46) :

```javascript
const CHILD_LABEL = {
  direction: "département/pôle/cellule/section",
  pole: "département(s)",
  departement: "service/cellule/section",
};
```

- [ ] **Step 2: État + chargement**

Après `const [cellules, setCellules] = useState([]);` (ligne ~175),
ajouter :

```javascript
  const [sections, setSections] = useState([]);
  const [accessibleSecIds, setAccessibleSecIds] = useState(null);
```

(placer `accessibleSecIds` juste après `accessibleCelIds`, ligne ~180.)

Dans le `useEffect` de chargement (lignes ~205-239), étendre le
`Promise.all` :

```javascript
        const [dir, pol, dept, srv, cel, sec, scopedDir, scopedPol, scopedDept, scopedSrv, scopedCel, scopedSec] = await Promise.all([
          fetchAllPages("/ref/directions/?all=1"),
          fetchAllPages("/ref/poles/?all=1"),
          fetchAllPages("/ref/departements/?all=1"),
          fetchAllPages("/ref/services/?all=1"),
          fetchAllPages("/ref/cellules/?all=1"),
          fetchAllPages("/ref/sections/?all=1"),
          fetchAllPages("/ref/directions/"),
          fetchAllPages("/ref/poles/"),
          fetchAllPages("/ref/departements/"),
          fetchAllPages("/ref/services/"),
          fetchAllPages("/ref/cellules/"),
          fetchAllPages("/ref/sections/"),
        ]);
        setDirections(dir.filter((d) => d.is_active));
        setPoles(pol.filter((p) => p.is_active));
        setDepartements(dept.filter((d) => d.is_active));
        setServices(srv.filter((s) => s.is_active));
        setCellules(cel.filter((c) => c.is_active));
        setSections(sec.filter((s) => s.is_active));
        setAccessibleDirIds(new Set(scopedDir.map((d) => d.id)));
        setAccessiblePoleIds(new Set(scopedPol.map((p) => p.id)));
        setAccessibleDeptIds(new Set(scopedDept.map((d) => d.id)));
        setAccessibleSvcIds(new Set(scopedSrv.map((s) => s.id)));
        setAccessibleCelIds(new Set(scopedCel.map((c) => c.id)));
        setAccessibleSecIds(new Set(scopedSec.map((s) => s.id)));
```

- [ ] **Step 3: `childrenOf`/`isAccessible`/`navigateTo`**

Remplacer :
```javascript
  const childrenOf = (node, level) => {
    if (level === "direction") {
      return [
        ...poles.filter((p) => p.direction === node.id).map((p) => ({ ...p, level: "pole" })),
        ...departements
          .filter((d) => d.direction === node.id && !d.pole)
          .map((d) => ({ ...d, level: "departement" })),
        ...cellules.filter((c) => c.direction === node.id).map((c) => ({ ...c, level: "cellule" })),
      ];
    }
    if (level === "pole") {
      return departements.filter((d) => d.pole === node.id).map((d) => ({ ...d, level: "departement" }));
    }
    if (level === "departement") {
      return [
        ...services.filter((s) => s.departement === node.id).map((s) => ({ ...s, level: "service" })),
        ...cellules.filter((c) => c.departement === node.id).map((c) => ({ ...c, level: "cellule" })),
      ];
    }
    return [];
  };
```
Par :
```javascript
  const childrenOf = (node, level) => {
    if (level === "direction") {
      return [
        ...poles.filter((p) => p.direction === node.id).map((p) => ({ ...p, level: "pole" })),
        ...departements
          .filter((d) => d.direction === node.id && !d.pole)
          .map((d) => ({ ...d, level: "departement" })),
        ...cellules.filter((c) => c.direction === node.id).map((c) => ({ ...c, level: "cellule" })),
        ...sections.filter((s) => s.direction === node.id).map((s) => ({ ...s, level: "section" })),
      ];
    }
    if (level === "pole") {
      return departements.filter((d) => d.pole === node.id).map((d) => ({ ...d, level: "departement" }));
    }
    if (level === "departement") {
      return [
        ...services.filter((s) => s.departement === node.id).map((s) => ({ ...s, level: "service" })),
        ...cellules.filter((c) => c.departement === node.id).map((c) => ({ ...c, level: "cellule" })),
        ...sections.filter((s) => s.departement === node.id).map((s) => ({ ...s, level: "section" })),
      ];
    }
    return [];
  };
```

Remplacer :
```javascript
  const isAccessible = (node, level) => {
    if (!accessibleDirIds) return true; // pas encore chargé — pas de flash grisé
    if (level === "direction") return accessibleDirIds.has(node.id);
    if (level === "pole") return accessiblePoleIds.has(node.id);
    if (level === "departement") return accessibleDeptIds.has(node.id);
    if (level === "service") return accessibleSvcIds.has(node.id);
    if (level === "cellule") return accessibleCelIds.has(node.id);
    return true;
  };
```
Par :
```javascript
  const isAccessible = (node, level) => {
    if (!accessibleDirIds) return true; // pas encore chargé — pas de flash grisé
    if (level === "direction") return accessibleDirIds.has(node.id);
    if (level === "pole") return accessiblePoleIds.has(node.id);
    if (level === "departement") return accessibleDeptIds.has(node.id);
    if (level === "service") return accessibleSvcIds.has(node.id);
    if (level === "cellule") return accessibleCelIds.has(node.id);
    if (level === "section") return accessibleSecIds.has(node.id);
    return true;
  };
```

Remplacer :
```javascript
  const navigateTo = (node, level) => {
    const paramByLevel = {
      direction: "direction",
      pole: "pole",
      departement: "departement",
      service: "service",
      cellule: "cellule",
    };
    navigate(`/employees?${paramByLevel[level]}=${node.id}`);
  };
```
Par :
```javascript
  const navigateTo = (node, level) => {
    const paramByLevel = {
      direction: "direction",
      pole: "pole",
      departement: "departement",
      service: "service",
      cellule: "cellule",
      section: "section",
    };
    navigate(`/employees?${paramByLevel[level]}=${node.id}`);
  };
```

- [ ] **Step 4: Test manuel**

`/organigramme` : vérifier que les Sections apparaissent dans l'arbre
(sous Direction et sous Département), que le clic sur la flèche navigue
vers `/employees?section=<id>` et affiche bien la liste filtrée (Task 5),
et que le grisage hors périmètre fonctionne pour un compte CONSULTANT
scopé.

- [ ] **Step 5: Vérifier lint + parse**

Run: `cd frontend && node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/Organigramme.jsx','utf8'), {presets:['@babel/preset-react'], filename:'Organigramme.jsx'}); console.log('PARSE OK')"`
Expected: `PARSE OK`

Run: `CI=true npx eslint src/pages/Organigramme.jsx`
Expected: aucune sortie.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Organigramme.jsx
git commit -m "feat(organigramme): intègre Section dans l'arbre de navigation"
```

---

### Task 11: Frontend — périmètre "Sections" dans `Users.jsx` + libellé transfert dans `AuditLogs.jsx`

**Files:**
- Modify: `frontend/src/pages/Users.jsx`
- Modify: `frontend/src/pages/AuditLogs.jsx`

**Interfaces:**
- Consumes: `/ref/sections/?all=1` (Task 4), `User.scope_sections` (Task 2), `UserSerializer.scope_sections`/`scope_sections_nom` (voir Step 4 ci-dessous, backend).

- [ ] **Step 1: État + chargement + `scopeForm`**

Ligne ~98 (après `const [cellules, setCellules] = useState([]);`),
ajouter :
```javascript
  const [sections, setSections] = useState([]);
```

Ligne ~100 (`scopeForm` initial), remplacer :
```javascript
  const [scopeForm, setScopeForm] = useState({ directions: [], poles: [], departements: [], services: [], cellules: [], types_documents: [] });
```
Par :
```javascript
  const [scopeForm, setScopeForm] = useState({ directions: [], poles: [], departements: [], services: [], cellules: [], sections: [], types_documents: [] });
```

**Piège** : cette même ligne apparaît **trois fois** dans le fichier
(état initial, et deux réinitialisations lors de la fermeture/soumission
du formulaire de création — repérées précédemment aux lignes ~465 et
~570). Les trois occurrences doivent être mises à jour identiquement.

Après `api.get("/ref/cellules/?all=1")...` (ligne ~120), ajouter :
```javascript
    api.get("/ref/sections/?all=1").then((res) => setSections(res.data.results || res.data)).catch(() => {});
```

Dans `openScopeModal` (ligne ~133, `cellules: u.scope_cellules || [],`),
ajouter :
```javascript
      sections: u.scope_sections || [],
```

- [ ] **Step 2: `visibleSections` + `toggleSection`**

Après la définition de `visibleCellules` (ligne ~190-196), ajouter (même
logique OR que Cellule — une Section est rattachée à une Direction OU un
Département, filtrage non exclusif) :

```javascript
  const visibleSections =
    scopeForm.directions.length === 0 && scopeForm.departements.length === 0
      ? sections
      : sections.filter((s) =>
          (s.direction && scopeForm.directions.includes(s.direction)) ||
          (s.departement && scopeForm.departements.includes(s.departement))
        );
```

Après `toggleCellule` (ligne ~254-259), ajouter :

```javascript
  const toggleSection = (id) => {
    setScopeForm((prev) => {
      const next = prev.sections.includes(id) ? prev.sections.filter((x) => x !== id) : [...prev.sections, id];
      return { ...prev, sections: next };
    });
  };
```

Dans `toggleDirection` (lignes ~198-225), ajouter le nettoyage de
`sections` à la cascade (même bloc que `nextCellules`) :

```javascript
      const nextSections = prev.sections.filter((secId) => {
        const sec = sections.find((s) => s.id === secId);
        if (!sec) return false;
        if (sec.departement) return stillVisibleDeps.includes(sec.departement);
        return nextDirections.length === 0 || nextDirections.includes(sec.direction);
      });
      return { ...prev, directions: nextDirections, poles: nextPoles, departements: nextDepartements, services: nextServices, cellules: nextCellules, sections: nextSections };
```

(remplace la ligne `return { ...prev, directions: nextDirections, ..., cellules: nextCellules };` existante — ajouter `nextSections` juste avant, et `sections: nextSections` dans le `return`.)

- [ ] **Step 3: Payload de sauvegarde/création + liste des niveaux affichés**

Dans `handleSaveScope` (payload `api.patch`, ligne ~317) et dans
`handleSubmit` (payload de création, ligne ~458), ajouter après
`scope_cellules: scopeForm.cellules,` :
```javascript
          scope_sections: scopeForm.sections,
```

Dans les deux tableaux de niveaux affichés (lignes ~702 et ~1236),
ajouter après l'entrée `cellules` :
```javascript
                    { level: "sections", label: "Sections", items: visibleSections, onToggle: toggleSection },
```

(indentation à ajuster selon le bloc — 20 espaces pour la ligne ~702,
22 pour la ligne ~1236, cohérent avec les lignes `cellules` voisines de
chaque bloc.)

- [ ] **Step 4: Backend — `UserSerializer.scope_sections`/`scope_sections_nom`**

Dans `backend/accounts/admin_views.py`, `UserSerializer` :

```python
    scope_sections_nom = serializers.SerializerMethodField()

    def get_scope_sections_nom(self, obj):
        return list(obj.scope_sections.values_list('nom', flat=True))
```

Dans `Meta.fields`, ajouter après `'scope_cellules', 'scope_cellules_nom',` (chercher la ligne exacte — mêmes noms de champs M2M déjà exposés pour les autres niveaux) :
```python
            'scope_sections', 'scope_sections_nom',
```

- [ ] **Step 5: Badge périmètre dans la colonne "Périmètre" de `/users`**

Dans `Users.jsx`, le bloc qui calcule `celNoms`/affiche les pills de
périmètre (ligne ~876-908, déjà modifié dans un chantier précédent pour
`employee_grants_count`), ajouter :

```javascript
                        const secNoms = u.scope_sections_nom || [];
```

(juste après `const celNoms = u.scope_cellules_nom || [];`), et dans la
condition "aucun périmètre" ainsi que le rendu des pills, ajouter
`secNoms` de la même façon que `celNoms` — chercher la ligne
`if (dirNoms.length === 0 && ... && celNoms.length === 0 && grantsCount === 0)`
et y ajouter `&& secNoms.length === 0`, puis après le pill
`{celNoms.length > 0 && scopePill("Cellules", celNoms.length, celNoms, "#b45309")}`
ajouter :
```javascript
                            {secNoms.length > 0 && scopePill("Sections", secNoms.length, secNoms, "#0369a1")}
```

- [ ] **Step 6: Libellé transfert dans `AuditLogs.jsx`**

Dans `backend/employees/views.py`, `TRANSFER_FIELDS` inclut déjà
`'section'` (Task 5). Dans `frontend/src/pages/AuditLogs.jsx`,
`TRANSFER_FIELD_LABELS` (ligne ~26-31), ajouter :

```javascript
  section: "Section",
```

- [ ] **Step 7: Test manuel**

`/users` → "Périmètre" sur un compte CONSULTANT : cocher une Section,
enregistrer, rouvrir la modale et vérifier la persistance. Vérifier le
badge "Sections" dans la colonne Périmètre de la liste. Transférer un
employé d'une Section à une autre via `/employees/:id/modifier` et
vérifier l'entrée d'audit dans `/audit`.

- [ ] **Step 8: Vérifier lint + parse (Users.jsx et AuditLogs.jsx)**

Run: `cd frontend && node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/Users.jsx','utf8'), {presets:['@babel/preset-react'], filename:'Users.jsx'}); console.log('PARSE OK')"`
Run: `node -e "require('@babel/core').parse(require('fs').readFileSync('src/pages/AuditLogs.jsx','utf8'), {presets:['@babel/preset-react'], filename:'AuditLogs.jsx'}); console.log('PARSE OK')"`
Expected: `PARSE OK` pour les deux.

Run: `CI=true npx eslint src/pages/Users.jsx src/pages/AuditLogs.jsx`
Expected: aucune sortie.

- [ ] **Step 9: Lancer la suite complète backend une dernière fois**

Run: `cd backend && ./venv/Scripts/python.exe -m pytest --no-cov -q`
Expected: tous les tests passent, aucune régression.

- [ ] **Step 10: Commit**

```bash
git add backend/accounts/admin_views.py frontend/src/pages/Users.jsx frontend/src/pages/AuditLogs.jsx
git commit -m "feat(users): périmètre par Section dans la modale + badge liste + libellé transfert"
```

---

### Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** aucune (documentation seule).

- [ ] **Step 1: Section dans `CLAUDE.md`**

Ajouter une nouvelle sous-section après "### Périmètre ponctuel —
employés spécifiques (2026-08-30)" (ou à un endroit cohérent proche de la
description de la hiérarchie des données) :

```markdown
### Référentiel "Section" (2026-08-30)

En plus de `Cellule`, un nouveau référentiel indépendant `Section` existe
— même règle de rattachement : exactement une Direction OU un Département
(jamais un Service, jamais les deux), avec ses propres employés
(`Employee.section`). **Coexiste** avec `Cellule` (les deux référentiels
sont indépendants, un Département peut avoir des Cellules ET des
Sections) — pas de fusion, pas de migration de données.

- `Employee` : `service`, `cellule` et `section` sont mutuellement
  exclusifs côté formulaire (`EmployeeForm.jsx`, chaque `<select>` vide
  les deux autres à la sélection) et côté backend
  (`EmployeeCreateUpdateSerializer.validate()` aligne
  direction/departement sur la Cellule ou la Section choisie et vide les
  deux autres champs) — pas de contrainte DB stricte (comme
  service/cellule déjà avant ce chantier).
- Scoping : `User.scope_sections` (M2M), `accessible_sections_qs()`,
  intégré dans `employee_scope_q()`/`can_access_employee()`/
  `accessible_directions_qs()`/`accessible_departements_qs()` exactement
  comme Cellule.
- CRUD : `/ref/sections/`, `/ref/sections/<uuid:pk>/` — onglet "Sections"
  dans `/parametres`, mêmes fonctionnalités que "Cellules" (import
  CSV/xlsx, suppression en masse, tri).
- `/employees` (drill-down) et `/organigramme` : cartes/nœuds Section au
  même niveau que Cellule (sous Direction ou Département).
- `/users` (modale Périmètre) : section "Sections" dans la cascade
  organisationnelle, même pattern Tout/Aucun/OR (Direction OU Département)
  que Cellule.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente le référentiel Section"
```

## Self-Review

**Spec coverage** : modèle (Task 1), scoping (Task 2), serializers employé
+ exclusivité (Task 3), CRUD référentiel (Task 4), filtre employés +
transferts (Task 5), import (Task 6), `Parametres.jsx` (Task 7),
`EmployeeForm.jsx` (Task 8), `Employees.jsx` (Task 9), `Organigramme.jsx`
(Task 10), `Users.jsx` + `AuditLogs.jsx` (Task 11), documentation
(Task 12) — toutes les sections du spec `2026-08-30-referentiel-section-design.md`
sont couvertes.

**Placeholders** : aucun — chaque étape de code montre le contenu exact
à écrire/remplacer.

**Cohérence des types** : `Section` (modèle), `SectionSerializer`,
`accessible_sections_qs()`, `scope_sections`, `sections`/`setSections`/
`toggleSection`/`visibleSections`, `?section=` (query param), `orgFilter.type
=== "section"`, `TYPE_META.section` — noms identiques et cohérents à
travers toutes les tâches, vérifiés contre les noms déjà en place pour
`Cellule` dans chaque fichier concerné.

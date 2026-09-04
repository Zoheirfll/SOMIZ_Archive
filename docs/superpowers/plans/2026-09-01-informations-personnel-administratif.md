# Division Informations Personnel/Administratif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diviser le panneau "Informations" de la fiche employé en deux colonnes (Personnel / Administratif), avec catégorisation configurable en `/parametres` et un périmètre CONSULTANT indépendant par champ personnel.

**Architecture:** `ChampPersonnalise` (backend/employees/models.py) devient le catalogue unifié de tous les champs (système + personnalisés) via deux nouveaux attributs `is_systeme`/`categorie`. Un nouveau M2M `User.scope_champs_personnels` restreint, par compte CONSULTANT, quels champs `categorie=PERSONNEL` sont visibles. Le frontend affiche deux cards côte à côte sur la fiche employé et une colonne "Catégorie" éditable dans `/parametres`.

**Tech Stack:** Django 4.2 / DRF 3.15 / pytest (backend), React 19 / Jest + RTL (frontend), styles inline + `theme.js`.

## Global Constraints

- Aucune sélection dans `scope_champs_personnels` = accès non restreint (règle constante du projet, aucun compte existant ne doit régresser).
- Les champs système (`is_systeme=True`) restent des colonnes réelles sur `Employee` — cette table ne sert que de registre de métadonnées pour ces lignes, jamais de stockage de valeur (`EmployeeChampValeur`).
- Un champ `is_systeme=True` n'est jamais créable/supprimable/renommable (structure) via l'UI/API — seule sa `categorie` est modifiable.
- Un champ personnel non autorisé pour un CONSULTANT doit être **absent** de la réponse API (pas seulement masqué côté frontend).
- Après toute modification touchant `accounts`/`employees` (permissions, scoping, modèles), lancer la suite complète (`pytest` backend, `npm test` frontend) avant de commit.
- Styles frontend 100% inline avec tokens `theme.js` — jamais de hex en dur.

---

### Task 1: Modèle `ChampPersonnalise` — `is_systeme` + `categorie`

**Files:**
- Modify: `backend/employees/models.py:592-618` (classe `ChampPersonnalise`)
- Create: `backend/employees/migrations/0026_champpersonnalise_categorie_is_systeme.py`
- Test: `backend/tests/test_champ_personnalise_categorie.py`

**Interfaces:**
- Produces: `ChampPersonnalise.Categorie` (TextChoices : `PERSONNEL`, `ADMINISTRATIF`), `ChampPersonnalise.is_systeme` (bool), `ChampPersonnalise.categorie` (str, default `ADMINISTRATIF`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_champ_personnalise_categorie.py
import pytest
from employees.models import ChampPersonnalise


@pytest.mark.django_db
class TestChampPersonnaliseCategorie:
    def test_default_categorie_is_administratif(self):
        c = ChampPersonnalise.objects.create(nom="Permis", code="PERMIS")
        assert c.categorie == ChampPersonnalise.Categorie.ADMINISTRATIF
        assert c.is_systeme is False

    def test_can_create_personnel_categorie(self):
        c = ChampPersonnalise.objects.create(
            nom="Permis", code="PERMIS2", categorie=ChampPersonnalise.Categorie.PERSONNEL
        )
        assert c.categorie == "PERSONNEL"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_champ_personnalise_categorie.py -v`
Expected: FAIL — `AttributeError: 'ChampPersonnalise' object has no attribute 'categorie'` (or similar, field doesn't exist yet).

- [ ] **Step 3: Add the fields to the model**

In `backend/employees/models.py`, inside `class ChampPersonnalise(models.Model):` right after `class TypeChamp(models.TextChoices):` (line 598-602), add:

```python
    class Categorie(models.TextChoices):
        PERSONNEL = 'PERSONNEL', 'Personnel'
        ADMINISTRATIF = 'ADMINISTRATIF', 'Administratif'
```

Then add these two fields right after `type_champ` (after line 610, before `ordre`):

```python
    is_systeme = models.BooleanField(
        default=False,
        verbose_name="Champ système",
        help_text=(
            "True pour les 12 champs structurels de la fiche employé (Matricule, "
            "Direction, Fonction...) — lignes seedées une fois par migration, jamais "
            "créables/supprimables via l'UI. Sert de registre de métadonnées "
            "(catégorie + permission), jamais de stockage de valeur : aucune "
            "EmployeeChampValeur n'est créée pour un champ is_systeme=True."
        ),
    )
    categorie = models.CharField(
        max_length=20, choices=Categorie.choices, default=Categorie.ADMINISTRATIF,
        verbose_name="Catégorie",
        help_text="Colonne d'affichage sur la fiche employé (panneau Informations).",
    )
```

- [ ] **Step 4: Generate and apply the migration**

Run: `cd backend && python manage.py makemigrations employees -n champpersonnalise_categorie_is_systeme`
Expected: creates `backend/employees/migrations/0026_champpersonnalise_categorie_is_systeme.py` adding both fields.

Run: `cd backend && python manage.py migrate employees`
Expected: `Applying employees.0026_champpersonnalise_categorie_is_systeme... OK`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_champ_personnalise_categorie.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/0026_champpersonnalise_categorie_is_systeme.py backend/tests/test_champ_personnalise_categorie.py
git commit -m "feat(champs): ajoute is_systeme et categorie à ChampPersonnalise"
```

---

### Task 2: Migration de données — seed des champs système + catégorie Personnel des 4 champs migrés

**Files:**
- Create: `backend/employees/migrations/0027_seed_champs_systeme.py`
- Test: `backend/tests/test_champ_personnalise_categorie.py` (extend)

**Interfaces:**
- Consumes: `ChampPersonnalise.is_systeme`/`categorie` (Task 1).
- Produces: 19 lignes `ChampPersonnalise` avec `is_systeme=True` (codes ci-dessous), et les 4 champs `RIB`/`NUM_SECU`/`GROUPE_SANGUIN`/`NIN` passés en `categorie=PERSONNEL` s'ils existent.

Codes système à seeder (ordre = index * 10, `nom` = libellé affiché par défaut, `type_champ='texte'` pour toutes — champ non pertinent pour ces lignes registre) :

```python
SYSTEM_FIELDS = [
    ("matricule", "Matricule"),
    ("numero_contrat", "N° Contrat"),
    ("nom", "Nom"),
    ("prenom", "Prénom"),
    ("statut", "Statut"),
    ("direction", "Direction"),
    ("pole", "Pôle"),
    ("departement", "Département"),
    ("section", "Section"),
    ("service", "Service"),
    ("cellule", "Cellule"),
    ("poste", "Fonction"),
    ("type_contrat", "Type de contrat"),
    ("categorie", "Catégorie"),
    ("echelle", "Échelle"),
    ("date_naissance", "Date de naissance"),
    ("date_embauche", "Date de recrutement"),
    ("date_debut_contrat", "Date de début de contrat"),
    ("date_fin_contrat", "Date de fin de contrat"),
]
PERSONNEL_SYSTEM_CODES = {"date_naissance"}
PERSONNEL_CUSTOM_CODES = {"RIB", "NUM_SECU", "GROUPE_SANGUIN", "NIN"}
```

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_champ_personnalise_categorie.py`:

```python
@pytest.mark.django_db
class TestSeedChampsSysteme:
    def test_19_system_fields_seeded(self):
        assert ChampPersonnalise.objects.filter(is_systeme=True).count() == 19

    def test_date_naissance_is_personnel(self):
        c = ChampPersonnalise.objects.get(code="date_naissance")
        assert c.is_systeme is True
        assert c.categorie == "PERSONNEL"

    def test_matricule_is_administratif(self):
        c = ChampPersonnalise.objects.get(code="matricule")
        assert c.categorie == "ADMINISTRATIF"

    def test_rib_is_personnel_if_exists(self):
        # RIB n'existe que si la migration 2026-07-25 (migration des 4 anciens
        # champs) a été appliquée dans cet environnement — vérifie seulement
        # si présent, ne crée jamais la ligne elle-même.
        c = ChampPersonnalise.objects.filter(code="RIB").first()
        if c is not None:
            assert c.categorie == "PERSONNEL"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_champ_personnalise_categorie.py::TestSeedChampsSysteme -v`
Expected: FAIL — `assert 0 == 19`

- [ ] **Step 3: Write the data migration**

```python
# backend/employees/migrations/0027_seed_champs_systeme.py
from django.db import migrations

SYSTEM_FIELDS = [
    ("matricule", "Matricule"),
    ("numero_contrat", "N° Contrat"),
    ("nom", "Nom"),
    ("prenom", "Prénom"),
    ("statut", "Statut"),
    ("direction", "Direction"),
    ("pole", "Pôle"),
    ("departement", "Département"),
    ("section", "Section"),
    ("service", "Service"),
    ("cellule", "Cellule"),
    ("poste", "Fonction"),
    ("type_contrat", "Type de contrat"),
    ("categorie", "Catégorie"),
    ("echelle", "Échelle"),
    ("date_naissance", "Date de naissance"),
    ("date_embauche", "Date de recrutement"),
    ("date_debut_contrat", "Date de début de contrat"),
    ("date_fin_contrat", "Date de fin de contrat"),
]
PERSONNEL_SYSTEM_CODES = {"date_naissance"}
PERSONNEL_CUSTOM_CODES = {"RIB", "NUM_SECU", "GROUPE_SANGUIN", "NIN"}


def seed_forward(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    for idx, (code, nom) in enumerate(SYSTEM_FIELDS):
        ChampPersonnalise.objects.update_or_create(
            code=code,
            defaults={
                'nom': nom,
                'type_champ': 'texte',
                'ordre': idx * 10,
                'is_active': True,
                'is_systeme': True,
                'categorie': 'PERSONNEL' if code in PERSONNEL_SYSTEM_CODES else 'ADMINISTRATIF',
            },
        )
    ChampPersonnalise.objects.filter(code__in=PERSONNEL_CUSTOM_CODES).update(categorie='PERSONNEL')


def seed_backward(apps, schema_editor):
    ChampPersonnalise = apps.get_model('employees', 'ChampPersonnalise')
    ChampPersonnalise.objects.filter(is_systeme=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('employees', '0026_champpersonnalise_categorie_is_systeme'),
    ]
    operations = [
        migrations.RunPython(seed_forward, seed_backward),
    ]
```

- [ ] **Step 4: Apply the migration**

Run: `cd backend && python manage.py migrate employees`
Expected: `Applying employees.0027_seed_champs_systeme... OK`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_champ_personnalise_categorie.py -v`
Expected: PASS (all tests in file)

- [ ] **Step 6: Commit**

```bash
git add backend/employees/migrations/0027_seed_champs_systeme.py backend/tests/test_champ_personnalise_categorie.py
git commit -m "feat(champs): seed les 19 champs système dans ChampPersonnalise"
```

---

### Task 3: Serializer — protéger les lignes `is_systeme`, exposer `categorie`

**Files:**
- Modify: `backend/employees/referentiel_views.py:581-606` (`ChampPersonnaliseSerializer`, `ChampPersonnaliseDetailView`)
- Test: `backend/tests/test_champ_personnalise_endpoint.py`

**Interfaces:**
- Consumes: `ChampPersonnalise.is_systeme`/`categorie` (Task 1/2).
- Produces: `ChampPersonnaliseSerializer` expose `is_systeme` (read-only) + `categorie` (writable, y compris sur une instance `is_systeme=True`) ; toute autre mutation sur une ligne `is_systeme=True` est rejetée (400) ; `DELETE` sur une ligne `is_systeme=True` est bloqué (400).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_champ_personnalise_endpoint.py
import pytest
from rest_framework.test import APIClient
from employees.models import ChampPersonnalise


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestChampPersonnaliseCategorieEndpoint:
    def test_admin_can_change_categorie_on_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).patch(
            f"/api/ref/champs-personnalises/{c.id}/",
            {"categorie": "PERSONNEL"},
            format="json",
        )
        assert resp.status_code == 200
        c.refresh_from_db()
        assert c.categorie == "PERSONNEL"

    def test_cannot_change_code_on_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).patch(
            f"/api/ref/champs-personnalises/{c.id}/",
            {"code": "hacked"},
            format="json",
        )
        assert resp.status_code == 400

    def test_cannot_delete_system_field(self, admin_user):
        c = ChampPersonnalise.objects.get(code="matricule")
        resp = auth_client(admin_user).delete(f"/api/ref/champs-personnalises/{c.id}/")
        assert resp.status_code == 400
        assert ChampPersonnalise.objects.filter(id=c.id).exists()

    def test_list_exposes_is_systeme_and_categorie(self, admin_user):
        resp = auth_client(admin_user).get("/api/ref/champs-personnalises/")
        data = resp.data.get("results", resp.data)
        matricule = next(i for i in data if i["code"] == "matricule")
        assert matricule["is_systeme"] is True
        assert "categorie" in matricule
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_champ_personnalise_endpoint.py -v`
Expected: FAIL — `KeyError: 'is_systeme'` (champ absent du serializer) et les mutations bloquantes ne renvoient pas 400.

- [ ] **Step 3: Update the serializer and the detail view**

Replace `ChampPersonnaliseSerializer` and `ChampPersonnaliseDetailView` in `backend/employees/referentiel_views.py:581-606`:

```python
class ChampPersonnaliseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampPersonnalise
        fields = ['id', 'nom', 'code', 'type_champ', 'ordre', 'is_active', 'is_systeme', 'categorie']
        read_only_fields = ['is_systeme']

    def validate_code(self, value):
        if value.strip().lower() in RESERVED_CHAMP_CODES:
            raise serializers.ValidationError(
                "Ce code est réservé à un champ système (voir la colonne du même nom "
                "dans l'import CSV) — choisissez un code différent."
            )
        return value

    def validate(self, attrs):
        # Un champ système (is_systeme=True) n'est jamais créable via ce
        # serializer (is_systeme est read_only) — ici on protège l'édition :
        # seule `categorie` peut changer sur une instance existante is_systeme.
        instance = getattr(self, 'instance', None)
        if instance is not None and instance.is_systeme:
            mutable = set(attrs.keys()) - {'categorie'}
            if mutable:
                raise serializers.ValidationError(
                    "Un champ système ne peut avoir que sa catégorie modifiée "
                    "(nom, code, type, ordre et statut restent figés)."
                )
        return attrs


class ChampPersonnaliseListCreateView(generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseSerializer
    pagination_class = ReferentielPagination
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = ChampPersonnalise.objects.all()


class ChampPersonnaliseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ChampPersonnaliseSerializer
    permission_classes = [IsAdmin]
    queryset = ChampPersonnalise.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_systeme:
            return Response(
                {"detail": "Un champ système ne peut pas être supprimé."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
```

Check the top of `backend/employees/referentiel_views.py` already imports `Response` and `status` (used by other `destroy` overrides at lines 90/310) — no new import needed; if either is missing, add `from rest_framework.response import Response` and `from rest_framework import status` next to the existing DRF imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_champ_personnalise_endpoint.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Run the full existing champ-personnalisé related suite to check no regression**

Run: `cd backend && pytest tests/ -k champ -v`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/employees/referentiel_views.py backend/tests/test_champ_personnalise_endpoint.py
git commit -m "feat(champs): protège les champs système et expose categorie via l'API"
```

---

### Task 4: Exclure `is_systeme` de l'EAV — import CSV, `EmployeeDetailSerializer.champs_personnalises`

**Files:**
- Modify: `backend/employees/import_views.py` (fonction/dict `champs_actifs`)
- Modify: `backend/employees/serializers.py:311-319` (`EmployeeListSerializer.get_champs_personnalises`), `backend/employees/serializers.py:383-395` (`EmployeeDetailSerializer.get_champs_personnalises`)
- Test: `backend/tests/test_champ_personnalise_categorie.py` (extend)

**Interfaces:**
- Consumes: `ChampPersonnalise.is_systeme` (Task 1).
- Produces: aucune ligne `is_systeme=True` n'apparaît dans `champs_actifs` (import CSV) ni dans `champs_personnalises` (fiche employé, valeurs EAV) — comportement inchangé pour tout champ personnalisé classique.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_champ_personnalise_categorie.py`:

```python
from employees.import_views import EmployeeImportView


@pytest.mark.django_db
class TestIsSystemeExcludedFromEAV:
    def test_champs_actifs_excludes_system_fields(self):
        view = EmployeeImportView()
        champs_actifs = view._champs_actifs() if hasattr(view, '_champs_actifs') else None
        # Le nom exact de l'accès dépend de l'implémentation courante —
        # voir Step 3 pour le point d'insertion réel du filtre.
        assert champs_actifs is None or all(
            not c.is_systeme for c in champs_actifs.values()
        )
```

(Ce test sert de garde-fou local ; le test d'intégration réel est au Step 2 ci-dessous — voir aussi Step 3 pour localiser précisément `champs_actifs` avant d'écrire le filtre.)

- [ ] **Step 2: Locate the exact `champs_actifs` construction and the EAV serializer methods**

Run: `cd backend && grep -n "champs_actifs" employees/import_views.py`
Expected output: shows the line(s) building `champs_actifs = {...}` from `ChampPersonnalise.objects.filter(is_active=True)`.

Read that exact block with the Read tool before editing (line numbers will guide Step 3 — do not guess).

- [ ] **Step 3: Add `is_systeme=False` filters**

In `backend/employees/import_views.py`, wherever `champs_actifs` (or equivalent) is built from `ChampPersonnalise.objects.filter(is_active=True)`, change the filter to `ChampPersonnalise.objects.filter(is_active=True, is_systeme=False)`.

In `backend/employees/serializers.py`, `EmployeeListSerializer.get_champs_personnalises` (line ~311-319):

```python
    def get_champs_personnalises(self, obj):
        return {
            v.champ.code: v.valeur
            for v in obj.valeurs_personnalisees.all()
            if v.champ.is_active and not v.champ.is_systeme
        }
```

`EmployeeDetailSerializer.get_champs_personnalises` (line ~383-395):

```python
    def get_champs_personnalises(self, obj):
        valeurs = {v.champ_id: v.valeur for v in obj.valeurs_personnalisees.all()}
        return [
            {
                'id': str(c.id),
                'code': c.code,
                'nom': c.nom,
                'type_champ': c.type_champ,
                'valeur': valeurs.get(c.id, ''),
                'ordre': c.ordre,
            }
            for c in ChampPersonnalise.objects.filter(is_active=True, is_systeme=False)
        ]
```

- [ ] **Step 4: Remove the placeholder test and write the real one**

Delete the `TestIsSystemeExcludedFromEAV` class written in Step 1 (it was a guard against guessing) and replace it with:

```python
@pytest.mark.django_db
class TestIsSystemeExcludedFromEAV:
    def test_employee_detail_champs_personnalises_excludes_system(self, employee):
        from employees.serializers import EmployeeDetailSerializer
        data = EmployeeDetailSerializer(employee, context={}).data
        codes = [c['code'] for c in data['champs_personnalises']]
        assert 'matricule' not in codes
        assert 'date_naissance' not in codes
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_champ_personnalise_categorie.py -v`
Expected: PASS

- [ ] **Step 6: Run the CSV import test suite to check no regression**

Run: `cd backend && pytest tests/ -k import -v`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/employees/import_views.py backend/employees/serializers.py backend/tests/test_champ_personnalise_categorie.py
git commit -m "fix(champs): exclut les champs système de l'EAV (import CSV, fiche employé)"
```

---

### Task 5: `User.scope_champs_personnels` — modèle + méthodes de scoping

**Files:**
- Modify: `backend/accounts/models.py` (ajout du champ M2M + méthodes, près de `scope_types_documents` ligne 114-117 et `_type_doc_scope_ids`/`document_type_scope_q`/`accessible_types_documents_qs` lignes 329-416)
- Create: `backend/accounts/migrations/0011_user_scope_champs_personnels.py`
- Test: `backend/tests/test_scope_champs_personnels.py`

**Interfaces:**
- Consumes: `ChampPersonnalise` (`employees.ChampPersonnalise`), `ChampPersonnalise.Categorie.PERSONNEL`.
- Produces: `User.scope_champs_personnels` (M2M), `User._champ_personnel_scope_ids()`, `User.has_champ_personnel_scope_restriction` (property), `User.can_access_champ_personnel(champ_id)`, `User.accessible_champs_personnels_qs()`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_scope_champs_personnels.py
import pytest
from django.contrib.auth import get_user_model
from employees.models import ChampPersonnalise

User = get_user_model()


@pytest.fixture
def champ_personnel(db):
    return ChampPersonnalise.objects.create(
        nom="Test Perso", code="TEST_PERSO", categorie=ChampPersonnalise.Categorie.PERSONNEL
    )


@pytest.fixture
def champ_personnel_2(db):
    return ChampPersonnalise.objects.create(
        nom="Test Perso 2", code="TEST_PERSO_2", categorie=ChampPersonnalise.Categorie.PERSONNEL
    )


@pytest.mark.django_db
class TestScopeChampsPersonnels:
    def test_no_selection_means_unrestricted(self, consultant_user, champ_personnel):
        assert consultant_user.has_champ_personnel_scope_restriction is False
        assert consultant_user.can_access_champ_personnel(champ_personnel.id) is True
        assert consultant_user.accessible_champs_personnels_qs().count() == \
            ChampPersonnalise.objects.count()

    def test_selection_restricts_access(self, consultant_user, champ_personnel, champ_personnel_2):
        consultant_user.scope_champs_personnels.add(champ_personnel)
        assert consultant_user.has_champ_personnel_scope_restriction is True
        assert consultant_user.can_access_champ_personnel(champ_personnel.id) is True
        assert consultant_user.can_access_champ_personnel(champ_personnel_2.id) is False
        ids = set(consultant_user.accessible_champs_personnels_qs().values_list('id', flat=True))
        assert ids == {champ_personnel.id}

    def test_admin_always_unrestricted(self, admin_user, champ_personnel, champ_personnel_2):
        admin_user.scope_champs_personnels.add(champ_personnel)
        assert admin_user.can_access_champ_personnel(champ_personnel_2.id) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_scope_champs_personnels.py -v`
Expected: FAIL — `AttributeError: 'User' object has no attribute 'scope_champs_personnels'`

- [ ] **Step 3: Add the M2M field**

In `backend/accounts/models.py`, right after the `scope_types_documents` field (ends at line 117, before `objects = UserManager()` at line 119), add:

```python
    # Périmètre indépendant : restreint les CHAMPS personnels (colonne
    # "Informations personnelles" de la fiche employé) visibles, combiné en
    # ET avec les périmètres organisationnel et types de documents
    # ci-dessus. Ne couvre que les champs categorie=PERSONNEL — la colonne
    # Administrative reste toujours visible en entier. Vide = accès non
    # restreint (même règle que les autres champs de scope).
    scope_champs_personnels = models.ManyToManyField(
        'employees.ChampPersonnalise', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Champs personnels"
    )
```

- [ ] **Step 4: Add the scoping methods**

In `backend/accounts/models.py`, right after `accessible_types_documents_qs` (ends around line 416, before `is_locked`), add:

```python
    def _champ_personnel_scope_ids(self):
        """IDs des ChampPersonnalise (categorie=PERSONNEL) sélectionnés —
        set vide si aucune restriction."""
        if self.is_admin or not self.pk:
            return set()
        return set(self.scope_champs_personnels.values_list('id', flat=True))

    @property
    def has_champ_personnel_scope_restriction(self):
        """True si ce compte est restreint à certains champs personnels."""
        return bool(self._champ_personnel_scope_ids())

    def can_access_champ_personnel(self, champ_id):
        """Vérification objet-par-objet pour un champ categorie=PERSONNEL."""
        ids = self._champ_personnel_scope_ids()
        if not ids:
            return True
        return champ_id in ids

    def accessible_champs_personnels_qs(self):
        """ChampPersonnalise visibles pour ce compte (tous si aucune
        restriction, quelle que soit la categorie — le filtre PERSONNEL
        s'applique côté appelant, voir EmployeeDetailSerializer)."""
        from employees.models import ChampPersonnalise
        ids = self._champ_personnel_scope_ids()
        if not ids:
            return ChampPersonnalise.objects.all()
        return ChampPersonnalise.objects.filter(id__in=ids)
```

- [ ] **Step 5: Generate and apply the migration**

Run: `cd backend && python manage.py makemigrations accounts -n user_scope_champs_personnels`
Expected: creates `backend/accounts/migrations/0011_user_scope_champs_personnels.py`.

Run: `cd backend && python manage.py migrate accounts`
Expected: `Applying accounts.0011_user_scope_champs_personnels... OK`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_scope_champs_personnels.py -v`
Expected: PASS (3 passed)

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/models.py backend/accounts/migrations/0011_user_scope_champs_personnels.py backend/tests/test_scope_champs_personnels.py
git commit -m "feat(scoping): ajoute User.scope_champs_personnels (périmètre champs personnels)"
```

---

### Task 6: `UserSerializer` — exposer `scope_champs_personnels`

**Files:**
- Modify: `backend/accounts/admin_views.py:16-65` (`UserSerializer`), et ligne ~175 (snapshot audit)
- Test: `backend/tests/test_scope_champs_personnels.py` (extend)

**Interfaces:**
- Consumes: `User.scope_champs_personnels` (Task 5).
- Produces: `UserSerializer` expose `scope_champs_personnels` (write) + `scope_champs_personnels_nom` (read).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_scope_champs_personnels.py`:

```python
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestUserSerializerChampsPersonnels:
    def test_patch_scope_champs_personnels(self, admin_user, consultant_user, champ_personnel):
        resp = auth_client(admin_user).patch(
            f"/api/admin-users/{consultant_user.id}/",
            {"scope_champs_personnels": [str(champ_personnel.id)]},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.data["scope_champs_personnels_nom"] == ["Test Perso"]
        consultant_user.refresh_from_db()
        assert consultant_user.can_access_champ_personnel(champ_personnel.id)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_scope_champs_personnels.py::TestUserSerializerChampsPersonnels -v`
Expected: FAIL — `KeyError: 'scope_champs_personnels_nom'`

- [ ] **Step 3: Update `UserSerializer`**

In `backend/accounts/admin_views.py`, add a new `SerializerMethodField` after `scope_types_documents_nom` (line 23):

```python
    scope_champs_personnels_nom = serializers.SerializerMethodField()
```

Add the corresponding getter after `get_scope_types_documents_nom` (line 49-50):

```python
    def get_scope_champs_personnels_nom(self, obj):
        return list(obj.scope_champs_personnels.values_list('nom', flat=True))
```

Add the two field names to `Meta.fields`, right after `'scope_types_documents', 'scope_types_documents_nom',` (line 62):

```python
            'scope_champs_personnels', 'scope_champs_personnels_nom',
```

- [ ] **Step 4: Update the audit snapshot dict**

Run: `cd backend && grep -n "scope_types_documents" accounts/admin_views.py`
Locate the line ~175 snapshot dict (`'scope_types_documents': sorted(...)`) and add, right after it:

```python
                'scope_champs_personnels': sorted(str(i) for i in u.scope_champs_personnels.values_list('id', flat=True)),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_scope_champs_personnels.py -v`
Expected: PASS (all tests in file)

- [ ] **Step 6: Run the full accounts test suite to check no regression**

Run: `cd backend && pytest tests/ -k "user or scope or audit" -v`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/admin_views.py backend/tests/test_scope_champs_personnels.py
git commit -m "feat(scoping): expose scope_champs_personnels dans UserSerializer + audit"
```

---

### Task 7: `EmployeeDetailSerializer.champs_categories` — catégorisation scopée

**Files:**
- Modify: `backend/employees/serializers.py:333-395` (`EmployeeDetailSerializer`)
- Test: `backend/tests/test_champs_categories_serializer.py`

**Interfaces:**
- Consumes: `ChampPersonnalise.categorie`/`is_active` (Task 1/2), `User.can_access_champ_personnel` (Task 5).
- Produces: `EmployeeDetailSerializer` field `champs_categories` — dict `{code: 'PERSONNEL'|'ADMINISTRATIF'}` couvrant tous les champs actifs (système + personnalisés) visibles pour l'utilisateur courant (`self.context['request'].user`). Un code absent du dict = champ à ne pas afficher.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_champs_categories_serializer.py
import pytest
from rest_framework.test import APIRequestFactory
from employees.models import ChampPersonnalise
from employees.serializers import EmployeeDetailSerializer


def make_context(user):
    request = APIRequestFactory().get("/")
    request.user = user
    return {"request": request}


@pytest.mark.django_db
class TestChampsCategories:
    def test_admin_sees_all_categories(self, admin_user, employee):
        data = EmployeeDetailSerializer(employee, context=make_context(admin_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
        assert data["champs_categories"]["date_naissance"] == "PERSONNEL"

    def test_consultant_without_restriction_sees_all(self, consultant_user, employee):
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" in data["champs_categories"]

    def test_consultant_restricted_loses_unauthorized_personal_field(self, consultant_user, employee):
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        autre_perso = ChampPersonnalise.objects.create(
            nom="Autre perso", code="AUTRE_PERSO", categorie=ChampPersonnalise.Categorie.PERSONNEL
        )
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert "date_naissance" in data["champs_categories"]
        assert "AUTRE_PERSO" not in data["champs_categories"]

    def test_administratif_never_restricted(self, consultant_user, employee):
        date_naissance = ChampPersonnalise.objects.get(code="date_naissance")
        consultant_user.scope_champs_personnels.add(date_naissance)
        data = EmployeeDetailSerializer(employee, context=make_context(consultant_user)).data
        assert data["champs_categories"]["matricule"] == "ADMINISTRATIF"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_champs_categories_serializer.py -v`
Expected: FAIL — `KeyError: 'champs_categories'`

- [ ] **Step 3: Add the field**

In `backend/employees/serializers.py`, add `champs_categories = serializers.SerializerMethodField()` right after `champs_personnalises = serializers.SerializerMethodField()` in `EmployeeDetailSerializer` (line 356), and add `'champs_categories'` to `Meta.fields` right after `'champs_personnalises',` (line 374).

Add the getter right after `get_champs_personnalises` (after the block ending line 395):

```python
    def get_champs_categories(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        result = {}
        for c in ChampPersonnalise.objects.filter(is_active=True):
            if c.categorie == ChampPersonnalise.Categorie.PERSONNEL:
                if user is not None and not user.can_access_champ_personnel(c.id):
                    continue
            result[c.code] = c.categorie
        return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_champs_categories_serializer.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/employees/serializers.py backend/tests/test_champs_categories_serializer.py
git commit -m "feat(champs): expose champs_categories scopé sur EmployeeDetailSerializer"
```

---

### Task 8: Backend — suite complète

**Files:**
- None (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && pytest`
Expected: all tests pass (previous count + the ~15 new tests from Tasks 1-7), no regression.

- [ ] **Step 2: If failures appear, fix them in the relevant task's files and re-run until green.**

No commit for this task — it's a checkpoint before moving to frontend work.

---

### Task 9: Frontend `Parametres.jsx` — colonne Catégorie, suppression du merge `SYSTEM_FIELDS`

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx:928-940` (construction de `items` pour l'onglet `champs-personnalises`)
- Modify: `frontend/src/pages/Parametres.jsx` (colonnes de la table, case `"champs-personnalises"` autour de la ligne 1339)
- Test: `frontend/src/__tests__/Parametres.test.js` (chercher le describe existant sur l'onglet "Champs personnalisés" — étendre)

**Interfaces:**
- Consumes: réponse de `GET /ref/champs-personnalises/` incluant désormais `is_systeme`/`categorie` pour chaque ligne (Task 3).
- Produces: colonne "Catégorie" (`<select>`) dans le tableau, éditable pour toute ligne (système ou non) ; les lignes système ne sont plus dupliquées (une seule provenance : le backend).

- [ ] **Step 1: Read the current test file to find the existing "champs-personnalises" test block**

Run: `cd frontend && grep -n "champs-personnalises\|Champs personnalisés" src/__tests__/Parametres.test.js`

Read the matched section with the Read tool before writing new assertions, to match the existing mocking style (likely `jest.mock('../services/api')` with `api.get` resolving fixture arrays).

- [ ] **Step 2: Write the failing test**

Add to `frontend/src/__tests__/Parametres.test.js`, adapting the mock setup to match what Step 1 revealed (same `api.get`/`api.patch` mock pattern already used in the file):

```javascript
test("affiche et permet de modifier la catégorie d'un champ système", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/ref/champs-personnalises/") {
      return Promise.resolve({
        data: [
          { id: "uuid-matricule", nom: "Matricule", code: "matricule", type_champ: "texte", ordre: 0, is_active: true, is_systeme: true, categorie: "ADMINISTRATIF" },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  });
  api.patch.mockResolvedValue({ data: {} });

  render(<Parametres />);
  const tab = await screen.findByText("Champs personnalisés");
  fireEvent.click(tab);

  const select = await screen.findByDisplayValue("Administratif");
  fireEvent.change(select, { target: { value: "PERSONNEL" } });

  expect(api.patch).toHaveBeenCalledWith(
    "/ref/champs-personnalises/uuid-matricule/",
    { categorie: "PERSONNEL" }
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres.test.js -t "catégorie"`
Expected: FAIL — no element with display value "Administratif" found (no such column yet).

- [ ] **Step 4: Remove the client-side SYSTEM_FIELDS merge**

In `frontend/src/pages/Parametres.jsx`, replace the `items` construction for `activeTab === "champs-personnalises"` (lines 928-940):

```javascript
  const items =
    activeTab === "types-documents"
      ? sortTypesDocumentsHierarchy(data[activeTab] || [])
      : activeTab === "champs-personnalises"
        ? (data[activeTab] || [])
            .map((f) =>
              f.is_systeme
                ? { ...f, system: true, nom: systemLabels[f.code]?.label || f.nom }
                : { ...f, system: false }
            )
            .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
        : data[activeTab] || [];
```

Do not remove the `SYSTEM_FIELDS` constant itself (lines 527-547) — it is still used at lines 1307 and 2086 for the independent "Champ source" dropdown of `TypeDocument`, unrelated to this table.

- [ ] **Step 5: Add the "Catégorie" column**

In the columns array for `case "champs-personnalises":` (starts ~line 1339), add a new column object right after the `"type_champ"` column (after the block ending ~line 1351, before `"ordre"`):

```javascript
          {
            key: "categorie",
            label: "Catégorie",
            sortable: false,
            render: (i) => (
              <select
                value={i.categorie}
                onChange={async (e) => {
                  const categorie = e.target.value;
                  await api.patch(`/ref/champs-personnalises/${i.id}/`, { categorie });
                  fetchTab(activeTab, page, search, true);
                }}
                className="input-focus"
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 6,
                  padding: "3px 6px",
                  fontSize: 12,
                  color: theme.text,
                  background: theme.surface,
                }}
              >
                <option value="ADMINISTRATIF">Administratif</option>
                <option value="PERSONNEL">Personnel</option>
              </select>
            ),
          },
```

(Confirm the exact call signature of `fetchTab` used elsewhere in this file for a silent refresh — e.g. `fetchTab(activeTab, page, search, true)` matches the pattern documented in CLAUDE.md "Rafraîchissement de données après action"; adjust the argument list to match `fetchTab`'s real signature if it differs, found via `grep -n "const fetchTab" frontend/src/pages/Parametres.jsx`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres.test.js -t "catégorie"`
Expected: PASS

- [ ] **Step 7: Run the full Parametres test file to check no regression**

Run: `cd frontend && npm test -- Parametres.test.js`
Expected: all pass (existing champs-personnalises / reorder tests still green — the `system`/`code` shape consumed by `handleMoveField` at lines 668-680 and the "Ordre" column at lines 1352-1407 is unchanged).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/__tests__/Parametres.test.js
git commit -m "feat(parametres): colonne Catégorie éditable pour tous les champs"
```

---

### Task 10: Frontend `Users.jsx` — section "Champs personnels" dans la modale Périmètre

**Files:**
- Modify: `frontend/src/pages/Users.jsx` (fetch des champs personnels, état `scopeForm.champs_personnels`, toggle/select-all/clear, deux blocs de rendu ~ligne 730 et ~1331, `handleSaveScope` ~ligne 336-348, chargement initial du formulaire ~ligne 139)
- Test: `frontend/src/__tests__/Users.test.js`

**Interfaces:**
- Consumes: `GET /ref/champs-personnalises/` filtré `categorie=PERSONNEL` côté frontend (pas de nouveau paramètre backend nécessaire — filtrer le tableau reçu), `scope_champs_personnels`/`scope_champs_personnels_nom` (Task 6).
- Produces: section "Champs personnels" dans la modale Périmètre (création + édition), state `scopeForm.champs_personnels` (array d'ids), sauvegarde via `PATCH /admin-users/{id}/`.

- [ ] **Step 1: Locate the exact surrounding code to confirm line numbers before editing**

Run:
```bash
cd frontend && grep -n "typesDocuments\b\|scope_types_documents\|toggleTypeDocument\|const \[scopeForm" src/pages/Users.jsx
```

Read each matched region with the Read tool to get exact current line numbers (this file may have shifted since the excerpts already reviewed in this conversation) before making any edit in the steps below.

- [ ] **Step 2: Write the failing test**

Add to `frontend/src/__tests__/Users.test.js` (match the existing mock/render setup used by the file's other "Périmètre" tests — read one such existing test first with `grep -n "Périmètre" src/__tests__/Users.test.js` to copy its render/open-modal boilerplate):

```javascript
test("affiche la section Champs personnels dans la modale Périmètre", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/ref/champs-personnalises/") {
      return Promise.resolve({
        data: [
          { id: "champ-1", nom: "Date de naissance", code: "date_naissance", categorie: "PERSONNEL", is_systeme: true },
          { id: "champ-2", nom: "Matricule", code: "matricule", categorie: "ADMINISTRATIF", is_systeme: true },
        ],
      });
    }
    if (url === "/admin-users/") {
      return Promise.resolve({ data: [{ id: "u1", username: "cons1", role: "CONSULTANT", scope_champs_personnels: [], scope_champs_personnels_nom: [] }] });
    }
    return Promise.resolve({ data: [] });
  });

  render(<Users />);
  const perimetreBtn = await screen.findByText("Périmètre");
  fireEvent.click(perimetreBtn);

  expect(await screen.findByText("Champs personnels")).toBeInTheDocument();
  expect(screen.getByText("Date de naissance")).toBeInTheDocument();
  expect(screen.queryByText("Matricule")).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- Users.test.js -t "Champs personnels"`
Expected: FAIL — text "Champs personnels" not found.

- [ ] **Step 4: Add state and fetch for `champsPersonnels`**

Near the existing `typesDocuments` state declaration and its fetch effect in `frontend/src/pages/Users.jsx` (found via Step 1's grep), add a sibling state and fetch, filtering to `categorie === "PERSONNEL"` client-side:

```javascript
  const [champsPersonnels, setChampsPersonnels] = useState([]);
```

```javascript
  useEffect(() => {
    api.get("/ref/champs-personnalises/").then((res) => {
      const list = res.data.results || res.data;
      setChampsPersonnels(list.filter((c) => c.categorie === "PERSONNEL"));
    }).catch(() => {});
  }, []);
```

- [ ] **Step 5: Add `champs_personnels` to `scopeForm` initial shape and load**

Wherever `scopeForm` is initialized/reset (the object literal with keys `directions, poles, departements, services, cellules, sections, types_documents` — found via Step 1's grep on `const [scopeForm`), add `champs_personnels: []` alongside the other empty arrays, and wherever the existing scope is loaded from a user object (`types_documents: u.scope_types_documents || []` at the line found via Step 1), add:

```javascript
      champs_personnels: u.scope_champs_personnels || [],
```

- [ ] **Step 6: Add toggle/select-all/clear support**

`selectAllInLevel`/`clearLevel` (lines ~323-334) are already fully generic (`setScopeForm((prev) => ({ ...prev, [level]: ids }))`) — no change needed there. Add a simple toggle function next to `toggleSection` (found via Step 1's grep):

```javascript
  const toggleChampPersonnel = (id) => {
    setScopeForm((prev) => {
      const next = prev.champs_personnels.includes(id)
        ? prev.champs_personnels.filter((x) => x !== id)
        : [...prev.champs_personnels, id];
      return { ...prev, champs_personnels: next };
    });
  };
```

- [ ] **Step 7: Add the section to both render blocks**

In both level-config arrays (creation form ~line 730 and edit "Périmètre" modal ~line 1331 — confirm exact lines via Step 1's grep), add a new entry right after the `types_documents` entry:

```javascript
                    { level: "champs_personnels", label: "Champs personnels", items: champsPersonnels, onToggle: toggleChampPersonnel },
```

The existing `.map(({ level, label, items, onToggle }) => (...))` block renders this generically (checkbox `checked={scopeForm[level].includes(item.id)}`, since `level !== "types_documents"` takes the non-special branch) — no further JSX change needed, `champsPersonnels` items already have `.id`/`.nom` matching the shape the renderer expects.

- [ ] **Step 8: Include `scope_champs_personnels` in the save payload**

In `handleSaveScope` (~line 336-348), add to the `api.patch(...)` body:

```javascript
          scope_champs_personnels: scopeForm.champs_personnels,
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd frontend && npm test -- Users.test.js -t "Champs personnels"`
Expected: PASS

- [ ] **Step 10: Run the full Users test file to check no regression**

Run: `cd frontend && npm test -- Users.test.js`
Expected: all pass.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/Users.jsx frontend/src/__tests__/Users.test.js
git commit -m "feat(users): périmètre Champs personnels dans la modale Périmètre"
```

---

### Task 11: Frontend `EmployeeDetail.jsx` — panneau Informations en 2 colonnes

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx:619-679` (`infoFields`)
- Modify: `frontend/src/pages/EmployeeDetail.jsx:814-894` (rendu du panneau "Informations")
- Test: `frontend/src/__tests__/EmployeeDetail.test.js`

**Interfaces:**
- Consumes: `employee.champs_categories` (Task 7, dict `{code: 'PERSONNEL'|'ADMINISTRATIF'}`).
- Produces: 2 cards côte à côte (`Personnel` / `Administratif`), 1 colonne empilée sous 768px.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/EmployeeDetail.test.js` (match the existing mock pattern for `api.get("/employees/:id/")` already used elsewhere in this file — read one such test first):

```javascript
test("affiche les informations réparties en colonnes Personnel et Administratif", async () => {
  mockEmployeeResponse({
    // ...garder les autres champs déjà utilisés par les tests existants du fichier...
    matricule: "EMP-001",
    date_naissance: "1990-01-01",
    champs_categories: { matricule: "ADMINISTRATIF", date_naissance: "PERSONNEL", nom: "ADMINISTRATIF" },
  });

  render(<EmployeeDetail />, { route: "/employees/emp-1" });

  const personnelHeading = await screen.findByText("Informations personnelles");
  const adminHeading = await screen.findByText("Informations administratives");
  expect(personnelHeading).toBeInTheDocument();
  expect(adminHeading).toBeInTheDocument();

  const personnelCard = personnelHeading.closest("div").parentElement;
  const adminCard = adminHeading.closest("div").parentElement;
  expect(within(personnelCard).getByText("1990-01-01")).toBeInTheDocument();
  expect(within(adminCard).getByText("EMP-001")).toBeInTheDocument();
});
```

(Adapt `mockEmployeeResponse`/render helper names to whatever this test file's existing tests actually call — inspect the file first with `grep -n "mockEmployeeResponse\|const render\|import.*testing-library" src/__tests__/EmployeeDetail.test.js` before writing, and add `within` to the `@testing-library/react` import at the top of the test file if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- EmployeeDetail.test.js -t "colonnes Personnel"`
Expected: FAIL — text "Informations personnelles" not found (panel is still a single flat grid).

- [ ] **Step 3: Add `code` to the two fields currently missing it, and a `categorie` lookup to every item**

In `frontend/src/pages/EmployeeDetail.jsx`, `infoFields` (lines 619-679):

- Line 620 (Matricule): add `code: "matricule",` to the object.
- Line 629-633 ("Nom & Prénom"): add `code: "nom",` to the object (categorization follows the "nom" system field; "Prénom" is not shown as a separate row so this is the only reasonable anchor).

Then, right after the `infoFields` array definition (after line 679, before `const documentsAffiches = ...`), add:

```javascript
  const champsCategories = employee.champs_categories || {};
  const infoFieldsPersonnel = infoFields.filter((f) => champsCategories[f.code] === "PERSONNEL");
  const infoFieldsAdministratif = infoFields.filter((f) => champsCategories[f.code] !== "PERSONNEL");
```

(A field whose `code` is absent from `champs_categories` — e.g. it was filtered out server-side because the CONSULTANT lacks access — falls into `infoFieldsAdministratif` only if its category isn't `"PERSONNEL"`; since a restricted personal field is entirely absent from `champs_categories`, `champsCategories[f.code] !== "PERSONNEL"` is `true` for it, which would wrongly show it under Administratif. Guard against this explicitly:)

```javascript
  const infoFieldsPersonnel = infoFields.filter((f) => champsCategories[f.code] === "PERSONNEL");
  const infoFieldsAdministratif = infoFields.filter(
    (f) => champsCategories[f.code] === "ADMINISTRATIF" || !(f.code in champsCategories) === false
  );
```

Simplify: only render a field if its code is present in `champsCategories` at all (absence = not visible to this user, whatever the reason):

```javascript
  const champsCategories = employee.champs_categories || {};
  const visibleInfoFields = infoFields.filter((f) => f.code in champsCategories);
  const infoFieldsPersonnel = visibleInfoFields.filter((f) => champsCategories[f.code] === "PERSONNEL");
  const infoFieldsAdministratif = visibleInfoFields.filter((f) => champsCategories[f.code] === "ADMINISTRATIF");
```

- [ ] **Step 4: Extract the existing card into a small local render helper and duplicate it into 2 columns**

Replace the single "Infos employé" block (lines 814-894) with:

```javascript
        {/* Infos employé */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 24,
            marginBottom: 24,
          }}
        >
          {[
            { title: "Informations personnelles", fields: infoFieldsPersonnel },
            { title: "Informations administratives", fields: infoFieldsAdministratif },
          ].map(({ title, fields }) => (
            <div
              key={title}
              className="anim-slide-up"
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 24, boxShadow: theme.shadowMd }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ width: 4, height: 16, borderRadius: 2, background: theme.primary }} />
                <span style={{ color: theme.textMuted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {title}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 20 }}>
                {fields.map((item) => (
                  <div key={item.label}>
                    <div
                      onClick={champToDoc[item.code] ? () => handleFieldClick(item.code) : undefined}
                      title={champToDoc[item.code] ? `Voir le document : ${champToDoc[item.code].nom}` : undefined}
                      className={champToDoc[item.code] ? "hover-lift" : undefined}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: champToDoc[item.code] ? theme.primary : theme.textMuted,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 6,
                        ...(champToDoc[item.code]
                          ? { cursor: "pointer", background: theme.primaryBg, border: `1px solid ${theme.primaryBorder}`, borderRadius: 6, padding: "3px 7px" }
                          : {}),
                      }}
                    >
                      {champToDoc[item.code] && <span style={{ fontSize: 11 }}>🔗</span>}
                      {item.label}
                    </div>
                    {item.badge ? (
                      <span
                        style={{
                          background: employee.statut === "actif" ? theme.primaryBg : theme.dangerBg,
                          color: employee.statut === "actif" ? theme.primary : theme.danger,
                          border: `1px solid ${employee.statut === "actif" ? theme.border : theme.dangerBorder}`,
                          borderRadius: 6,
                          padding: "3px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {employee.statut}
                      </span>
                    ) : (
                      <div
                        style={{
                          color: item.mono ? theme.primary : theme.text,
                          fontFamily: item.mono ? "monospace" : "inherit",
                          fontWeight: item.bold || item.mono ? 700 : 400,
                          fontSize: item.mono ? 15 : 13,
                        }}
                      >
                        {item.value}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- EmployeeDetail.test.js -t "colonnes Personnel"`
Expected: PASS

- [ ] **Step 6: Run the full EmployeeDetail test file to check no regression**

Run: `cd frontend && npm test -- EmployeeDetail.test.js`
Expected: all pass — in particular any existing test asserting on the field-click-to-document behavior (`champToDoc`/`handleFieldClick`) still passes unchanged, since that logic is untouched, only relocated into the per-column map.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.js
git commit -m "feat(employee-detail): panneau Informations en 2 colonnes Personnel/Administratif"
```

---

### Task 12: Suite complète + documentation

**Files:**
- Modify: `CLAUDE.md` (nouvelle section, à la suite de "Champs personnalisés — panneau Informations configurable")

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && pytest`
Expected: all pass.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: all pass.

- [ ] **Step 3: Document the feature in CLAUDE.md**

Add a new section to `c:\Users\filali\SOMIZ\CLAUDE.md`, right after the "## Champs personnalisés — panneau "Informations" configurable (2026-07-25)" section (before the next `---`):

```markdown
## Panneau "Informations" — colonnes Personnel/Administratif (2026-09-01)

Le panneau "Informations" de la fiche employé est divisé en 2 colonnes
côte à côte (1 colonne empilée sous 768px) : "Informations personnelles"
à gauche, "Informations administratives" à droite.

- `ChampPersonnalise` (`backend/employees/models.py`) sert désormais de
  **catalogue unifié** pour tous les champs de ce panneau : `is_systeme`
  (bool, seedé une fois pour les 19 champs structurels, jamais
  créable/supprimable via l'UI) et `categorie` (`PERSONNEL`/
  `ADMINISTRATIF`, modifiable pour tout champ y compris système). Les
  champs système restent des colonnes réelles sur `Employee` — ces lignes
  ne servent que de registre de métadonnées, jamais de stockage EAV
  (`is_systeme=True` exclu de `champs_actifs`/`champs_personnalises`).
- UI `/parametres` → "Champs personnalisés" : colonne "Catégorie" (select),
  éditable pour toutes les lignes.
- Scoping CONSULTANT indépendant : `User.scope_champs_personnels` (M2M,
  vide = non restreint) restreint quels champs `categorie=PERSONNEL` sont
  visibles — la colonne Administrative n'est jamais restreinte. UI : section
  "Champs personnels" dans la modale "Périmètre" de `/users`.
- `EmployeeDetailSerializer.champs_categories` — dict `{code: categorie}`
  déjà filtré selon le périmètre de l'utilisateur courant ; un champ
  personnel non autorisé est absent du dict (donc du panneau), pas
  seulement masqué côté frontend.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documente les colonnes Informations personnel/administratif"
```

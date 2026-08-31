# Historique de carrière Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee's fiche show the history of their Fonction, Catégorie and Échelle over time (periods with start/end dates), auto-tracked when an ADMIN edits the employee and manually editable for retroactive entries, plus surface existing Contrat history as a 4th axis.

**Architecture:** Three new Django models (`HistoriqueFonction`, `HistoriqueCategorie`, `HistoriqueEchelle`) sharing an abstract `HistoriquePeriode` base, plus a new `Echelle` referentiel model (CRUD like `Categorie`/`TypeContrat`). A single parametrized DRF view pair (`HistoriqueListCreateView`/`HistoriqueDetailView`, keyed by `axe` in the URL) handles manual CRUD for all three axes. `EmployeeDetailView.perform_update` auto-closes/opens periods when `poste`/`categorie` change (mirrors the existing `TRANSFER_FIELDS` mechanism). Frontend adds a "Carrière" tab to `EmployeeDetail.jsx` (read-only timeline + ADMIN-only management modal) and an "Échelles" tab to `Parametres.jsx`.

**Tech Stack:** Django 4.2.30 / DRF 3.15.2 (backend), React 19 (frontend), pytest (backend tests), Jest + RTL (frontend tests).

## Global Constraints

- Backend styles inline nowhere (N/A) — frontend: **inline styles only** (`style={{}}`), tokens from `frontend/src/styles/theme.js`, never hardcoded hex.
- No `window.confirm()`/`window.prompt()` — use `useConfirm()`/`usePrompt()` from `components/ConfirmDialog.jsx`.
- Any `fetch*()` re-used after a mutating action must accept a `silent` param that skips `setLoading(true/false)` (see `EmployeeDetail.jsx#fetchEmployee` for the pattern).
- Every new view that lists/reads an employee must apply `request.user.can_access_employee(employee)` (scoping).
- ADMIN-only writes go through `IsAdmin`; reads through `IsAdminOrConsultant`.
- No `Employee.echelle` field — Échelle's current value is derived only from the latest `HistoriqueEchelle` period with `date_fin=None` (per spec, explicitly out of scope to add a direct FK).
- Run `cd backend && pytest` and `cd frontend && npm test` before considering any task done.

---

## File Structure

**Backend:**
- `backend/employees/models.py` — add `Echelle`, `HistoriquePeriode` (abstract), `HistoriqueFonction`, `HistoriqueCategorie`, `HistoriqueEchelle` (after `Categorie`, ~line 257)
- `backend/employees/migrations/0021_echelle.py` — new
- `backend/employees/migrations/0022_historique_carriere.py` — new
- `backend/employees/referentiel_views.py` — add `EchelleSerializer`, `EchelleListCreateView`, `EchelleDetailView`; extend `ReferentielBulkDeleteView.MODELS`
- `backend/employees/referentiel_urls.py` — add `/ref/echelles/` routes
- `backend/employees/import_views.py` — add `echelles` to `ReferentielImportView.MODELS` / `ReferentielImportTemplateView.TEMPLATES`
- `backend/employees/serializers.py` — add `HistoriqueFonctionSerializer`, `HistoriqueCategorieSerializer`, `HistoriqueEchelleSerializer`
- `backend/employees/views.py` — add `HistoriqueListCreateView`, `HistoriqueDetailView`; extend `EmployeeDetailView.perform_update` with career auto-tracking
- `backend/employees/urls.py` — add `/api/employees/<str:emp_id>/historique/<str:axe>/` and `/api/historique/<str:axe>/<uuid:pk>/`
- `backend/tests/test_echelle_referentiel.py` — new
- `backend/tests/test_historique_carriere.py` — new
- `backend/tests/conftest.py` — add `echelle` fixture

**Frontend:**
- `frontend/src/pages/Parametres.jsx` — add `echelles` tab (`TABS`, `REF_COLUMNS_INFO`)
- `frontend/src/pages/EmployeeDetail.jsx` — add "Carrière" tab (timeline + "Gérer l'historique" modal, ADMIN only)
- `frontend/src/pages/EmployeeForm.jsx` — extend transfer-confirmation summary to include Fonction/Catégorie changes
- `frontend/src/pages/AuditLogs.jsx` — extend `formatTransfer()` labels for `poste`/`categorie`
- `frontend/src/__tests__/Parametres.test.jsx` — add Échelles tab test
- `frontend/src/__tests__/EmployeeDetail.test.jsx` — add Carrière tab tests

---

### Task 1: `Echelle` referentiel model + migration

**Files:**
- Modify: `backend/employees/models.py` (insert after `Categorie`, line 257)
- Create: `backend/employees/migrations/0021_echelle.py`
- Modify: `backend/tests/conftest.py` (add `echelle` fixture)
- Test: `backend/tests/test_echelle_referentiel.py`

**Interfaces:**
- Produces: `employees.models.Echelle` (`id`, `nom` unique, `description`, `is_active`, `created_at`), `db_table='echelles'`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_echelle_referentiel.py`:

```python
import pytest
from employees.models import Echelle


@pytest.mark.django_db
class TestEchelleModel:
    def test_create_echelle(self):
        echelle = Echelle.objects.create(nom="Échelle 10")
        assert echelle.pk is not None
        assert echelle.is_active is True
        assert str(echelle) == "Échelle 10"

    def test_nom_unique(self):
        Echelle.objects.create(nom="Échelle 10")
        with pytest.raises(Exception):
            Echelle.objects.create(nom="Échelle 10")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_echelle_referentiel.py -v`
Expected: FAIL with `ImportError: cannot import name 'Echelle'`

- [ ] **Step 3: Add the model**

In `backend/employees/models.py`, insert immediately after the `Categorie` class (after line 256, before the `# Palette fixe...` comment at line 258):

```python
class Echelle(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True, verbose_name="Échelle")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'echelles'
        verbose_name = "Échelle"
        ordering = ['nom']

    def __str__(self):
        return self.nom
```

- [ ] **Step 4: Generate and inspect the migration**

Run: `cd backend && python manage.py makemigrations employees --name echelle`
Expected: creates `backend/employees/migrations/0021_echelle.py` defining the `Echelle` model (verify by opening the generated file — it should contain a single `CreateModel` operation for `Echelle` matching the fields above).

- [ ] **Step 5: Add the `echelle` fixture**

In `backend/tests/conftest.py`, add next to the existing `categorie` fixture:

```python
@pytest.fixture
def echelle(db):
    from employees.models import Echelle
    return Echelle.objects.create(nom="Échelle 10")
```

- [ ] **Step 6: Run migration and tests**

Run: `cd backend && python manage.py migrate employees && pytest tests/test_echelle_referentiel.py -v`
Expected: PASS (2 passed)

- [ ] **Step 7: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/0021_echelle.py backend/tests/conftest.py backend/tests/test_echelle_referentiel.py
git commit -m "feat(employees): ajoute le référentiel Échelle"
```

---

### Task 2: `Echelle` CRUD endpoints (`/ref/echelles/`)

**Files:**
- Modify: `backend/employees/referentiel_views.py`
- Modify: `backend/employees/referentiel_urls.py`
- Test: `backend/tests/test_echelle_referentiel.py` (extend)

**Interfaces:**
- Consumes: `employees.models.Echelle` (Task 1)
- Produces: `EchelleSerializer`, `EchelleListCreateView`, `EchelleDetailView` (importable from `employees.referentiel_views`); routes `GET/POST /ref/echelles/`, `GET/PATCH/DELETE /ref/echelles/<uuid:pk>/`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_echelle_referentiel.py`:

```python
from rest_framework.test import APIClient


def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestEchelleEndpoints:
    def test_admin_can_list_echelles(self, admin_user, echelle):
        resp = auth_client(admin_user).get("/api/ref/echelles/")
        assert resp.status_code == 200
        assert any(e["nom"] == "Échelle 10" for e in resp.data["results"])

    def test_admin_can_create_echelle(self, admin_user):
        resp = auth_client(admin_user).post("/api/ref/echelles/", {"nom": "Échelle 12"})
        assert resp.status_code == 201
        assert Echelle.objects.filter(nom="Échelle 12").exists()

    def test_consultant_cannot_create_echelle(self, consultant_user):
        resp = auth_client(consultant_user).post("/api/ref/echelles/", {"nom": "Échelle 12"})
        assert resp.status_code == 403

    def test_admin_can_delete_echelle(self, admin_user, echelle):
        resp = auth_client(admin_user).delete(f"/api/ref/echelles/{echelle.id}/")
        assert resp.status_code == 204
        assert not Echelle.objects.filter(pk=echelle.pk).exists()
```

Check `backend/tests/conftest.py` for a `consultant_user` fixture; if absent, add it next to `admin_user` following the same pattern with `role="CONSULTANT"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_echelle_referentiel.py -v`
Expected: FAIL with 404 (route doesn't exist)

- [ ] **Step 3: Add serializer and views**

In `backend/employees/referentiel_views.py`:
1. Add `Echelle` to the `from employees.models import (...)` block at the top.
2. Add the serializer and views (near `CategorieSerializer`/`CategorieListCreateView`/`CategorieDetailView`):

```python
class EchelleSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()

    class Meta:
        model = Echelle
        fields = ['id', 'nom', 'description', 'is_active', 'nb_employes']

    def get_nb_employes(self, obj):
        return obj.historiquehecelle_periodes.filter(date_fin__isnull=True).count() if hasattr(obj, 'historiquehecelle_periodes') else 0


class EchelleListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = EchelleSerializer
    search_fields = ['nom']

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]

    def get_queryset(self):
        return self.filter_search(Echelle.objects.all())


class EchelleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EchelleSerializer
    permission_classes = [IsAdmin]
    queryset = Echelle.objects.all()
```

3. Add `'echelles': Echelle,` to `ReferentielBulkDeleteView.MODELS`.

Note: `get_nb_employes` references `historiquehecelle_periodes` which won't exist until Task 3 defines `HistoriqueEchelle` with `related_name='%(class)s_periodes'`. Simplify for now — replace the method body with a placeholder that will be corrected in Task 3:

```python
    def get_nb_employes(self, obj):
        return obj.historiqueechelle_periodes.filter(date_fin__isnull=True).count()
```

(This matches Django's abstract-model `related_name='%(class)s_periodes'` resolution for the `HistoriqueEchelle` subclass — lowercased class name — defined in Task 3. Since Task 3 runs immediately after this one and both are required for the feature to work end-to-end, this forward reference is safe; `EchelleListCreateView`'s tests in this task don't call `get_nb_employes` on a real employee, only check `nom`.)

- [ ] **Step 4: Add URL routes**

In `backend/employees/referentiel_urls.py`: import `EchelleListCreateView, EchelleDetailView` and add:

```python
    path('echelles/', EchelleListCreateView.as_view()),
    path('echelles/<uuid:pk>/', EchelleDetailView.as_view()),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_echelle_referentiel.py -v`
Expected: PASS (6 passed) — if `test_consultant_cannot_create_echelle` fails because `consultant_user` fixture was missing and just added, re-run after Step 3's fixture addition.

- [ ] **Step 6: Commit**

```bash
git add backend/employees/referentiel_views.py backend/employees/referentiel_urls.py backend/tests/test_echelle_referentiel.py backend/tests/conftest.py
git commit -m "feat(employees): endpoints CRUD /ref/echelles/"
```

---

### Task 3: `HistoriquePeriode` abstract base + 3 concrete models

**Files:**
- Modify: `backend/employees/models.py` (insert after `Echelle`, defined in Task 1)
- Create: `backend/employees/migrations/0022_historique_carriere.py`
- Test: `backend/tests/test_historique_carriere.py`

**Interfaces:**
- Consumes: `employees.models.Poste`, `Categorie`, `Echelle`, `Employee`
- Produces: `employees.models.HistoriqueFonction` (fields: `id`, `employee`, `poste`, `date_debut`, `date_fin`, `commentaire`, `created_by`, `created_at`; related_name `historiquefonction_periodes` on `Employee`), `HistoriqueCategorie` (field `categorie`, related_name `historiquecategorie_periodes`), `HistoriqueEchelle` (field `echelle`, related_name `historiqueechelle_periodes`).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_historique_carriere.py`:

```python
import pytest
from datetime import date
from django.core.exceptions import ValidationError
from employees.models import HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle


@pytest.mark.django_db
class TestHistoriqueModels:
    def test_create_historique_fonction(self, employee, poste, admin_user):
        h = HistoriqueFonction.objects.create(
            employee=employee, poste=poste,
            date_debut=date(2020, 1, 1), date_fin=date(2022, 12, 31),
            created_by=admin_user,
        )
        assert h.pk is not None
        assert employee.historiquefonction_periodes.count() == 1

    def test_periode_en_cours_has_no_date_fin(self, employee, poste, admin_user):
        h = HistoriqueFonction.objects.create(
            employee=employee, poste=poste, date_debut=date(2023, 1, 1),
            created_by=admin_user,
        )
        assert h.date_fin is None

    def test_date_fin_before_date_debut_is_invalid(self, employee, poste):
        h = HistoriqueFonction(
            employee=employee, poste=poste,
            date_debut=date(2023, 1, 1), date_fin=date(2022, 1, 1),
        )
        with pytest.raises(ValidationError):
            h.full_clean()

    def test_create_historique_categorie(self, employee, categorie, admin_user):
        h = HistoriqueCategorie.objects.create(
            employee=employee, categorie=categorie, date_debut=date(2020, 1, 1),
            created_by=admin_user,
        )
        assert employee.historiquecategorie_periodes.count() == 1

    def test_create_historique_echelle(self, employee, echelle, admin_user):
        h = HistoriqueEchelle.objects.create(
            employee=employee, echelle=echelle, date_debut=date(2020, 1, 1),
            created_by=admin_user,
        )
        assert employee.historiqueechelle_periodes.count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_historique_carriere.py -v`
Expected: FAIL with `ImportError: cannot import name 'HistoriqueFonction'`

- [ ] **Step 3: Add the models**

In `backend/employees/models.py`, insert immediately after the `Echelle` class (added in Task 1):

```python
class HistoriquePeriode(models.Model):
    """
    Période dans le temps pour un axe de carrière (Fonction, Catégorie,
    Échelle). `date_fin=None` signifie période en cours.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        'Employee', on_delete=models.CASCADE, related_name='%(class)s_periodes'
    )
    date_debut = models.DateField(verbose_name="Date début")
    date_fin = models.DateField(null=True, blank=True, verbose_name="Date fin")
    commentaire = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ['-date_debut']

    def clean(self):
        if self.date_fin and self.date_fin < self.date_debut:
            raise ValidationError(
                "La date de fin doit être postérieure à la date de début."
            )


class HistoriqueFonction(HistoriquePeriode):
    poste = models.ForeignKey(Poste, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_fonctions'
        verbose_name = "Historique — Fonction"

    def __str__(self):
        return f"{self.employee} — {self.poste} ({self.date_debut} → {self.date_fin or '...'})"


class HistoriqueCategorie(HistoriquePeriode):
    categorie = models.ForeignKey(Categorie, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_categories'
        verbose_name = "Historique — Catégorie"

    def __str__(self):
        return f"{self.employee} — {self.categorie} ({self.date_debut} → {self.date_fin or '...'})"


class HistoriqueEchelle(HistoriquePeriode):
    echelle = models.ForeignKey(Echelle, on_delete=models.CASCADE, related_name='historiques')

    class Meta(HistoriquePeriode.Meta):
        db_table = 'historique_echelles'
        verbose_name = "Historique — Échelle"

    def __str__(self):
        return f"{self.employee} — {self.echelle} ({self.date_debut} → {self.date_fin or '...'})"
```

Add `from django.core.exceptions import ValidationError` to the top imports of `backend/employees/models.py` if not already present (check — it may already be imported for `Section.clean()`/`Cellule.clean()`; if so, reuse it, don't duplicate the import).

- [ ] **Step 4: Generate the migration**

Run: `cd backend && python manage.py makemigrations employees --name historique_carriere`
Expected: creates `backend/employees/migrations/0022_historique_carriere.py` with 3 `CreateModel` operations (`historiquefonction`, `historiquecategorie`, `historiqueechelle`).

- [ ] **Step 5: Run migration and tests**

Run: `cd backend && python manage.py migrate employees && pytest tests/test_historique_carriere.py -v`
Expected: PASS (5 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/0022_historique_carriere.py backend/tests/test_historique_carriere.py
git commit -m "feat(employees): modèles HistoriqueFonction/Categorie/Echelle"
```

---

### Task 4: Manual CRUD endpoints for career history

**Files:**
- Modify: `backend/employees/serializers.py`
- Modify: `backend/employees/views.py`
- Modify: `backend/employees/urls.py`
- Test: `backend/tests/test_historique_carriere.py` (extend)

**Interfaces:**
- Consumes: `HistoriqueFonction`/`HistoriqueCategorie`/`HistoriqueEchelle` (Task 3), `resolve_employee` (existing helper in `employees/views.py`, used by `EmployeeDetailView.get_object`).
- Produces: `HistoriqueListCreateView`, `HistoriqueDetailView` in `employees/views.py`; routes `GET/POST /api/employees/<str:emp_id>/historique/<str:axe>/`, `GET/PATCH/DELETE /api/historique/<str:axe>/<uuid:pk>/` where `axe` ∈ `{fonctions, categories, echelles}`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_historique_carriere.py`:

```python
from datetime import date
from employees.models import Employee


def historique_list_url(emp_id, axe):
    return f"/api/employees/{emp_id}/historique/{axe}/"


def historique_detail_url(axe, pk):
    return f"/api/historique/{axe}/{pk}/"


@pytest.mark.django_db
class TestHistoriqueEndpoints:
    def test_admin_can_create_periode_fonction(self, admin_user, employee, poste):
        resp = auth_client(admin_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2020-01-01", "date_fin": "2022-12-31"},
            format="json",
        )
        assert resp.status_code == 201
        assert HistoriqueFonction.objects.filter(employee=employee).count() == 1

    def test_consultant_cannot_create_periode(self, consultant_user, employee, poste):
        resp = auth_client(consultant_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2020-01-01"},
            format="json",
        )
        assert resp.status_code == 403

    def test_admin_can_list_periodes(self, admin_user, employee, poste):
        HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).get(historique_list_url(employee.pk, "fonctions"))
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_overlapping_periode_is_rejected(self, admin_user, employee, poste):
        HistoriqueFonction.objects.create(
            employee=employee, poste=poste, date_debut=date(2020, 1, 1), date_fin=date(2022, 12, 31)
        )
        resp = auth_client(admin_user).post(
            historique_list_url(employee.pk, "fonctions"),
            {"poste": str(poste.id), "date_debut": "2021-06-01", "date_fin": "2023-01-01"},
            format="json",
        )
        assert resp.status_code == 400

    def test_admin_can_update_periode(self, admin_user, employee, poste):
        h = HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).patch(
            historique_detail_url("fonctions", h.pk), {"date_fin": "2021-12-31"}, format="json"
        )
        assert resp.status_code == 200
        h.refresh_from_db()
        assert h.date_fin == date(2021, 12, 31)

    def test_admin_can_delete_periode(self, admin_user, employee, poste):
        h = HistoriqueFonction.objects.create(employee=employee, poste=poste, date_debut=date(2020, 1, 1))
        resp = auth_client(admin_user).delete(historique_detail_url("fonctions", h.pk))
        assert resp.status_code == 204
        assert not HistoriqueFonction.objects.filter(pk=h.pk).exists()

    def test_unknown_axe_returns_404(self, admin_user, employee):
        resp = auth_client(admin_user).get(historique_list_url(employee.pk, "bogus"))
        assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_historique_carriere.py -v`
Expected: FAIL with 404 (routes don't exist yet)

- [ ] **Step 3: Add serializers**

In `backend/employees/serializers.py`, add (near the other referentiel-linked serializers):

```python
from employees.models import HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle


class HistoriqueFonctionSerializer(serializers.ModelSerializer):
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)

    class Meta:
        model = HistoriqueFonction
        fields = ['id', 'poste', 'poste_nom', 'date_debut', 'date_fin', 'commentaire']


class HistoriqueCategorieSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)

    class Meta:
        model = HistoriqueCategorie
        fields = ['id', 'categorie', 'categorie_nom', 'date_debut', 'date_fin', 'commentaire']


class HistoriqueEchelleSerializer(serializers.ModelSerializer):
    echelle_nom = serializers.CharField(source='echelle.nom', read_only=True)

    class Meta:
        model = HistoriqueEchelle
        fields = ['id', 'echelle', 'echelle_nom', 'date_debut', 'date_fin', 'commentaire']
```

(Add the import at the top of the existing `from employees.models import (...)` block instead of a second import line, if that's the file's convention — check the top of `serializers.py` first and merge accordingly.)

- [ ] **Step 4: Add the views**

In `backend/employees/views.py`, add near `EmployeeDetailView`:

```python
from employees.models import HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle
from employees.serializers import (
    HistoriqueFonctionSerializer, HistoriqueCategorieSerializer, HistoriqueEchelleSerializer,
)

HISTORIQUE_AXES = {
    'fonctions': (HistoriqueFonction, HistoriqueFonctionSerializer),
    'categories': (HistoriqueCategorie, HistoriqueCategorieSerializer),
    'echelles': (HistoriqueEchelle, HistoriqueEchelleSerializer),
}


def _check_no_overlap(model, employee, date_debut, date_fin, exclude_pk=None):
    from datetime import date as date_cls
    end = date_fin or date_cls.max
    qs = model.objects.filter(employee=employee)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    for p in qs:
        p_end = p.date_fin or date_cls.max
        if date_debut <= p_end and p.date_debut <= end:
            raise DjangoValidationError(
                "Cette période chevauche une période existante pour cet axe."
            )


class HistoriqueListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/employees/{emp_id}/historique/{axe}/  → Liste des périodes (ADMIN + CONSULTANT scopé)
    POST /api/employees/{emp_id}/historique/{axe}/  → Créer une période (ADMIN only)
    axe ∈ {fonctions, categories, echelles}
    """

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]

    def _employee(self):
        employee = resolve_employee(self.kwargs['emp_id'])
        if not self.request.user.can_access_employee(employee):
            raise Http404
        return employee

    def _axe_config(self):
        axe = self.kwargs['axe']
        if axe not in HISTORIQUE_AXES:
            raise Http404
        return HISTORIQUE_AXES[axe]

    def get_serializer_class(self):
        return self._axe_config()[1]

    def get_queryset(self):
        model, _ = self._axe_config()
        return model.objects.filter(employee=self._employee())

    def perform_create(self, serializer):
        model, _ = self._axe_config()
        employee = self._employee()
        _check_no_overlap(
            model, employee,
            serializer.validated_data['date_debut'],
            serializer.validated_data.get('date_fin'),
        )
        instance = serializer.save(employee=employee, created_by=self.request.user)
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=employee,
            details={'action': f'historique_{self.kwargs["axe"]}_create', 'periode_id': str(instance.pk)}
        )


class HistoriqueDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/historique/{axe}/{pk}/  (ADMIN only for write, ADMIN+CONSULTANT scopé for read)
    """

    def get_permissions(self):
        return [IsAdminOrConsultant()] if self.request.method == 'GET' else [IsAdmin()]

    def _axe_config(self):
        axe = self.kwargs['axe']
        if axe not in HISTORIQUE_AXES:
            raise Http404
        return HISTORIQUE_AXES[axe]

    def get_serializer_class(self):
        return self._axe_config()[1]

    def get_object(self):
        model, _ = self._axe_config()
        instance = get_object_or_404(model, pk=self.kwargs['pk'])
        if not self.request.user.can_access_employee(instance.employee):
            raise Http404
        return instance

    def perform_update(self, serializer):
        model, _ = self._axe_config()
        instance = serializer.instance
        _check_no_overlap(
            model, instance.employee,
            serializer.validated_data.get('date_debut', instance.date_debut),
            serializer.validated_data.get('date_fin', instance.date_fin),
            exclude_pk=instance.pk,
        )
        updated = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=updated.employee,
            details={'action': f'historique_{self.kwargs["axe"]}_update', 'periode_id': str(updated.pk)}
        )

    def perform_destroy(self, instance):
        employee = instance.employee
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=employee,
            details={'action': f'historique_{self.kwargs["axe"]}_delete', 'periode_id': str(instance.pk)}
        )
        instance.delete()
```

`DjangoValidationError` is already imported at the top of `views.py` (`from django.core.exceptions import ValidationError as DjangoValidationError`, per the existing import block) — DRF automatically turns a raised `DjangoValidationError` inside `perform_create`/`perform_update` into a 400 only if caught; since DRF does **not** auto-convert `django.core.exceptions.ValidationError` raised outside a serializer's `validate()`, raise `rest_framework.serializers.ValidationError` instead for the overlap check:

Replace `raise DjangoValidationError(...)` in `_check_no_overlap` with:

```python
from rest_framework.exceptions import ValidationError as DRFValidationError
...
            raise DRFValidationError(
                "Cette période chevauche une période existante pour cet axe."
            )
```

(Add `from rest_framework.exceptions import ValidationError as DRFValidationError` to the top of `views.py`.)

- [ ] **Step 5: Add URL routes**

In `backend/employees/urls.py`, import `HistoriqueListCreateView, HistoriqueDetailView` from `employees.views` and add:

```python
    path('employees/<str:emp_id>/historique/<str:axe>/', HistoriqueListCreateView.as_view(), name='historique-list'),
    path('historique/<str:axe>/<uuid:pk>/', HistoriqueDetailView.as_view(), name='historique-detail'),
```

(Place these near the `contrats` sub-resource routes, after the `documents` block.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_historique_carriere.py -v`
Expected: PASS (12 passed)

- [ ] **Step 7: Commit**

```bash
git add backend/employees/serializers.py backend/employees/views.py backend/employees/urls.py backend/tests/test_historique_carriere.py
git commit -m "feat(employees): endpoints CRUD manuels de l'historique de carrière"
```

---

### Task 5: Auto-tracking on Fonction/Catégorie change

**Files:**
- Modify: `backend/employees/views.py` (`EmployeeDetailView.perform_update`)
- Test: `backend/tests/test_historique_carriere.py` (extend)

**Interfaces:**
- Consumes: `HistoriqueFonction`, `HistoriqueCategorie` (Task 3), `EmployeeDetailView.perform_update` (existing, `backend/employees/views.py:250-288`)
- Produces: on `PATCH /api/employees/<id>/` with a changed `poste` or `categorie`, closes the current open period (`date_fin=today`) and opens a new one (`date_debut=today`), and adds `poste`/`categorie` entries into the existing `details['transfer']` dict of the `MODIFY_EMP` audit log.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_historique_carriere.py`:

```python
from datetime import date as date_cls
from audit.models import AuditLog


def employee_url(pk):
    return f"/api/employees/{pk}/"


@pytest.mark.django_db
class TestCarriereAutoTracking:
    def test_changing_poste_creates_new_periode_and_closes_old(self, admin_user, employee, poste):
        ancien_poste = employee.poste
        client = auth_client(admin_user)
        nouveau_poste = poste.__class__.objects.create(nom="Chef de service")
        resp = client.patch(employee_url(employee.pk), {"poste": str(nouveau_poste.id)}, format="json")
        assert resp.status_code == 200

        periodes = HistoriqueFonction.objects.filter(employee=employee).order_by('date_debut')
        assert periodes.count() == 2
        ancienne, nouvelle = periodes
        assert ancienne.poste_id == ancien_poste.id
        assert ancienne.date_fin == date_cls.today()
        assert nouvelle.poste_id == nouveau_poste.id
        assert nouvelle.date_debut == date_cls.today()
        assert nouvelle.date_fin is None

    def test_changing_poste_logs_transfer_detail(self, admin_user, employee, poste):
        client = auth_client(admin_user)
        nouveau_poste = poste.__class__.objects.create(nom="Chef de service")
        client.patch(employee_url(employee.pk), {"poste": str(nouveau_poste.id)}, format="json")
        log = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP, target_id=str(employee.pk)
        ).order_by('-timestamp').first()
        assert log.details["transfer"]["poste"] == {"de": poste.nom, "vers": "Chef de service"}

    def test_unchanged_poste_creates_no_periode(self, admin_user, employee):
        client = auth_client(admin_user)
        client.patch(employee_url(employee.pk), {"nom": employee.nom}, format="json")
        assert HistoriqueFonction.objects.filter(employee=employee).count() == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_historique_carriere.py -v -k AutoTracking`
Expected: FAIL — 0 `HistoriqueFonction` rows created

- [ ] **Step 3: Extend `perform_update`**

In `backend/employees/views.py`, modify `EmployeeDetailView.perform_update` (lines 250-288). Add a new class attribute and logic right after the existing `TRANSFER_FIELDS`/`changed` block, before the final `AuditLog.log(...)` call:

```python
    # Champs de progression de carrière — un changement crée une nouvelle
    # période dans l'historique dédié (voir HistoriqueFonction/Categorie),
    # en plus du diff générique.
    CARRIERE_AXES = {
        'poste': HistoriqueFonction,
        'categorie': HistoriqueCategorie,
    }

    def perform_update(self, serializer):
        instance = serializer.instance
        old_affectation = {
            field: (getattr(instance, field).nom if getattr(instance, field, None) else None)
            for field in self.TRANSFER_FIELDS
        }
        old_carriere = {
            field: getattr(instance, field)
            for field in self.CARRIERE_AXES
        }

        employee = serializer.save()

        details = {}
        for k, v in serializer.validated_data.items():
            if hasattr(v, 'isoformat'):
                details[k] = v.isoformat()
            elif hasattr(v, 'pk'):
                details[k] = str(v.pk)
            else:
                details[k] = str(v) if v is not None else None

        new_affectation = {
            field: (getattr(employee, field).nom if getattr(employee, field, None) else None)
            for field in self.TRANSFER_FIELDS
        }
        changed = {
            field: {'de': old_affectation[field], 'vers': new_affectation[field]}
            for field in self.TRANSFER_FIELDS
            if field in serializer.validated_data and old_affectation[field] != new_affectation[field]
        }

        today = date_cls.today()
        for field, model in self.CARRIERE_AXES.items():
            if field not in serializer.validated_data:
                continue
            new_value = getattr(employee, field)
            old_value = old_carriere[field]
            if (old_value.pk if old_value else None) == (new_value.pk if new_value else None):
                continue
            model.objects.filter(
                employee=employee, date_fin__isnull=True
            ).update(date_fin=today)
            if new_value is not None:
                model.objects.create(
                    employee=employee, date_debut=today,
                    created_by=self.request.user,
                    **{field: new_value},
                )
            changed[field] = {
                'de': old_value.nom if old_value else None,
                'vers': new_value.nom if new_value else None,
            }

        if changed:
            details['transfer'] = changed

        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP,
            target=employee,
            details=details
        )
```

Add `from datetime import date as date_cls` and `from employees.models import HistoriqueFonction, HistoriqueCategorie` (merge into the existing model import block) at the top of `views.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_historique_carriere.py -v`
Expected: PASS (all tests including the 3 new ones)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && pytest`
Expected: PASS (no regressions — pay attention to `test_employees_views.py::test_patch_service_logs_transfer_detail`-style tests still passing, since `changed` dict construction was restructured)

- [ ] **Step 6: Commit**

```bash
git add backend/employees/views.py backend/tests/test_historique_carriere.py
git commit -m "feat(employees): auto-tracking de l'historique Fonction/Catégorie à la modification"
```

---

### Task 6: Échelles tab in `Parametres.jsx`

**Files:**
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: `frontend/src/__tests__/Parametres.test.jsx`

**Interfaces:**
- Consumes: `GET/POST /api/ref/echelles/`, `GET/PATCH/DELETE /api/ref/echelles/<uuid>/` (Task 2)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/Parametres.test.jsx` (mirror an existing "Catégories" tab test in the same file — locate it first and copy its shape):

```jsx
test("affiche l'onglet Échelles et liste les échelles existantes", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/ref/echelles/") {
      return Promise.resolve({ data: { results: [{ id: "e1", nom: "Échelle 10", description: "", is_active: true }] } });
    }
    return Promise.resolve({ data: { results: [] } });
  });
  renderParametres();
  fireEvent.click(await screen.findByText("Échelles"));
  expect(await screen.findByText("Échelle 10")).toBeInTheDocument();
});
```

Adjust `renderParametres()`/mock shape to match whatever helper/mock pattern the existing tests in this file already use (check the top of the file for the render helper and `api` mock setup before writing this — the snippet above assumes `jest.mock('../services/api')`-style mocking already present for other tabs; align exactly with that).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres.test.jsx`
Expected: FAIL — "Échelles" text not found

- [ ] **Step 3: Add the tab**

In `frontend/src/pages/Parametres.jsx`:
1. In the `TABS` array (around line 363-375), add after `categories`:

```jsx
  { key: "echelles", label: "Échelles" },
```

2. In `REF_COLUMNS_INFO` (around line 384-410), add:

```jsx
  echelles: { obligatoires: ["nom"], optionnelles: ["description"] },
```

No changes needed to `IMPORT_UNSUPPORTED_TABS` or `sortableTab` — `echelles` behaves like `categories` by default (sortable, import supported) since those are opt-out sets that don't include it.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres.test.jsx`
Expected: PASS

- [ ] **Step 5: Manually verify in the browser**

Start the dev servers (`cd backend && python manage.py runserver`, `cd frontend && npm start`), log in as ADMIN, go to `/parametres`, click "Échelles", add one, confirm it appears in the table, download the template, delete it.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Parametres.jsx frontend/src/__tests__/Parametres.test.jsx
git commit -m "feat(parametres): onglet Échelles"
```

---

### Task 7: "Carrière" tab in `EmployeeDetail.jsx` — read-only timeline

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `GET /api/employees/<id>/historique/fonctions/`, `/historique/categories/`, `/historique/echelles/` (Task 4), existing `contrats` state (already fetched via `fetchContrats()`)
- Produces: new tab `carriere` in the tab bar; `historiqueFonctions`, `historiqueCategories`, `historiqueEchelles` state; `fetchHistorique(silent = false)`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/EmployeeDetail.test.jsx` (locate the existing render helper/mocks for this file first and match its exact style):

```jsx
test("affiche l'onglet Carrière avec l'historique Fonction", async () => {
  api.get.mockImplementation((url) => {
    if (url === `/employees/emp1/historique/fonctions/`) {
      return Promise.resolve({ data: [{ id: "h1", poste_nom: "Agent", date_debut: "2016-01-01", date_fin: "2025-12-31" }] });
    }
    if (url === `/employees/emp1/historique/categories/`) return Promise.resolve({ data: [] });
    if (url === `/employees/emp1/historique/echelles/`) return Promise.resolve({ data: [] });
    return defaultMockFor(url); // reuse whatever the file's existing default mock helper is called
  });
  renderEmployeeDetail(); // reuse the file's existing render helper
  fireEvent.click(await screen.findByText("Carrière"));
  expect(await screen.findByText(/Agent/)).toBeInTheDocument();
});
```

Before writing this, read the top of `frontend/src/__tests__/EmployeeDetail.test.jsx` to find the actual mock/render helper names and the employee id used in its fixtures (likely not literally `emp1` — match whatever's already there), and rewrite the snippet to use the file's real helpers rather than the placeholder names shown above.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: FAIL — "Carrière" tab not found

- [ ] **Step 3: Add state, fetch, tab entry and content block**

In `frontend/src/pages/EmployeeDetail.jsx`:

1. Add state near the other tab-data state (`contrats`, around line 78):

```jsx
const [historiqueFonctions, setHistoriqueFonctions] = useState([]);
const [historiqueCategories, setHistoriqueCategories] = useState([]);
const [historiqueEchelles, setHistoriqueEchelles] = useState([]);
```

2. Add a fetch function near `fetchContrats` (follow the same `silent` pattern as `fetchEmployee`, per Global Constraints):

```jsx
const fetchHistorique = async (silent = false) => {
  try {
    const [fonctions, categories, echelles] = await Promise.all([
      api.get(`/employees/${id}/historique/fonctions/`),
      api.get(`/employees/${id}/historique/categories/`),
      api.get(`/employees/${id}/historique/echelles/`),
    ]);
    setHistoriqueFonctions(fonctions.data);
    setHistoriqueCategories(categories.data);
    setHistoriqueEchelles(echelles.data);
  } catch (err) {
    console.error(err);
  }
};
```

3. In the mount `useEffect` (around line 114-117), add `fetchHistorique();` alongside `fetchContrats();`.

4. In the tab array (around line 730-735), add:

```jsx
    { key: "carriere", label: "Carrière" },
```

5. After the existing `{activeTab === "contrats" && (...)}` block, add a new block:

```jsx
{activeTab === "carriere" && (
  <div
    className="tab-content"
    style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: 24,
    }}
  >
    {[
      { title: "Fonction", data: historiqueFonctions, labelKey: "poste_nom" },
      { title: "Catégorie", data: historiqueCategories, labelKey: "categorie_nom" },
      { title: "Échelle", data: historiqueEchelles, labelKey: "echelle_nom" },
    ].map((axe) => (
      <div key={axe.title} style={{ marginBottom: 28 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            color: theme.textSecondary,
            marginBottom: 10,
            borderLeft: `4px solid ${theme.primary}`,
            paddingLeft: 8,
          }}
        >
          {axe.title}
        </div>
        {axe.data.length === 0 ? (
          <div style={{ color: theme.textSecondary, fontSize: 13 }}>
            Aucun historique renseigné.
          </div>
        ) : (
          [...axe.data]
            .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
            .map((periode) => (
              <div
                key={periode.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: 8,
                  marginBottom: 6,
                  background: periode.date_fin ? theme.surface : theme.primaryBg,
                  border: `1px solid ${periode.date_fin ? theme.border : theme.primaryBorder}`,
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{periode[axe.labelKey]}</span>
                <span style={{ fontSize: 12, color: theme.textSecondary }}>
                  {periode.date_debut} → {periode.date_fin || "en cours"}
                </span>
              </div>
            ))
        )}
      </div>
    ))}
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          color: theme.textSecondary,
          marginBottom: 10,
          borderLeft: `4px solid ${theme.primary}`,
          paddingLeft: 8,
        }}
      >
        Contrats
      </div>
      {contrats.length === 0 ? (
        <div style={{ color: theme.textSecondary, fontSize: 13 }}>
          Aucun contrat.
        </div>
      ) : (
        [...contrats]
          .sort((a, b) => new Date(b.date_debut) - new Date(a.date_debut))
          .map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/contrats/${c.id}`)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                marginBottom: 6,
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                cursor: "pointer",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {c.numero_contrat} — {c.type_contrat_nom || "—"}
              </span>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>
                {c.date_debut || "—"} → {c.date_fin || "en cours"}
              </span>
            </div>
          ))
      )}
    </div>
  </div>
)}
```

Verify the `Contrat` list serializer field name for the linked type (`type_contrat_nom` above is a guess) by checking `ContratSerializer` in `backend/employees/serializers.py` before finalizing this block — use whatever field it actually exposes (e.g. it may already be `type_contrat_nom` following the same `_nom` convention as `poste_nom`/`categorie_nom`/`echelle_nom` added in Task 4, or a nested `type_contrat: {nom: ...}` — adjust the JSX accordingly).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: PASS

- [ ] **Step 5: Manually verify in the browser**

Open an employee's fiche, click "Carrière", confirm the 4 sections render (even empty), confirm a contract row navigates to `/contrats/:id`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(employee-detail): onglet Carrière (timeline Fonction/Catégorie/Échelle/Contrats)"
```

---

### Task 8: "Gérer l'historique" modal (ADMIN manual CRUD)

**Files:**
- Modify: `frontend/src/pages/EmployeeDetail.jsx`
- Test: `frontend/src/__tests__/EmployeeDetail.test.jsx`

**Interfaces:**
- Consumes: `POST/PATCH/DELETE /api/employees/<id>/historique/<axe>/` and `/api/historique/<axe>/<pk>/` (Task 4), `useConfirm()` (existing), `fetchHistorique(true)` (Task 7, silent refresh)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/EmployeeDetail.test.jsx`:

```jsx
test("un ADMIN peut ajouter une période via 'Gérer l'historique'", async () => {
  api.get.mockImplementation(mockGetFor); // reuse the file's existing mock setup, extended for /historique/ routes returning []
  api.post.mockResolvedValue({ data: { id: "new1" } });
  renderEmployeeDetail({ role: "ADMIN" }); // match whatever the file's helper takes to set the current user's role
  fireEvent.click(await screen.findByText("Carrière"));
  fireEvent.click(await screen.findByText("Gérer l'historique"));
  fireEvent.click(await screen.findByText(/Ajouter une période/i));
  // fill the minimal required fields and submit — match the actual form control labels once written in Step 3
  expect(api.post).toHaveBeenCalled();
});
```

This test's exact selectors depend on the modal markup written in Step 3 — write Step 3 first if the selectors are unclear, then align this test's `getByLabelText`/`getByText` calls to the real rendered labels before running it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: FAIL — "Gérer l'historique" button not found

- [ ] **Step 3: Add the modal**

In `frontend/src/pages/EmployeeDetail.jsx`, add state for the modal:

```jsx
const [managingAxe, setManagingAxe] = useState(null); // 'fonctions' | 'categories' | 'echelles' | null
const [newPeriode, setNewPeriode] = useState({ valeur: "", date_debut: "", date_fin: "" });
```

Add a button inside the "Carrière" tab block from Task 7 (ADMIN only), right after the axes loop and before the Contrats section:

```jsx
{user?.role === "ADMIN" && (
  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
    {[
      { axe: "fonctions", label: "Gérer l'historique Fonction" },
      { axe: "categories", label: "Gérer l'historique Catégorie" },
      { axe: "echelles", label: "Gérer l'historique Échelle" },
    ].map((a) => (
      <button
        key={a.axe}
        onClick={() => setManagingAxe(a.axe)}
        className="btn-lift"
        style={{
          background: theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {a.label}
      </button>
    ))}
  </div>
)}
```

Add the modal itself (near the other modals in this file, e.g. next to `ScanImportModal` usage), including a value dropdown sourced from the matching referentiel list (`postes`, `categories` state — already loaded elsewhere in this file for the edit form; `echelles` needs a new fetch on mount if not already present — add `const [echelles, setEchelles] = useState([]);` and load it via `api.get("/ref/echelles/")` in the mount `useEffect` alongside `fetchTypesContrat`):

```jsx
{managingAxe && (
  <div
    style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}
    onClick={() => setManagingAxe(null)}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: theme.surface, borderRadius: 12, padding: 24,
        width: 480, maxHeight: "80vh", overflowY: "auto",
      }}
    >
      <h3 style={{ margin: "0 0 16px" }}>
        Historique — {managingAxe === "fonctions" ? "Fonction" : managingAxe === "categories" ? "Catégorie" : "Échelle"}
      </h3>

      {(managingAxe === "fonctions" ? historiqueFonctions
        : managingAxe === "categories" ? historiqueCategories
        : historiqueEchelles
      ).map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${theme.border}` }}>
          <span style={{ fontSize: 13 }}>
            {p.poste_nom || p.categorie_nom || p.echelle_nom} ({p.date_debut} → {p.date_fin || "en cours"})
          </span>
          <button
            onClick={async () => {
              if (!(await confirm("Supprimer cette période ?"))) return;
              await api.delete(`/historique/${managingAxe}/${p.id}/`);
              fetchHistorique(true);
            }}
            style={{ background: "none", border: "none", color: theme.danger, cursor: "pointer", fontSize: 12 }}
          >
            Supprimer
          </button>
        </div>
      ))}

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Ajouter une période</div>
        <select
          aria-label="Valeur"
          value={newPeriode.valeur}
          onChange={(e) => setNewPeriode({ ...newPeriode, valeur: e.target.value })}
          style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 6, border: `1px solid ${theme.border}` }}
        >
          <option value="">-- Sélectionner --</option>
          {(managingAxe === "fonctions" ? postes : managingAxe === "categories" ? categories : echelles).map((v) => (
            <option key={v.id} value={v.id}>{v.nom}</option>
          ))}
        </select>
        <input
          aria-label="Date début"
          type="date"
          value={newPeriode.date_debut}
          onChange={(e) => setNewPeriode({ ...newPeriode, date_debut: e.target.value })}
          style={{ width: "100%", padding: 8, marginBottom: 8, borderRadius: 6, border: `1px solid ${theme.border}` }}
        />
        <input
          aria-label="Date fin"
          type="date"
          value={newPeriode.date_fin}
          onChange={(e) => setNewPeriode({ ...newPeriode, date_fin: e.target.value })}
          style={{ width: "100%", padding: 8, marginBottom: 12, borderRadius: 6, border: `1px solid ${theme.border}` }}
        />
        <button
          onClick={async () => {
            const fieldName = managingAxe === "fonctions" ? "poste" : managingAxe === "categories" ? "categorie" : "echelle";
            await api.post(`/employees/${id}/historique/${managingAxe}/`, {
              [fieldName]: newPeriode.valeur,
              date_debut: newPeriode.date_debut,
              date_fin: newPeriode.date_fin || null,
            });
            setNewPeriode({ valeur: "", date_debut: "", date_fin: "" });
            fetchHistorique(true);
          }}
          disabled={!newPeriode.valeur || !newPeriode.date_debut}
          className="btn-lift"
          style={{
            background: theme.primary, color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 16px", fontWeight: 600, cursor: "pointer", width: "100%",
          }}
        >
          Ajouter une période
        </button>
      </div>

      <button
        onClick={() => setManagingAxe(null)}
        style={{ marginTop: 16, background: "none", border: "none", color: theme.textSecondary, cursor: "pointer", fontSize: 12 }}
      >
        Fermer
      </button>
    </div>
  </div>
)}
{ConfirmDialog}
```

(`{ConfirmDialog}` may already be rendered once elsewhere in the component from `useConfirm()` — don't duplicate it; only add if it isn't already present in the JSX tree.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- EmployeeDetail.test.jsx`
Expected: PASS

- [ ] **Step 5: Manually verify in the browser**

As ADMIN, open an employee, "Carrière" tab, click "Gérer l'historique Fonction", add a period with `date_debut`/`date_fin` in the past, confirm it appears in both the modal and the read-only timeline after closing, delete it, confirm removal.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/EmployeeDetail.jsx frontend/src/__tests__/EmployeeDetail.test.jsx
git commit -m "feat(employee-detail): gestion manuelle de l'historique de carrière (ADMIN)"
```

---

### Task 9: Extend transfer confirmation + audit log formatting for Fonction/Catégorie

**Files:**
- Modify: `frontend/src/pages/EmployeeForm.jsx`
- Modify: `frontend/src/pages/AuditLogs.jsx`
- Test: `frontend/src/__tests__/EmployeeForm.test.jsx`

**Interfaces:**
- Consumes: `details.transfer.poste`/`details.transfer.categorie` (Task 5, backend now includes these keys)

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/EmployeeForm.test.jsx` (mirror the existing transfer-confirmation test for `service`/`direction` in the same file):

```jsx
test("modifier la Fonction déclenche la modale de confirmation de transfert", async () => {
  // reuse the file's existing setup for editing an employee with a known originalAffectation
  // change form.poste to a different value, submit, expect the confirm() modal text to mention the poste change
  // follow the exact pattern of the file's existing "modifier le Service déclenche..." test
});
```

Locate that existing test in the file first and copy its structure exactly, swapping `service`/`direction` for `poste`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- EmployeeForm.test.jsx`
Expected: FAIL — confirmation summary doesn't mention the Fonction change

- [ ] **Step 3: Extend the confirmation logic**

In `frontend/src/pages/EmployeeForm.jsx`, in `handleSubmit` (lines 322-368), change the `changedFields` filter list:

```jsx
    const changedFields = [
      "direction",
      "departement",
      "service",
      "cellule",
      "section",
      "poste",
      "categorie",
    ].filter(
      (field) => (form[field] || "") !== (originalAffectation[field] || ""),
    );
```

`originalAffectation` (state, line 162) and its population point (wherever it's set from `fetchEmployee`'s response, likely including `poste`/`categorie` already since it snapshots the loaded employee — verify this before assuming; if `originalAffectation` is built from an explicit field list rather than the full employee object, add `poste: employee.poste`, `categorie: employee.categorie` to that construction) must include `poste`/`categorie`. `affectationLabel(field, value)` (lines 307-320) resolves an id to a `.nom` via a `listByField` map — add `poste: postes` and `categorie: categories` to that map if it's a static object (it likely already has `postes`/`categories` state loaded for the form's own dropdowns, so this is just adding two keys to the existing lookup map).

- [ ] **Step 4: Extend `AuditLogs.jsx` formatting**

In `frontend/src/pages/AuditLogs.jsx`, find `TRANSFER_FIELD_LABELS` (defined just above `formatTransfer`, per the earlier report) and add:

```jsx
  poste: "Fonction",
  categorie: "Catégorie",
```

No change needed to `formatTransfer()` itself — it already iterates generically over whatever keys are present in `details.transfer`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test -- EmployeeForm.test.jsx AuditLogs.test.jsx`
Expected: PASS (check whether `AuditLogs.test.jsx` exists; if not, skip running it — the label-map addition needs no new test since `formatTransfer` is already covered generically by existing tests)

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/EmployeeForm.jsx frontend/src/pages/AuditLogs.jsx frontend/src/__tests__/EmployeeForm.test.jsx
git commit -m "feat(employee-form): inclut Fonction/Catégorie dans la confirmation de transfert et le journal d'audit"
```

---

### Task 10: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && pytest`
Expected: all tests PASS (188 pre-existing + new ones from Tasks 1-5)

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: all tests PASS (261+ pre-existing + new ones from Tasks 6-9)

- [ ] **Step 3: Manual smoke test in the browser**

Start both servers, log in as ADMIN:
1. `/parametres` → "Échelles" → create "Échelle 5" and "Échelle 10".
2. Open an employee → edit → change Fonction and Catégorie → confirm the transfer modal mentions both → save.
3. Reopen the employee → "Carrière" tab → confirm the new Fonction/Catégorie period shows "en cours" and the old one shows the correct end date.
4. "Gérer l'historique Échelle" → add a retroactive period (e.g. 2020-01-01 → 2022-12-31) → close modal → confirm it appears in the read-only timeline.
5. `/audit` → confirm the Fonction/Catégorie change appears with French labels ("Fonction : ... → ...").

- [ ] **Step 4: Update `securite.md` if any permission-relevant surface was touched**

Check `securite.md` at the repo root — if the new endpoints (`/ref/echelles/`, `/employees/<id>/historique/<axe>/`, `/historique/<axe>/<pk>/`) introduce a genuinely new permission pattern, add an entry; if they're a straightforward reuse of `IsAdmin`/`IsAdminOrConsultant` + `can_access_employee` (which they are, per this plan), no new entry is required — confirm this reasoning holds by re-reading `securite.md`'s existing entries for similar sub-resource endpoints (e.g. the Contrat endpoints) before skipping.

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: ajustements suite au test de régression historique de carrière"
```

(Only if Steps 1-4 surfaced something to fix — otherwise no commit needed here.)

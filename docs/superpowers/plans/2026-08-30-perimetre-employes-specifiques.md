# Périmètre CONSULTANT — employés spécifiques — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un ADMIN d'accorder à un compte CONSULTANT un accès ponctuel à un ou plusieurs employés précis — dossier complet ou un seul type de document — en plus de son périmètre organisationnel existant.

**Architecture:** Nouveau modèle `EmployeeAccessGrant` (employees/models.py) reliant `User` ↔ `Employee` (+ `TypeDocument` optionnel). La logique d'accès existante sur `User` (`employee_scope_q`, `can_access_employee`, `document_type_scope_q`, `can_access_document_type`) est étendue (pas remplacée) pour OR-er avec ces grants. Nouvel endpoint `GET/PUT /api/admin-users/<id>/employee-grants/` (remplacement complet, même pattern que le périmètre organisationnel actuel). Frontend : 3ᵉ section dans la modale "Périmètre" existante de `/users`.

**Tech Stack:** Django 4.2 / DRF 3.15 (backend), React 19 (frontend), pytest (tests backend), Jest (tests frontend — pas couvert par ce plan, voir "Hors scope").

## Global Constraints

- Styles frontend 100% inline (`style={{}}`), tokens `theme.js` — jamais de hex en dur.
- Toute vue listant/retrouvant des employés, documents ou contrats doit appliquer le scoping (voir `CLAUDE.md`).
- Pas de `window.confirm`/`window.prompt` — utiliser `useConfirm()`/`usePrompt()` si une confirmation est nécessaire (ce chantier n'en introduit pas de nouvelle).
- Un grant ne peut jamais référencer un `TypeDocument` qui est une catégorie (`is_categorie=True`).
- Un grant `type_doc` précis ne couvre que le dossier général de l'employé (`EmployeeDocument.contrat=None`), jamais les documents de contrat — seul un grant "dossier complet" (`type_doc=None`) couvre aussi les contrats.
- `securite.md` doit être mis à jour (nouveau point) car ce chantier touche les permissions d'accès aux documents.

---

### Task 1: Modèle `EmployeeAccessGrant` + migration

**Files:**
- Modify: `backend/employees/models.py` (ajouter la classe, en fin de fichier)
- Create: `backend/employees/migrations/0015_employeeaccessgrant.py`
- Test: `backend/tests/test_employee_access_grants.py`

**Interfaces:**
- Produces: `EmployeeAccessGrant(user, employee, type_doc, granted_by, granted_at)` — `type_doc=None` signifie "dossier complet".

- [ ] **Step 1: Écrire le modèle**

Ajouter à la fin de `backend/employees/models.py` :

```python
class EmployeeAccessGrant(models.Model):
    """
    Périmètre CONSULTANT ponctuel — donne accès à UN employé précis, en plus
    (union) du périmètre organisationnel de l'utilisateur (voir
    User.employee_scope_q()). type_doc=None = dossier complet de cet
    employé ; type_doc=<X> = uniquement les documents de ce type, dans le
    dossier général de l'employé (jamais les documents de contrat — un
    grant "dossier complet" est nécessaire pour couvrir aussi les
    contrats).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='employee_grants'
    )
    employee = models.ForeignKey(
        'Employee', on_delete=models.CASCADE, related_name='access_grants'
    )
    type_doc = models.ForeignKey(
        'TypeDocument', null=True, blank=True, on_delete=models.CASCADE
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name='+'
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'employee', 'type_doc')
        verbose_name = "Accès employé spécifique"
        verbose_name_plural = "Accès employés spécifiques"

    def __str__(self):
        cible = self.type_doc.nom if self.type_doc_id else "dossier complet"
        return f"{self.user.username} → {self.employee.matricule} ({cible})"
```

Vérifier que `from django.conf import settings` est déjà importé en haut de
`backend/employees/models.py` (déjà utilisé par les FK `uploaded_by`
existantes) — sinon l'ajouter.

- [ ] **Step 2: Générer et vérifier la migration**

Run: `cd backend && python manage.py makemigrations employees`
Expected: crée `employees/migrations/0015_employeeaccessgrant.py` (le
nom peut varier légèrement, ex. `0015_employeeaccessgrant`).

- [ ] **Step 3: Appliquer la migration**

Run: `cd backend && python manage.py migrate employees`
Expected: `Applying employees.0015_employeeaccessgrant... OK`

- [ ] **Step 4: Écrire un test de création basique**

Créer `backend/tests/test_employee_access_grants.py` :

```python
"""
Tests — périmètre CONSULTANT "employés spécifiques" (EmployeeAccessGrant)
et son intégration dans User.employee_scope_q / can_access_employee /
accessible_type_doc_ids_for_employee / can_access_document.
"""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from employees.models import (
    Direction, Departement, Service, EmployeeAccessGrant, TypeDocument,
)

pytestmark = pytest.mark.django_db

User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_direction(db):
    return Direction.objects.create(nom="Direction Autre", code="DA")


@pytest.fixture
def other_departement(db, other_direction):
    return Departement.objects.create(nom="Logistique", direction=other_direction, code="LOG")


@pytest.fixture
def other_service(db, other_departement):
    return Service.objects.create(nom="Transport", departement=other_departement)


@pytest.fixture
def scoped_consultant(db):
    return User.objects.create_user(
        username="grant_consultant",
        password="ScopedPass123!",
        nom="Grant",
        prenom="Test",
        role="CONSULTANT",
        consent_loi1807_accepted_at=timezone.now(),
    )


class TestEmployeeAccessGrantModel:
    def test_create_full_dossier_grant(self, scoped_consultant, employee):
        grant = EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert grant.type_doc_id is None

    def test_create_type_specific_grant(self, scoped_consultant, employee, type_doc_obligatoire):
        grant = EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert grant.type_doc_id == type_doc_obligatoire.id
```

- [ ] **Step 5: Lancer les tests**

Run: `cd backend && pytest tests/test_employee_access_grants.py -v`
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/employees/models.py backend/employees/migrations/ backend/tests/test_employee_access_grants.py
git commit -m "feat(employees): modèle EmployeeAccessGrant pour le périmètre par employé spécifique"
```

---

### Task 2: Logique d'accès sur `User` (accounts/models.py)

**Files:**
- Modify: `backend/accounts/models.py:162-199` (méthodes `employee_scope_q` / `can_access_employee`), et zone après `document_type_scope_q`/`can_access_document_type` (lignes 280-298)
- Test: `backend/tests/test_employee_access_grants.py` (compléter)

**Interfaces:**
- Consumes: `EmployeeAccessGrant` (Task 1).
- Produces (utilisés par Task 3 et Task 4) :
  - `User.employee_scope_q(prefix='')` — **comportement étendu**, OR avec les employés ayant un grant.
  - `User.can_access_employee(employee)` — **étendu** pareil.
  - `User.accessible_type_doc_ids_for_employee(employee, contrat_scope=False)` → `None` (tous les types visibles) ou `set` d'UUID de `TypeDocument` autorisés, pour CET employé précis. `contrat_scope=True` ignore les grants type_doc précis (qui ne couvrent que le dossier général).
  - `User.can_access_document(employee, type_doc_id, contrat_scope=False)` → `bool`, combine `can_access_employee` + `accessible_type_doc_ids_for_employee`.

- [ ] **Step 1: Écrire les tests (rouges) sur `employee_scope_q`/`can_access_employee` étendus**

Ajouter à `backend/tests/test_employee_access_grants.py` :

```python
class TestEmployeeScopeQWithGrants:
    def test_grant_gives_access_outside_org_scope(self, scoped_consultant, employee, other_service):
        """Un grant rend l'employé visible même hors du périmètre organisationnel."""
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.can_access_employee(employee) is False
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.can_access_employee(employee) is True

    def test_grant_reflected_in_employee_scope_q(self, scoped_consultant, employee, other_service):
        from employees.models import Employee
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert Employee.objects.filter(scoped_consultant.employee_scope_q()).filter(pk=employee.pk).exists()

    def test_partial_type_grant_still_grants_employee_visibility(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert scoped_consultant.can_access_employee(employee) is True


class TestAccessibleTypeDocIdsForEmployee:
    def test_admin_unrestricted(self, admin_user, employee):
        assert admin_user.accessible_type_doc_ids_for_employee(employee) is None

    def test_org_scope_no_type_restriction(self, scoped_consultant, employee, service):
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) is None

    def test_full_dossier_grant_unrestricted(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) is None

    def test_partial_grant_restricts_to_granted_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        ids = scoped_consultant.accessible_type_doc_ids_for_employee(employee)
        assert ids == {type_doc_obligatoire.id}

    def test_partial_grant_ignored_in_contrat_scope(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire
    ):
        """Un grant type_doc précis ne couvre pas les documents de contrat."""
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        ids = scoped_consultant.accessible_type_doc_ids_for_employee(employee, contrat_scope=True)
        assert ids == set()

    def test_full_grant_unrestricted_in_contrat_scope(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee, contrat_scope=True) is None

    def test_no_access_at_all_gives_empty_set(self, scoped_consultant, employee, other_service):
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.accessible_type_doc_ids_for_employee(employee) == set()


class TestCanAccessDocument:
    def test_org_scope_and_global_type_scope(self, scoped_consultant, employee, service, type_doc_obligatoire):
        scoped_consultant.scope_services.set([service])
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is True

    def test_no_access_outside_scope_and_grants(self, scoped_consultant, employee, other_service, type_doc_obligatoire):
        scoped_consultant.scope_services.set([other_service])
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is False

    def test_partial_grant_allows_only_that_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        scoped_consultant.scope_services.set([other_service])
        EmployeeAccessGrant.objects.create(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        )
        assert scoped_consultant.can_access_document(employee, type_doc_obligatoire.id) is True
        assert scoped_consultant.can_access_document(employee, type_doc_facultatif.id) is False
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_employee_access_grants.py -v`
Expected: FAIL — `AttributeError: 'User' object has no attribute 'accessible_type_doc_ids_for_employee'` (les tests `TestEmployeeScopeQWithGrants` échouent aussi, l'extension n'existe pas encore).

- [ ] **Step 3: Étendre `employee_scope_q` et `can_access_employee`**

Dans `backend/accounts/models.py`, remplacer les méthodes lignes 162-199 :

```python
    def _granted_employee_ids(self):
        """IDs des employés avec au moins un EmployeeAccessGrant pour ce
        compte (dossier complet ou type précis confondus) — set vide si
        aucun grant ou pour ADMIN."""
        if self.is_admin or not self.pk:
            return set()
        return set(self.employee_grants.values_list('employee_id', flat=True))

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

    def employee_scope_q(self, prefix=''):
        """
        Q object à appliquer sur un queryset Employee (ou tout modèle relié à
        Employee via `prefix`, ex. prefix='employee__' pour un queryset
        Contrat) pour restreindre au périmètre de cet utilisateur — union du
        périmètre organisationnel (directions/pôles/départements/services/
        cellules) ET des employés ayant un accès ponctuel accordé
        (EmployeeAccessGrant, voir _granted_employee_ids). Q() vide = accès
        non restreint (ADMIN, ou CONSULTANT sans périmètre ni grant — comportement
        historique préservé).
        """
        q = self._org_employee_scope_q(prefix=prefix)
        granted_ids = self._granted_employee_ids()
        if not granted_ids:
            return q
        grant_q = Q(**{f'{prefix}id__in': granted_ids})
        return q | grant_q if q.children else grant_q

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

    def can_access_employee(self, employee):
        """Vérification objet-par-objet équivalente à employee_scope_q() :
        périmètre organisationnel OU accès ponctuel accordé pour cet
        employé précis."""
        if self._org_can_access_employee(employee):
            return True
        return employee.id in self._granted_employee_ids()
```

Remplace tout le bloc de `_scope_ids` jusqu'à `can_access_employee` inclus
(garder `_scope_ids` et `has_scope_restriction` tels quels, juste
avant/après). `_org_employee_scope_q`/`_org_can_access_employee` sont de
nouvelles méthodes privées ; `employee_scope_q`/`can_access_employee`
existantes sont remplacées par les versions étendues ci-dessus.

**Piège Q() vide** : `Q()` a `.children == []` — `q | grant_q` sur un `Q()`
vide fonctionne correctement en Django (OR avec Q() vide restreindrait à
tort si on ne testait pas `q.children`, car `Q() | Q(x=1)` donne bien
`Q(x=1)` en pratique — mais on garde le test explicite `if q.children`
pour la lisibilité et éviter toute dépendance à ce détail interne
non-documenté de l'API Django).

- [ ] **Step 4: Ajouter `accessible_type_doc_ids_for_employee` et `can_access_document`**

Dans `backend/accounts/models.py`, juste après `can_access_document_type`
(fin de la méthode actuelle ligne ~298), ajouter :

```python
    def _granted_type_doc_ids_for_employee(self, employee_id):
        """(full_dossier: bool, type_doc_ids: set) pour un employé donné.
        full_dossier=True si un grant type_doc=None existe (couvre tout,
        type_doc_ids est alors ignorable)."""
        if self.is_admin or not self.pk:
            return True, set()
        rows = self.employee_grants.filter(employee_id=employee_id).values_list('type_doc_id', flat=True)
        rows = list(rows)
        if any(r is None for r in rows):
            return True, set()
        return False, set(rows)

    def accessible_type_doc_ids_for_employee(self, employee, contrat_scope=False):
        """
        IDs des TypeDocument visibles pour CET employé précis, en tenant
        compte du périmètre organisationnel + type global (comme
        document_type_scope_q()) ET des grants ponctuels
        (EmployeeAccessGrant) pour cet employé. Retourne None = tous les
        types visibles (pas de restriction), sinon un set d'ids (peut être
        vide = aucun document visible pour cet employé).

        contrat_scope=True : ignore les grants type_doc précis (qui ne
        couvrent que le dossier général, jamais les documents de contrat) —
        seul un grant dossier complet (type_doc=None) ou le périmètre
        global s'applique alors.
        """
        if self.is_admin:
            return None
        org_ok = self._org_can_access_employee(employee)
        global_type_ids = self._type_doc_scope_ids()
        full, grant_type_ids = self._granted_type_doc_ids_for_employee(employee.id)
        if full:
            return None
        if org_ok and not global_type_ids:
            return None
        allowed = set(global_type_ids) if org_ok else set()
        if not contrat_scope:
            allowed |= grant_type_ids
        return allowed

    def can_access_document(self, employee, type_doc_id, contrat_scope=False):
        """Vérification objet-par-objet combinant can_access_employee() et
        accessible_type_doc_ids_for_employee() — à utiliser à la place du
        couple can_access_employee()+can_access_document_type() partout où
        les grants ponctuels doivent s'appliquer (accès à un document
        précis)."""
        if not self.can_access_employee(employee):
            return False
        ids = self.accessible_type_doc_ids_for_employee(employee, contrat_scope=contrat_scope)
        return ids is None or type_doc_id in ids
```

- [ ] **Step 5: Lancer les tests**

Run: `cd backend && pytest tests/test_employee_access_grants.py tests/test_employee_scoping.py tests/test_accounts_models.py -v`
Expected: tous PASS (les tests existants de `test_employee_scoping.py` ne
doivent pas régresser — `employee_scope_q`/`can_access_employee` gardent
leur comportement pour les comptes sans grant).

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/models.py backend/tests/test_employee_access_grants.py
git commit -m "feat(accounts): étend le scoping pour les grants employé spécifique (EmployeeAccessGrant)"
```

---

### Task 3: Endpoint ADMIN de gestion des grants

**Files:**
- Modify: `backend/accounts/admin_views.py` (ajouter la vue + serializer)
- Modify: `backend/accounts/admin_urls.py` (ajouter la route)
- Test: `backend/tests/test_employee_access_grants.py` (compléter)

**Interfaces:**
- Consumes: `EmployeeAccessGrant` (Task 1), `TypeDocument.is_categorie` (existant).
- Produces: `GET/PUT /api/admin-users/<uuid:pk>/employee-grants/` (ADMIN only).
  - `GET` → `{"grants": [{"id": "<uuid>", "employee": "<uuid>", "employee_nom": "...", "employee_prenom": "...", "employee_matricule": "...", "type_doc": null|"<uuid>", "type_doc_nom": null|"..."}]}`
  - `PUT` body → `{"grants": [{"employee": "<uuid>", "type_doc": null|"<uuid>"}, ...]}` (remplacement complet), réponse = même forme que GET.

- [ ] **Step 1: Écrire les tests (rouges) de l'endpoint**

Ajouter à `backend/tests/test_employee_access_grants.py` :

```python
class TestEmployeeGrantsEndpoint:
    def test_admin_can_set_full_dossier_grant(self, admin_user, scoped_consultant, employee):
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": None}]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert EmployeeAccessGrant.objects.filter(user=scoped_consultant, employee=employee, type_doc=None).exists()

    def test_admin_can_set_type_specific_grant(self, admin_user, scoped_consultant, employee, type_doc_obligatoire):
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": str(type_doc_obligatoire.id)}]},
            format="json",
        )
        assert resp.status_code == 200, resp.data
        assert EmployeeAccessGrant.objects.filter(
            user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire
        ).exists()

    def test_put_replaces_existing_grants(self, admin_user, scoped_consultant, employee):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": []},
            format="json",
        )
        assert resp.status_code == 200
        assert not EmployeeAccessGrant.objects.filter(user=scoped_consultant).exists()

    def test_rejects_categorie_type_doc(self, admin_user, scoped_consultant, employee):
        categorie = TypeDocument.objects.create(nom="État civil", code="ETAT_CIVIL", obligatoire=False)
        TypeDocument.objects.create(nom="Acte de naissance", code="ACTE_NAISS", parent=categorie, obligatoire=False)
        client = auth_client(admin_user)
        resp = client.put(
            f"/api/admin-users/{scoped_consultant.id}/employee-grants/",
            {"grants": [{"employee": str(employee.id), "type_doc": str(categorie.id)}]},
            format="json",
        )
        assert resp.status_code == 400

    def test_consultant_forbidden(self, scoped_consultant, employee):
        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/admin-users/{scoped_consultant.id}/employee-grants/")
        assert resp.status_code == 403

    def test_get_lists_current_grants(self, admin_user, scoped_consultant, employee, type_doc_obligatoire):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)
        client = auth_client(admin_user)
        resp = client.get(f"/api/admin-users/{scoped_consultant.id}/employee-grants/")
        assert resp.status_code == 200
        assert len(resp.data["grants"]) == 1
        assert resp.data["grants"][0]["employee_matricule"] == employee.matricule
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_employee_access_grants.py::TestEmployeeGrantsEndpoint -v`
Expected: FAIL — 404 (route inexistante).

- [ ] **Step 3: Écrire le serializer et la vue**

Ajouter à `backend/accounts/admin_views.py`, après les imports existants
(ajouter aussi `from django.db import transaction` et
`from employees.models import Employee, EmployeeAccessGrant, TypeDocument`) :

```python
from django.db import transaction
from employees.models import Employee, EmployeeAccessGrant, TypeDocument


class EmployeeAccessGrantSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all())
    employee_nom = serializers.CharField(source='employee.nom', read_only=True)
    employee_prenom = serializers.CharField(source='employee.prenom', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    type_doc = serializers.PrimaryKeyRelatedField(
        queryset=TypeDocument.objects.all(), allow_null=True, required=False
    )
    type_doc_nom = serializers.CharField(source='type_doc.nom', read_only=True, default=None)

    def validate_type_doc(self, value):
        if value is not None and value.is_categorie:
            raise serializers.ValidationError(
                "Impossible d'accorder un accès sur une catégorie — choisissez un type de document précis."
            )
        return value


class EmployeeGrantsView(APIView):
    """
    GET/PUT /api/admin-users/<id>/employee-grants/ — périmètre "employés
    spécifiques" d'un compte CONSULTANT (ADMIN only). PUT remplace
    l'ensemble des grants en une requête (même pattern que le périmètre
    organisationnel, voir UserUpdateView.perform_update).
    """
    permission_classes = [IsAdmin]

    def _target(self, pk):
        return generics.get_object_or_404(User, pk=pk)

    def get(self, request, pk):
        target = self._target(pk)
        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc')
        return Response({'grants': EmployeeAccessGrantSerializer(grants, many=True).data})

    def put(self, request, pk):
        target = self._target(pk)
        serializer = EmployeeAccessGrantSerializer(data=request.data.get('grants', []), many=True)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            EmployeeAccessGrant.objects.filter(user=target).delete()
            created = [
                EmployeeAccessGrant(
                    user=target,
                    employee=row['employee'],
                    type_doc=row.get('type_doc'),
                    granted_by=request.user,
                )
                for row in serializer.validated_data
            ]
            # unique_together (user, employee, type_doc) : dédoublonner les
            # lignes identiques envoyées par erreur par le frontend plutôt
            # que de laisser bulk_create lever une IntegrityError.
            seen = set()
            deduped = []
            for grant in created:
                key = (grant.employee_id, grant.type_doc_id)
                if key not in seen:
                    seen.add(key)
                    deduped.append(grant)
            EmployeeAccessGrant.objects.bulk_create(deduped)

        AuditLog.log(
            request, AuditLog.Action.MODIFY_USER, target=target,
            details={
                'action': 'employee_grants',
                'grants': [
                    {
                        'employee': g.employee.matricule,
                        'type_doc': g.type_doc.nom if g.type_doc_id else 'dossier complet',
                    }
                    for g in deduped
                ],
            },
        )

        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc')
        return Response({'grants': EmployeeAccessGrantSerializer(grants, many=True).data})
```

Ajouter aussi en haut du fichier `from rest_framework.views import APIView`
si absent (vérifier les imports existants de `admin_views.py` — seul
`generics` est importé actuellement).

- [ ] **Step 4: Enregistrer la route**

Modifier `backend/accounts/admin_urls.py` :

```python
from django.urls import path
from accounts.admin_views import UserListCreateView, UserUpdateView, EmployeeGrantsView
from accounts.views import AdminResetPasswordView


urlpatterns = [
    path('', UserListCreateView.as_view(), name='user-list'),
    path('<uuid:pk>/', UserUpdateView.as_view(), name='user-update'),
    path('<uuid:pk>/reset-password/', AdminResetPasswordView.as_view(), name='user-reset-password'),
    path('<uuid:pk>/employee-grants/', EmployeeGrantsView.as_view(), name='user-employee-grants'),
]
```

- [ ] **Step 5: Lancer les tests**

Run: `cd backend && pytest tests/test_employee_access_grants.py -v`
Expected: tous PASS.

- [ ] **Step 6: Lancer la suite complète backend**

Run: `cd backend && pytest`
Expected: tous les tests existants passent toujours (188+ tests avant ce
chantier, plus les nouveaux).

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/admin_views.py backend/accounts/admin_urls.py backend/tests/test_employee_access_grants.py
git commit -m "feat(accounts): endpoint ADMIN de gestion des grants employé spécifique"
```

---

### Task 4: Brancher `can_access_document`/`accessible_type_doc_ids_for_employee` dans les vues documents

**Files:**
- Modify: `backend/employees/views.py` (`DocumentListUploadView.get:436-446`, `FileViewerView.get:634-637`, `DocumentViewerView.get:750-753`, `ContratDocumentListUploadView.get:925-934`)
- Modify: `backend/employees/serializers.py` (`EmployeeDetailSerializer.get_documents:378-383`, `get_documents_manquants:385-405`)
- Test: `backend/tests/test_employee_access_grants.py` (compléter, tests d'intégration via l'API)

**Interfaces:**
- Consumes: `User.can_access_document(employee, type_doc_id, contrat_scope=False)`,
  `User.accessible_type_doc_ids_for_employee(employee, contrat_scope=False)` (Task 2).

- [ ] **Step 1: Écrire les tests d'intégration (rouges)**

Ajouter à `backend/tests/test_employee_access_grants.py` :

```python
class TestGrantIntegrationInViews:
    def test_document_list_shows_only_granted_type(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        doc1 = EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/documents/")
        assert resp.status_code == 200
        ids = [d['id'] for d in resp.data]
        assert str(doc1.id) in ids
        assert len(ids) == 1

    def test_full_dossier_grant_shows_all_documents(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/documents/")
        assert resp.status_code == 200
        assert len(resp.data) == 2

    def test_employee_detail_documents_respect_partial_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_doc_facultatif
    ):
        from employees.models import EmployeeDocument
        scoped_consultant.scope_services.set([other_service])
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_obligatoire, uploaded_by=None)
        EmployeeDocument.objects.create(employee=employee, type_doc=type_doc_facultatif, uploaded_by=None)
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/employees/{employee.id}/")
        assert resp.status_code == 200
        assert len(resp.data['documents']) == 1
        assert resp.data['documents'][0]['type_doc'] == str(type_doc_obligatoire.id)

    def test_contrat_documents_not_shown_via_partial_dossier_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_contrat
    ):
        from employees.models import EmployeeDocument, Contrat
        scoped_consultant.scope_services.set([other_service])
        contrat = Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="C-001", date_debut="2026-01-01",
        )
        EmployeeDocument.objects.create(
            employee=employee, contrat=contrat, type_doc=type_doc_obligatoire, uploaded_by=None
        )
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee, type_doc=type_doc_obligatoire)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.id}/documents/")
        assert resp.status_code == 200
        assert resp.data == []

    def test_contrat_documents_shown_via_full_dossier_grant(
        self, scoped_consultant, employee, other_service, type_doc_obligatoire, type_contrat
    ):
        from employees.models import EmployeeDocument, Contrat
        scoped_consultant.scope_services.set([other_service])
        contrat = Contrat.objects.create(
            employee=employee, type_contrat=type_contrat,
            numero_contrat="C-002", date_debut="2026-01-01",
        )
        EmployeeDocument.objects.create(
            employee=employee, contrat=contrat, type_doc=type_doc_obligatoire, uploaded_by=None
        )
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)

        client = auth_client(scoped_consultant)
        resp = client.get(f"/api/contrats/{contrat.id}/documents/")
        assert resp.status_code == 200
        assert len(resp.data) == 1
```

Vérifier le nom exact de la fixture `type_contrat` dans `conftest.py`
(déjà utilisée par `test_employees_models.py`/`test_contrat_views.py` —
reprendre son nom exact si différent de `type_contrat`).

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `cd backend && pytest tests/test_employee_access_grants.py::TestGrantIntegrationInViews -v`
Expected: FAIL (les vues ignorent encore les grants pour le filtrage par
type).

- [ ] **Step 3: Modifier `DocumentListUploadView.get`**

Dans `backend/employees/views.py`, remplacer les lignes 436-446 :

```python
    def get(self, request, emp_id):
        employee = self._get_employee(emp_id)
        if not request.user.can_access_employee(employee):
            raise Http404("Employé introuvable.")
        docs = EmployeeDocument.objects.filter(employee=employee, is_active=True)
        type_ids = request.user.accessible_type_doc_ids_for_employee(employee)
        if type_ids is not None:
            docs = docs.filter(type_doc_id__in=type_ids)
        docs = docs.select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
        serializer = EmployeeDocumentSerializer(docs, many=True)
        return Response(serializer.data)
```

- [ ] **Step 4: Modifier `FileViewerView.get`**

Remplacer les lignes 634-637 :

```python
        if not request.user.can_access_document(file_obj.document.employee, file_obj.document.type_doc_id):
            raise Http404
```

- [ ] **Step 5: Modifier `DocumentViewerView.get`**

Remplacer les lignes 750-753 :

```python
        if not request.user.can_access_document(doc.employee, doc.type_doc_id):
            raise Http404("Document introuvable.")
```

- [ ] **Step 6: Modifier `ContratDocumentListUploadView.get`**

Remplacer les lignes 925-934 :

```python
    def get(self, request, contrat_id):
        contrat = get_object_or_404(Contrat.objects.select_related('employee'), pk=contrat_id)
        if not request.user.can_access_employee(contrat.employee):
            raise Http404
        docs = EmployeeDocument.objects.filter(contrat=contrat, is_active=True)
        type_ids = request.user.accessible_type_doc_ids_for_employee(contrat.employee, contrat_scope=True)
        if type_ids is not None:
            docs = docs.filter(type_doc_id__in=type_ids)
        docs = docs.select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
        serializer = EmployeeDocumentSerializer(docs, many=True)
```

(la ligne suivante `return Response(serializer.data)` reste inchangée.)

- [ ] **Step 7: Modifier `EmployeeDetailSerializer.get_documents`/`get_documents_manquants`**

Dans `backend/employees/serializers.py`, remplacer lignes 378-405 :

```python
    def get_documents(self, obj):
        qs = obj.documents_actifs
        request = self.context.get('request')
        if request:
            type_ids = request.user.accessible_type_doc_ids_for_employee(obj)
            if type_ids is not None:
                qs = qs.filter(type_doc_id__in=type_ids)
        return EmployeeDocumentSerializer(qs, many=True).data

    def get_documents_manquants(self, obj):
        tous = TypeDocument.objects.filter(is_active=True, sous_types__isnull=True)
        request = self.context.get('request')
        if request:
            type_ids = request.user.accessible_type_doc_ids_for_employee(obj)
            if type_ids is not None:
                tous = tous.filter(id__in=type_ids)
        presents = set(
            obj.documents.filter(is_active=True).values_list('type_doc_id', flat=True)
        )
        manquants = tous.select_related('parent').exclude(id__in=presents)
        return [
            {
            'id': str(t.id),
            'code': t.code,
            'label': t.nom,
            'required': t.obligatoire,
            'parent_nom': t.parent.nom if t.parent_id else None,
            'ordre': t.parent.ordre if t.parent_id else t.ordre,
            'type_ordre': t.ordre,
        }
        for t in manquants
    ]
```

**Piège** : `accessible_types_documents_qs()` (méthode existante,
périmètre global seul) n'est plus utilisée ici — remplacée par
`accessible_type_doc_ids_for_employee(obj)` qui tient compte à la fois du
périmètre global ET des grants pour cet employé précis. Ne pas confondre
les deux méthodes ; `accessible_types_documents_qs()` reste utilisée telle
quelle ailleurs (ex. `/ref/types-documents/`, qui n'est pas liée à un
employé précis).

- [ ] **Step 8: Lancer les tests**

Run: `cd backend && pytest tests/test_employee_access_grants.py -v`
Expected: tous PASS.

- [ ] **Step 9: Lancer la suite complète backend**

Run: `cd backend && pytest`
Expected: tous les tests passent (aucune régression sur le scoping
existant ni sur les vues documents/contrats).

- [ ] **Step 10: Commit**

```bash
git add backend/employees/views.py backend/employees/serializers.py backend/tests/test_employee_access_grants.py
git commit -m "feat(employees): applique les grants employé spécifique aux vues documents/contrats"
```

---

### Task 5: Exposer les grants sur `UserSerializer` (compteur pour l'UI)

**Files:**
- Modify: `backend/accounts/admin_views.py` (`UserSerializer`)
- Test: `backend/tests/test_employee_access_grants.py` (compléter)

**Interfaces:**
- Produces: `UserSerializer` expose désormais `employee_grants_count` (entier) — utilisé par `/users` pour indiquer visuellement qu'un compte a des grants, sans devoir charger `/employee-grants/` pour chaque ligne de la liste.

- [ ] **Step 1: Écrire le test (rouge)**

Ajouter à `backend/tests/test_employee_access_grants.py` :

```python
class TestUserSerializerGrantsCount:
    def test_list_exposes_grants_count(self, admin_user, scoped_consultant, employee):
        EmployeeAccessGrant.objects.create(user=scoped_consultant, employee=employee)
        client = auth_client(admin_user)
        resp = client.get("/api/admin-users/")
        assert resp.status_code == 200
        row = next(u for u in resp.data if u['id'] == str(scoped_consultant.id))
        assert row['employee_grants_count'] == 1
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `cd backend && pytest tests/test_employee_access_grants.py::TestUserSerializerGrantsCount -v`
Expected: FAIL — `KeyError: 'employee_grants_count'`.

- [ ] **Step 3: Ajouter le champ**

Dans `backend/accounts/admin_views.py`, `UserSerializer` — ajouter le
champ et la méthode, et l'inclure dans `Meta.fields` :

```python
    employee_grants_count = serializers.SerializerMethodField()

    def get_employee_grants_count(self, obj):
        return obj.employee_grants.count()
```

Et dans `Meta.fields`, ajouter `'employee_grants_count'` après
`'scope_types_documents_nom'`.

- [ ] **Step 4: Lancer les tests**

Run: `cd backend && pytest tests/test_employee_access_grants.py -v`
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts/admin_views.py backend/tests/test_employee_access_grants.py
git commit -m "feat(accounts): expose employee_grants_count sur UserSerializer"
```

---

### Task 6: Frontend — section "Employés spécifiques" dans la modale Périmètre

**Files:**
- Modify: `frontend/src/pages/Users.jsx`

**Interfaces:**
- Consumes: `GET /api/employees/search/?q=` (existant, `IsAdminOrConsultant`, retourne un tableau d'employés avec au moins `id`, `nom`, `prenom`, `matricule`), `GET/PUT /api/admin-users/<id>/employee-grants/` (Task 3), `typesDocuments` (state déjà chargé dans `Users.jsx`, avec `is_categorie`).

- [ ] **Step 1: Ajouter l'état et le chargement des grants à l'ouverture de la modale**

Dans `frontend/src/pages/Users.jsx`, après la déclaration de `savingScope`
(ligne 101), ajouter :

```jsx
  // Périmètre "employés spécifiques" — grants ponctuels indépendants du
  // périmètre organisationnel (voir docs/superpowers/specs/2026-08-30-perimetre-employes-specifiques-design.md).
  const [employeeGrants, setEmployeeGrants] = useState([]); // [{employee, employee_nom, employee_prenom, employee_matricule, type_doc, type_doc_nom}]
  const [grantSearch, setGrantSearch] = useState("");
  const [grantSearchResults, setGrantSearchResults] = useState([]);
  const [grantSearchLoading, setGrantSearchLoading] = useState(false);
```

Modifier `openScopeModal` pour charger les grants existants :

```jsx
  const openScopeModal = (u) => {
    setScopeModal(u);
    setScopeForm({
      directions: u.scope_directions || [],
      poles: u.scope_poles || [],
      departements: u.scope_departements || [],
      services: u.scope_services || [],
      cellules: u.scope_cellules || [],
      types_documents: u.scope_types_documents || [],
    });
    setEmployeeGrants([]);
    setGrantSearch("");
    setGrantSearchResults([]);
    api.get(`/admin-users/${u.id}/employee-grants/`)
      .then((res) => setEmployeeGrants(res.data.grants || []))
      .catch(() => {});
  };
```

- [ ] **Step 2: Ajouter la recherche débouncée**

Après `handleSaveScope` (ligne 296), ajouter :

```jsx
  useEffect(() => {
    if (grantSearch.trim().length < 2) {
      setGrantSearchResults([]);
      return;
    }
    setGrantSearchLoading(true);
    const timeout = setTimeout(() => {
      api.get(`/employees/search/?q=${encodeURIComponent(grantSearch.trim())}`)
        .then((res) => setGrantSearchResults(res.data || []))
        .catch(() => setGrantSearchResults([]))
        .finally(() => setGrantSearchLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [grantSearch]);

  const addEmployeeGrant = (employee) => {
    setEmployeeGrants((prev) => {
      if (prev.some((g) => g.employee === employee.id)) return prev;
      return [
        ...prev,
        {
          employee: employee.id,
          employee_nom: employee.nom,
          employee_prenom: employee.prenom,
          employee_matricule: employee.matricule,
          type_doc: null,
          type_doc_nom: null,
        },
      ];
    });
    setGrantSearch("");
    setGrantSearchResults([]);
  };

  const removeEmployeeGrant = (employeeId) => {
    setEmployeeGrants((prev) => prev.filter((g) => g.employee !== employeeId));
  };

  const setGrantTypeDoc = (employeeId, typeDocId, typeDocNom) => {
    setEmployeeGrants((prev) =>
      prev.map((g) =>
        g.employee === employeeId ? { ...g, type_doc: typeDocId, type_doc_nom: typeDocNom } : g
      )
    );
  };
```

- [ ] **Step 3: Sauvegarder les grants dans `handleSaveScope`**

Modifier `handleSaveScope` (lignes 276-296) pour envoyer aussi les grants,
en parallèle du PATCH existant :

```jsx
  const handleSaveScope = async () => {
    setSavingScope(true);
    try {
      await Promise.all([
        api.patch(`/admin-users/${scopeModal.id}/`, {
          scope_directions: scopeForm.directions,
          scope_poles: scopeForm.poles,
          scope_departements: scopeForm.departements,
          scope_services: scopeForm.services,
          scope_cellules: scopeForm.cellules,
          scope_types_documents: scopeForm.types_documents,
        }),
        api.put(`/admin-users/${scopeModal.id}/employee-grants/`, {
          grants: employeeGrants.map((g) => ({ employee: g.employee, type_doc: g.type_doc })),
        }),
      ]);
      setMessage({ type: "success", text: "Périmètre mis à jour." });
      setScopeModal(null);
      fetchUsers(true);
    } catch (err) {
      setMessage({ type: "error", text: err.response?.data?.error || "Erreur lors de la mise à jour du périmètre." });
    } finally {
      setSavingScope(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };
```

- [ ] **Step 4: Ajouter la section UI dans la modale**

Dans `frontend/src/pages/Users.jsx`, juste avant la fermeture du bloc
"Types de documents" (après la ligne 1239, avant le `</div>` de la ligne
1240 qui ferme la zone scrollable de la modale), insérer :

```jsx
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 16, marginTop: 4, marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 6 }}>Employés spécifiques</label>
              <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 10 }}>
                Accès ponctuel à un employé précis, en plus (union) du périmètre ci-dessus — dossier complet ou un seul type de document.
              </div>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  type="text"
                  value={grantSearch}
                  onChange={(e) => setGrantSearch(e.target.value)}
                  placeholder="Rechercher un employé (nom, prénom, matricule)…"
                  className="input-focus"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1.5px solid ${theme.border}`,
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    color: theme.text,
                  }}
                />
                {grantSearch.trim().length >= 2 && (
                  <div style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 10,
                    marginTop: 4,
                    maxHeight: 180,
                    overflowY: "auto",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                  }}>
                    {grantSearchLoading ? (
                      <div style={{ padding: 10, fontSize: 12, color: theme.textMuted }}>Recherche…</div>
                    ) : grantSearchResults.length === 0 ? (
                      <div style={{ padding: 10, fontSize: 12, color: theme.textMuted }}>Aucun résultat.</div>
                    ) : (
                      grantSearchResults.map((emp) => (
                        <div
                          key={emp.id}
                          onClick={() => addEmployeeGrant(emp)}
                          style={{ padding: "8px 12px", fontSize: 13, color: theme.text, cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = theme.bg)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          {emp.prenom} {emp.nom} <span style={{ color: theme.textMuted }}>({emp.matricule})</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {employeeGrants.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {employeeGrants.map((g) => (
                    <div
                      key={g.employee}
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: theme.bg,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: theme.text }}>
                          {g.employee_prenom} {g.employee_nom} <span style={{ color: theme.textMuted, fontWeight: 400 }}>({g.employee_matricule})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEmployeeGrant(g.employee)}
                          style={{ background: "none", border: "none", color: theme.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}
                        >
                          Retirer
                        </button>
                      </div>
                      <select
                        value={g.type_doc || ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          const t = typesDocuments.find((td) => td.id === id);
                          setGrantTypeDoc(g.employee, id, t ? t.nom : null);
                        }}
                        style={{
                          width: "100%",
                          border: `1.5px solid ${theme.border}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          fontSize: 12,
                          fontFamily: "inherit",
                          color: theme.text,
                        }}
                      >
                        <option value="">Dossier complet</option>
                        {typesDocuments.filter((t) => !t.is_categorie).map((t) => (
                          <option key={t.id} value={t.id}>{t.nom}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
```

- [ ] **Step 5: Vérifier `theme.danger` existe**

Run: `grep -n "danger" frontend/src/styles/theme.js`
Expected: une entrée `danger:` — si absente, utiliser la couleur
existante employée ailleurs pour les actions destructives (ex. bouton
"Supprimer la sélection" de `Parametres.jsx`) à la place.

- [ ] **Step 6: Test manuel dans le navigateur**

Démarrer le frontend (`cd frontend && npm start`) et le backend, se
connecter en ADMIN, aller sur `/users`, ouvrir "Périmètre" sur un compte
CONSULTANT, rechercher un employé, l'ajouter en "Dossier complet" puis en
type précis, enregistrer, rouvrir la modale et vérifier que le grant
persiste. Vérifier aussi qu'en se connectant avec ce compte CONSULTANT,
l'employé apparaît dans `/employees` même hors périmètre organisationnel,
et que seul le type de document choisi est visible dans sa fiche.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Users.jsx
git commit -m "feat(users): section \"Employés spécifiques\" dans la modale Périmètre"
```

---

### Task 7: Documentation

**Files:**
- Modify: `CLAUDE.md` (section "Scoping organisation-wide")
- Modify: `securite.md` (nouveau point)

**Interfaces:** aucune (documentation seule).

- [ ] **Step 1: Ajouter une sous-section dans `CLAUDE.md`**

Après la section "### Périmètre indépendant — Types de documents
(2026-07-24)" dans `CLAUDE.md`, ajouter :

```markdown
### Périmètre ponctuel — employés spécifiques (2026-08-30)

En plus des deux périmètres ci-dessus, un CONSULTANT peut recevoir un
accès ponctuel à un ou plusieurs **employés précis**
(`EmployeeAccessGrant`, `user` + `employee` + `type_doc` optionnel) —
combiné en **OU** avec le périmètre organisationnel (l'employé devient
visible en plus de son périmètre normal, pas à la place). Deux niveaux de
grant :
- `type_doc=None` — dossier complet de cet employé (documents + contrats).
- `type_doc=<X>` — uniquement les documents de ce type, dans le dossier
  général de l'employé (jamais les documents de contrat — un grant
  dossier complet est nécessaire pour couvrir aussi les contrats).

Contrairement au périmètre "types de documents" global, ces grants sont
**indépendants** de `scope_types_documents` — un grant ponctuel donne
accès même si ce type n'est pas dans le périmètre global de l'utilisateur.

- `User.accessible_type_doc_ids_for_employee(employee, contrat_scope=False)`
  — `None` (tous les types visibles) ou `set` d'ids de `TypeDocument`
  autorisés pour CET employé, tenant compte du périmètre organisationnel +
  global + des grants. `contrat_scope=True` ignore les grants type_doc
  précis (utilisé par `ContratDocumentListUploadView`).
- `User.can_access_document(employee, type_doc_id, contrat_scope=False)`
  — équivalent objet-par-objet, combine `can_access_employee()` (étendu
  pour inclure les employés avec grant) et la méthode ci-dessus.
- UI : même modale "Périmètre" (`/users`), section "Employés spécifiques"
  — recherche + liste avec un sélecteur "Dossier complet"/type précis par
  ligne. `GET/PUT /api/admin-users/<id>/employee-grants/` (ADMIN only).
- Un grant ne peut jamais référencer un `TypeDocument` catégorie
  (`is_categorie`), même garde-fou que le reste du système.
```

- [ ] **Step 2: Ajouter un point dans `securite.md`**

Lire d'abord la fin du fichier pour connaître le numéro du dernier point
et suivre exactement le même format (titre, description, fichiers
touchés) :

Run: `tail -60 securite.md`

Ajouter un nouveau point numéroté (N+1, en reprenant le style des points
existants) décrivant : le nouveau canal d'accès ponctuel
`EmployeeAccessGrant`, le fait qu'il est ADMIN-only pour la gestion,
qu'il est tracé dans l'audit log (`MODIFY_USER`, détail
`employee_grants`), et qu'il ne contourne jamais les vérifications
`IsAdmin`/`IsAdminOrConsultant`/consentement Loi 18-07 existantes — il
étend uniquement la portée du scoping employé, pas les permissions de
rôle.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md securite.md
git commit -m "docs: documente le périmètre ponctuel employés spécifiques"
```

---

## Hors scope (voir le spec)

- Pas de grant sur les types de documents de contrat.
- Pas de date d'expiration sur un grant.
- Pas de notification à l'employé/son responsable.
- Pas de tests Jest frontend pour la nouvelle section UI (les modales de
  `/users` n'ont actuellement pas de couverture Jest dédiée pour le
  périmètre organisationnel existant non plus — cohérent avec l'état
  actuel du projet, pas une régression introduite par ce chantier).

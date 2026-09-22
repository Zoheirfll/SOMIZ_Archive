# Demandes d'attestation de travail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un rôle GESTIONNAIRE (Secrétaire/Superviseur) scopé de demander une attestation de travail pour un employé de son périmètre, traitée par les ADMIN via un workflow de statuts, avec génération d'un aperçu imprimable configurable, audit et reporting dédiés.

**Architecture:** Nouvelle app Django `attestations` (modèles `DemandeAttestation`, `ReferenceCounter`, `AttestationTemplateConfig`) branchée sur `employees.Employee`/`Contrat` et `accounts.User`. Nouveau rôle `User.Role.GESTIONNAIRE` réutilisant le scoping CONSULTANT existant. Frontend React : nouvelles pages `/attestations`, `/attestations/nouvelle`, `/attestations/:id`, un onglet `/parametres`, un bouton sur la fiche employé, un badge navbar.

**Tech Stack:** Django 5.2 / DRF, PostgreSQL, React 19 / React Router 7 / Axios, styles inline avec `theme.js`, pytest (backend), Jest + RTL (frontend).

## Global Constraints

- Rôle unique `GESTIONNAIRE` — pas de sous-rôles ; `libelle_role` est un simple label d'affichage, jamais utilisé dans une condition de permission.
- Scoping Gestionnaire = mêmes champs/méthodes que CONSULTANT (`employee_scope_q()`, `can_access_employee()`, `_scope_ids()`) — **aucune modification** de `accounts/models.py` sur ces méthodes (elles testent déjà `is_admin`, donc GESTIONNAIRE tombe dans la branche restreinte).
- Statuts : `RECUE → IMPRIMEE → SIGNEE → PRETE → RECUPEREE`, plus `REJETEE` (terminal, motif obligatoire, atteignable depuis n'importe quel statut avant `RECUPEREE`). Pas de saut ni de retour en arrière.
- Seul ADMIN/SUPERADMIN change les statuts. Le demandeur peut supprimer sa propre demande uniquement au statut `RECUE`.
- `reference` généré serveur (`NNNNN/AA`), compteur annuel avec verrou `select_for_update`.
- Scan du document final : optionnel, jamais bloquant.
- Aperçu du document : gabarit HTML servi par Django, impression via `window.print()` côté frontend — pas de dépendance PDF backend.
- Un seul `AttestationTemplateConfig` global (singleton), champs configurables, mise en page fixe.
- Audit : réutilise `AuditLog` existant (nouvelles valeurs `Action`), pas de journal séparé.
- Reporting : endpoint dédié sur `DemandeAttestation`, affiché sur `/attestations`, pas dans `/statistiques`.
- Toute règle générale du projet (`CLAUDE.md`) s'applique : pas de `window.confirm`/`window.prompt` (utiliser `useConfirm`/`usePrompt`), pas de hex codé en dur (utiliser `theme.js`), tout `fetch*()` réutilisé après une action mutante doit accepter un paramètre `silent`.

---

## File Structure

**Backend (nouvelle app `attestations`) :**
- `backend/attestations/__init__.py`, `apps.py` — squelette d'app standard Django.
- `backend/attestations/models.py` — `ReferenceCounter`, `DemandeAttestation`, `AttestationTemplateConfig`.
- `backend/attestations/migrations/0001_initial.py` — générée par `makemigrations`.
- `backend/attestations/serializers.py` — `DemandeAttestationSerializer`, `DemandeAttestationCreateSerializer`, `DemandeAttestationStatutSerializer`, `AttestationTemplateConfigSerializer`.
- `backend/attestations/permissions.py` — `CanRequestAttestation`.
- `backend/attestations/reference.py` — `generate_reference()` (logique du compteur annuel, isolée pour être testable seule).
- `backend/attestations/views.py` — `DemandeAttestationListCreateView`, `DemandeAttestationDetailView`, `DemandeAttestationStatutView`, `AttestationApercuView`, `AttestationTemplateConfigView`, `AttestationStatsView`.
- `backend/attestations/urls.py` — routes de l'app.
- `backend/tests/test_attestations.py` — tests pytest (modèle, permissions, workflow, reporting).

**Backend (modifications) :**
- `backend/accounts/models.py` — ajoute `Role.GESTIONNAIRE` et `User.libelle_role`.
- `backend/accounts/migrations/00XX_...py` — migration pour le nouveau champ.
- `backend/accounts/admin_views.py` — `UserSerializer`/`UserCreateSerializer.validate_role` acceptent GESTIONNAIRE ; ajoute `libelle_role` aux `fields`.
- `backend/audit/models.py` — nouvelles valeurs `Action` (`CREATE_ATTESTATION`, `CHANGE_STATUT_ATTESTATION`, `DELETE_ATTESTATION`).
- `backend/audit/views.py` — `AuditLogListView` étend la visibilité ADMIN aux comptes GESTIONNAIRE.
- `backend/config/settings.py` — ajoute `'attestations'` à `INSTALLED_APPS`.
- `backend/config/urls.py` — `path('attestations/', include('attestations.urls'))`.

**Frontend (nouveau) :**
- `frontend/src/pages/Attestations.jsx` — liste + filtres + badge, onglet Statistiques inclus.
- `frontend/src/pages/AttestationNouvelle.jsx` — formulaire de création.
- `frontend/src/pages/AttestationDetail.jsx` — détail, actions statut, aperçu, upload scan.
- `frontend/src/components/attestations/StatutBadge.jsx` — pastille de statut réutilisable (liste + détail).
- `frontend/src/__tests__/Attestations.test.jsx`, `AttestationNouvelle.test.jsx`, `AttestationDetail.test.jsx`.

**Frontend (modifications) :**
- `frontend/src/App.js` — nouvelles routes.
- `frontend/src/components/Navbar.jsx` — lien "Attestations" + badge compteur.
- `frontend/src/pages/Users.jsx` — option de rôle GESTIONNAIRE, libellé affichage, modale Périmètre visible aussi pour GESTIONNAIRE.
- `frontend/src/config/parametresTabs.js` — nouvel onglet `attestation-config`.
- `frontend/src/pages/Parametres.jsx` — rendu du nouvel onglet (formulaire simple, pas de `RefTable`/`RefForm`).
- `frontend/src/components/employeeDetail/DossierTab.jsx` — bouton "Demander une attestation".

---

### Task 1 : Rôle GESTIONNAIRE + libellé d'affichage

**Files:**
- Modify: `backend/accounts/models.py:39-42` (classe `Role`), zone des champs du modèle (`~L115`, après `scope_sections`)
- Modify: `backend/accounts/admin_views.py` (`UserSerializer`, `UserCreateSerializer`, `validate_role` x2)
- Test: `backend/tests/test_accounts_roles.py` (nouveau fichier)

**Interfaces:**
- Produces: `User.Role.GESTIONNAIRE = 'GESTIONNAIRE'`, `User.libelle_role` (`CharField`, blank=True), `User.is_gestionnaire` non ajouté (utiliser `role == User.Role.GESTIONNAIRE` directement, cohérent avec le reste du fichier qui n'a pas de property pour CONSULTANT non plus... en réalité si, `is_consultant` existe — ajouter `is_gestionnaire` pour la symétrie).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_accounts_roles.py
import pytest
from accounts.models import User

pytestmark = pytest.mark.django_db


def test_gestionnaire_role_exists_and_is_not_admin():
    user = User.objects.create(
        username='gest1', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE,
    )
    assert user.is_gestionnaire is True
    assert user.is_admin is False
    assert user.is_consultant is False


def test_gestionnaire_libelle_role_is_optional_display_label():
    user = User.objects.create(
        username='gest2', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE, libelle_role='Secrétaire',
    )
    assert user.libelle_role == 'Secrétaire'


def test_gestionnaire_uses_same_scoping_branch_as_consultant():
    user = User.objects.create(
        username='gest3', nom='Test', prenom='Gest',
        role=User.Role.GESTIONNAIRE,
    )
    # Aucune sélection de périmètre = aucun accès (même règle que CONSULTANT)
    assert user.has_scope_restriction is False  # pas admin, pas de scope choisi -> pas "restreint" au sens has_scope_restriction (vide = pas de restriction visible) mais employee_scope_q() doit renvoyer un Q() vide de résultats
    from django.db.models import Q
    q = user.employee_scope_q()
    assert isinstance(q, Q)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_accounts_roles.py -v`
Expected: FAIL — `AttributeError: GESTIONNAIRE` (Role a pas ce membre) et `AttributeError: is_gestionnaire`.

- [ ] **Step 3: Implement the model changes**

```python
# backend/accounts/models.py — remplacer la classe Role (L39-42)
class Role(models.TextChoices):
    SUPERADMIN = 'SUPERADMIN', 'Super-administrateur'
    ADMIN = 'ADMIN', 'Administrateur'
    GESTIONNAIRE = 'GESTIONNAIRE', 'Gestionnaire'
    CONSULTANT = 'CONSULTANT', 'Consultant (lecture seule)'
```

```python
# backend/accounts/models.py — ajouter juste après le champ `role` (après L53)
    libelle_role = models.CharField(
        max_length=50, blank=True,
        verbose_name="Libellé d'affichage",
        help_text="Ex. 'Secrétaire', 'Superviseur' — remplace 'Gestionnaire' dans "
                   "l'interface pour ce compte, sans changer ses permissions.",
    )
```

```python
# backend/accounts/models.py — ajouter après la property is_consultant (après L168)
    @property
    def is_gestionnaire(self):
        return self.role == self.Role.GESTIONNAIRE
```

- [ ] **Step 4: Generate and apply the migration**

Run: `cd backend && python manage.py makemigrations accounts -n add_gestionnaire_role`
Expected: creates `backend/accounts/migrations/00XX_add_gestionnaire_role.py` with `AlterField` on `role` (nouveaux choices) et `AddField` `libelle_role`.

Run: `cd backend && python manage.py migrate accounts`
Expected: `Applying accounts.00XX_add_gestionnaire_role... OK`

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_accounts_roles.py -v`
Expected: 3 passed

- [ ] **Step 6: Allow GESTIONNAIRE through role validation and expose libelle_role**

```python
# backend/accounts/admin_views.py — dans UserSerializer.Meta.fields, ajouter 'libelle_role'
# juste après 'role' dans la liste (pas de changement de logique, juste le champ)
```

```python
# backend/accounts/admin_views.py — UserSerializer.validate_role : aucune modification
# de logique nécessaire, GESTIONNAIRE n'est pas ADMIN/SUPERADMIN donc passe déjà
# les deux gardes existantes sans changement.

# backend/accounts/admin_views.py — UserCreateSerializer.validate_role : idem,
# aucune modification nécessaire (GESTIONNAIRE n'est bloqué par aucune des deux
# conditions existantes, qui ne visent que SUPERADMIN et ADMIN).
```

- [ ] **Step 7: Test role creation via the admin-users API accepts GESTIONNAIRE**

```python
# backend/tests/test_accounts_roles.py — ajouter
from rest_framework.test import APIClient


def test_admin_can_create_gestionnaire_via_api(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.post('/api/admin-users/', {
        'username': 'gest_api', 'nom': 'Api', 'prenom': 'Test',
        'role': 'GESTIONNAIRE', 'libelle_role': 'Superviseur',
        'password': 'Un_MotDePasse_Valide123',
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['role'] == 'GESTIONNAIRE'
    assert resp.data['libelle_role'] == 'Superviseur'
```

Check the `admin_user` fixture exists (grep `def admin_user` in `backend/tests/conftest.py`); if the creation endpoint/serializer name differs from `UserCreateSerializer` posted at `/api/admin-users/`, adjust the URL to match `backend/accounts/admin_urls.py`'s registered path for user creation before running.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && pytest tests/test_accounts_roles.py -v`
Expected: 4 passed

- [ ] **Step 9: Commit**

```bash
git add backend/accounts/models.py backend/accounts/admin_views.py backend/accounts/migrations/ backend/tests/test_accounts_roles.py
git commit -m "feat(accounts): ajoute le rôle GESTIONNAIRE et son libellé d'affichage"
```

---

### Task 2 : App `attestations` — modèles et migration

**Files:**
- Create: `backend/attestations/__init__.py`
- Create: `backend/attestations/apps.py`
- Create: `backend/attestations/models.py`
- Create: `backend/attestations/migrations/__init__.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`)
- Test: `backend/tests/test_attestations.py` (nouveau fichier, section modèles)

**Interfaces:**
- Consumes: `employees.models.Employee`, `employees.models.Contrat`, `accounts.models.User` (via `settings.AUTH_USER_MODEL`).
- Produces: `attestations.models.DemandeAttestation` (champs : `id`, `reference`, `employee`, `contrat`, `motif`, `commentaire`, `statut`, `motif_rejet`, `scan_document`, `demandeur`, `traite_par`, `created_at`, `updated_at`), `attestations.models.ReferenceCounter` (`annee`, `dernier_numero`), `attestations.models.AttestationTemplateConfig` (champs listés ci-dessous), `DemandeAttestation.Statut` (`TextChoices`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py
import pytest
from attestations.models import DemandeAttestation, ReferenceCounter, AttestationTemplateConfig

pytestmark = pytest.mark.django_db


def test_demande_attestation_default_statut_is_recue(employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='Dossier administratif',
        demandeur=gestionnaire_user,
    )
    assert demande.statut == DemandeAttestation.Statut.RECUE
    assert demande.traite_par is None


def test_reference_counter_unique_per_year():
    ReferenceCounter.objects.create(annee=2026, dernier_numero=5)
    with pytest.raises(Exception):
        ReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_attestation_template_config_singleton_defaults():
    config = AttestationTemplateConfig.objects.create(societe_nom='SOMIZ')
    assert config.societe_nom == 'SOMIZ'
    assert config.logo.name in (None, '')
```

Add fixtures used above (`employee`, `gestionnaire_user`) to `backend/tests/conftest.py` if they don't already exist — check first with `grep -n "def employee\b\|def gestionnaire_user\b" backend/tests/conftest.py`. If `employee` already exists as a fixture, reuse it; only add what's missing:

```python
# backend/tests/conftest.py — ajouter si absent
@pytest.fixture
def gestionnaire_user(db):
    from accounts.models import User
    return User.objects.create(
        username='gest_fixture', nom='Fixture', prenom='Gest',
        role=User.Role.GESTIONNAIRE,
        consent_loi1807_accepted_at=timezone.now(),
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'attestations'`

- [ ] **Step 3: Create the app skeleton**

```python
# backend/attestations/__init__.py
```

```python
# backend/attestations/apps.py
from django.apps import AppConfig


class AttestationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'attestations'
    verbose_name = "Attestations de travail"
```

```python
# backend/attestations/migrations/__init__.py
```

```python
# backend/config/settings.py — dans INSTALLED_APPS, ajouter 'attestations' à côté de 'employees'/'ocr'
```

- [ ] **Step 4: Write the models**

```python
# backend/attestations/models.py
import uuid
from django.conf import settings
from django.db import models


def attestation_scan_upload_path(instance, filename):
    return f"attestations/{instance.employee_id}/{uuid.uuid4()}_{filename}"


def attestation_logo_upload_path(instance, filename):
    return f"attestation_logo/{uuid.uuid4()}_{filename}"


class ReferenceCounter(models.Model):
    """Compteur annuel pour générer les références NNNNN/AA des demandes
    d'attestation — une ligne par année civile, incrémentée sous verrou."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'attestation_reference_counters'


class DemandeAttestation(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        IMPRIMEE = 'imprimee', 'Imprimée'
        SIGNEE = 'signee', 'Signée'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT,
        related_name='demandes_attestation',
    )
    contrat = models.ForeignKey(
        'employees.Contrat', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation',
    )
    motif = models.CharField(max_length=255)
    commentaire = models.TextField(blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    motif_rejet = models.TextField(blank=True)
    scan_document = models.FileField(
        upload_to=attestation_scan_upload_path, null=True, blank=True,
    )

    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='demandes_attestation_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation_traitees',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_attestation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} — {self.employee} ({self.statut})"


class AttestationTemplateConfig(models.Model):
    """Singleton applicatif — un seul enregistrement pour toute la société,
    voir AttestationTemplateConfigView.get_object()."""
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(max_length=255, blank=True)
    societe_capital = models.CharField(max_length=255, blank=True)
    holding = models.CharField(max_length=255, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    ville = models.CharField(max_length=100, blank=True)
    telephone = models.CharField(max_length=50, blank=True)
    fax = models.CharField(max_length=50, blank=True)
    telex = models.CharField(max_length=50, blank=True)
    signataire_titre = models.CharField(max_length=150, blank=True)
    signataire_nom = models.CharField(max_length=150, blank=True)
    texte_intro = models.TextField(blank=True)
    logo = models.ImageField(upload_to=attestation_logo_upload_path, null=True, blank=True)

    class Meta:
        db_table = 'attestation_template_config'
```

- [ ] **Step 5: Generate and apply the migration**

Run: `cd backend && python manage.py makemigrations attestations -n initial`
Expected: creates `backend/attestations/migrations/0001_initial.py`

Run: `cd backend && python manage.py migrate attestations`
Expected: `Applying attestations.0001_initial... OK`

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -v`
Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add backend/attestations backend/config/settings.py backend/tests/test_attestations.py backend/tests/conftest.py
git commit -m "feat(attestations): modèles DemandeAttestation/ReferenceCounter/AttestationTemplateConfig"
```

---

### Task 3 : Génération de la référence annuelle

**Files:**
- Create: `backend/attestations/reference.py`
- Test: `backend/tests/test_attestations.py` (section référence)

**Interfaces:**
- Consumes: `attestations.models.ReferenceCounter`, `django.utils.timezone`
- Produces: `generate_reference() -> str` (ex. `"00001/26"`), utilisée par `DemandeAttestationCreateSerializer.create()` (Task 4).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
from django.db import transaction
from attestations.reference import generate_reference


def test_generate_reference_increments_within_same_year():
    ref1 = generate_reference()
    ref2 = generate_reference()
    num1, year1 = ref1.split('/')
    num2, year2 = ref2.split('/')
    assert year1 == year2
    assert int(num2) == int(num1) + 1


def test_generate_reference_format_is_5digits_slash_2digit_year():
    ref = generate_reference()
    num, year = ref.split('/')
    assert len(num) == 5 and num.isdigit()
    assert len(year) == 2 and year.isdigit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k generate_reference -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'attestations.reference'`

- [ ] **Step 3: Implement**

```python
# backend/attestations/reference.py
from django.db import transaction
from django.utils import timezone

from .models import ReferenceCounter


def generate_reference():
    """Génère et réserve la prochaine référence NNNNN/AA pour l'année civile
    en cours, sous verrou pour éviter toute collision entre créations
    concurrentes."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = ReferenceCounter.objects.select_for_update().get_or_create(
            annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"{numero:05d}/{annee % 100:02d}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -k generate_reference -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/attestations/reference.py backend/tests/test_attestations.py
git commit -m "feat(attestations): génération de référence annuelle NNNNN/AA"
```

---

### Task 4 : Permission `CanRequestAttestation`

**Files:**
- Create: `backend/attestations/permissions.py`
- Test: `backend/tests/test_attestations.py` (section permission)

**Interfaces:**
- Produces: `attestations.permissions.CanRequestAttestation` (classe DRF `BasePermission`), utilisée par `DemandeAttestationListCreateView` (Task 5).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
from unittest.mock import MagicMock
from attestations.permissions import CanRequestAttestation
from accounts.models import User


def _fake_request(role, consented=True, active=True):
    request = MagicMock()
    request.user = MagicMock()
    request.user.is_authenticated = True
    request.user.is_active = active
    request.user.role = role
    request.user.consent_loi1807_accepted_at = 'x' if consented else None
    return request


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'ADMIN', 'SUPERADMIN'])
def test_can_request_attestation_allows_gestionnaire_and_admins(role):
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request(role), None) is True


def test_can_request_attestation_blocks_consultant():
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request('CONSULTANT'), None) is False


def test_can_request_attestation_blocks_unconsented_user():
    perm = CanRequestAttestation()
    assert perm.has_permission(_fake_request('GESTIONNAIRE', consented=False), None) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k CanRequestAttestation -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'attestations.permissions'`

- [ ] **Step 3: Implement**

```python
# backend/attestations/permissions.py
from rest_framework.permissions import BasePermission


class CanRequestAttestation(BasePermission):
    """GESTIONNAIRE, ADMIN et SUPERADMIN peuvent créer/annuler une demande
    d'attestation — jamais CONSULTANT. Bloque aussi tout compte n'ayant pas
    consenti au traitement Loi 18-07, même règle que IsAdmin/
    IsAdminOrConsultant (accounts/permissions.py)."""
    message = "Seuls les comptes Gestionnaire et Administrateur peuvent demander une attestation."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and
            user.consent_loi1807_accepted_at and
            user.role in ('GESTIONNAIRE', 'ADMIN', 'SUPERADMIN')
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -k CanRequestAttestation -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/attestations/permissions.py backend/tests/test_attestations.py
git commit -m "feat(attestations): permission CanRequestAttestation"
```

---

### Task 5 : Serializers + vue liste/création + annulation

**Files:**
- Create: `backend/attestations/serializers.py`
- Modify: `backend/attestations/views.py` (créé dans ce task)
- Test: `backend/tests/test_attestations.py` (section API création/liste/annulation)

**Interfaces:**
- Consumes: `CanRequestAttestation`, `generate_reference()`, `accounts.permissions.IsAdmin`, `request.user.employee_scope_q()`.
- Produces: `DemandeAttestationSerializer` (lecture, tous champs + `employee_nom`, `demandeur_nom`), `DemandeAttestationCreateSerializer` (écriture : `employee`, `contrat`, `motif`, `commentaire`), `DemandeAttestationListCreateView` (`GET`/`POST` sur `/api/attestations/demandes/`), utilisée par le frontend Task 12/13.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
from rest_framework.test import APIClient
from attestations.models import DemandeAttestation


def test_gestionnaire_can_create_demande_for_employee_in_scope(
    gestionnaire_user, employee, direction,
):
    gestionnaire_user.scope_directions.add(direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': 'Dossier administratif',
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['statut'] == 'recue'
    assert resp.data['reference']
    demande = DemandeAttestation.objects.get(id=resp.data['id'])
    assert demande.demandeur_id == gestionnaire_user.id


def test_gestionnaire_cannot_create_demande_for_employee_out_of_scope(
    gestionnaire_user, employee, other_direction,
):
    gestionnaire_user.scope_directions.add(other_direction)
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.post('/api/attestations/demandes/', {
        'employee': str(employee.id), 'motif': 'Dossier administratif',
    }, format='json')
    assert resp.status_code in (400, 403, 404)


def test_gestionnaire_list_shows_only_own_demandes(gestionnaire_user, other_gestionnaire, employee):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='B', demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/demandes/')
    assert resp.status_code == 200
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1
    assert results[0]['reference'] == '00001/26'


def test_admin_list_shows_all_demandes(admin_user, gestionnaire_user, employee):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/demandes/')
    results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(results) == 1


def test_demandeur_can_cancel_own_demande_while_recue(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{demande.id}/')
    assert resp.status_code == 204
    assert not DemandeAttestation.objects.filter(id=demande.id).exists()


def test_demandeur_cannot_cancel_demande_once_imprimee(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut=DemandeAttestation.Statut.IMPRIMEE,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.delete(f'/api/attestations/demandes/{demande.id}/')
    assert resp.status_code in (400, 403, 404)
    assert DemandeAttestation.objects.filter(id=demande.id).exists()
```

Add missing fixtures to `backend/tests/conftest.py` (check existing ones for `direction`/`employee` first — reuse if present, only add `other_direction`/`other_gestionnaire` if missing):

```python
# backend/tests/conftest.py — ajouter si absent
@pytest.fixture
def other_direction(db):
    from employees.models import Direction
    return Direction.objects.create(nom='Autre Direction')


@pytest.fixture
def other_gestionnaire(db):
    from accounts.models import User
    return User.objects.create(
        username='gest_fixture2', nom='Fixture2', prenom='Gest',
        role=User.Role.GESTIONNAIRE, consent_loi1807_accepted_at=timezone.now(),
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k "create_demande or list_shows or cancel_own or cannot_cancel" -v`
Expected: FAIL — 404 (route non enregistrée) / `ImportError`.

- [ ] **Step 3: Implement the serializers**

```python
# backend/attestations/serializers.py
from django.db import transaction
from rest_framework import serializers

from employees.models import Employee, Contrat
from .models import DemandeAttestation
from .reference import generate_reference


class DemandeAttestationSerializer(serializers.ModelSerializer):
    employee_nom = serializers.CharField(source='employee.__str__', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    contrat_numero = serializers.CharField(source='contrat.numero_contrat', read_only=True, default=None)

    class Meta:
        model = DemandeAttestation
        fields = [
            'id', 'reference', 'employee', 'employee_nom', 'employee_matricule',
            'contrat', 'contrat_numero', 'motif', 'commentaire', 'statut',
            'motif_rejet', 'scan_document', 'demandeur', 'demandeur_nom',
            'traite_par', 'traite_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'statut', 'motif_rejet', 'demandeur', 'traite_par',
            'created_at', 'updated_at',
        ]

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None


class DemandeAttestationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeAttestation
        fields = ['employee', 'contrat', 'motif', 'commentaire']

    def validate_employee(self, value):
        user = self.context['request'].user
        if not user.is_admin and not user.can_access_employee(value):
            raise serializers.ValidationError(
                "Cet employé n'est pas dans votre périmètre."
            )
        return value

    def validate(self, attrs):
        contrat = attrs.get('contrat')
        if contrat and contrat.employee_id != attrs['employee'].id:
            raise serializers.ValidationError(
                {'contrat': "Ce contrat n'appartient pas à l'employé sélectionné."}
            )
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)
```

- [ ] **Step 4: Implement the view**

```python
# backend/attestations/views.py
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from .models import DemandeAttestation
from .permissions import CanRequestAttestation
from .serializers import DemandeAttestationSerializer, DemandeAttestationCreateSerializer


class DemandeAttestationListCreateView(generics.ListCreateAPIView):
    """GET /api/attestations/demandes/ — ADMIN/SUPERADMIN voient toutes les
    demandes, un GESTIONNAIRE ne voit que les siennes.
    POST /api/attestations/demandes/ — GESTIONNAIRE/ADMIN/SUPERADMIN."""

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanRequestAttestation()]
        return [IsAdminOrConsultant()]

    def get_serializer_class(self):
        return DemandeAttestationCreateSerializer if self.request.method == 'POST' else DemandeAttestationSerializer

    def get_queryset(self):
        qs = DemandeAttestation.objects.select_related(
            'employee', 'contrat', 'demandeur', 'traite_par'
        )
        user = self.request.user
        if user.is_admin:
            statut = self.request.query_params.get('statut')
            if statut:
                qs = qs.filter(statut=statut)
            return qs
        return qs.filter(demandeur=user)

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_ATTESTATION, target=demande,
            details={'employee': str(demande.employee), 'motif': demande.motif},
        )


class DemandeAttestationDetailView(generics.RetrieveDestroyAPIView):
    """GET accessible ADMIN + demandeur (sa propre demande).
    DELETE réservé au demandeur, uniquement au statut RECUE."""
    serializer_class = DemandeAttestationSerializer
    permission_classes = [IsAdminOrConsultant]
    queryset = DemandeAttestation.objects.select_related('employee', 'contrat', 'demandeur', 'traite_par')

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if not user.is_admin and obj.demandeur_id != user.id:
            raise PermissionDenied("Cette demande ne vous appartient pas.")
        return obj

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.demandeur_id != user.id or instance.statut != DemandeAttestation.Statut.RECUE:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est au statut 'Reçue'."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_ATTESTATION, target=instance,
            details={'employee': str(instance.employee), 'motif': instance.motif},
        )
        instance.delete()
```

- [ ] **Step 5: Wire the URLs**

```python
# backend/attestations/urls.py
from django.urls import path

from .views import DemandeAttestationListCreateView, DemandeAttestationDetailView

urlpatterns = [
    path('demandes/', DemandeAttestationListCreateView.as_view()),
    path('demandes/<uuid:pk>/', DemandeAttestationDetailView.as_view()),
]
```

```python
# backend/config/urls.py — dans la liste path('api/', include([...])), ajouter :
path('attestations/', include('attestations.urls')),
```

- [ ] **Step 6: Add the new AuditLog actions (needed for perform_create/perform_destroy above)**

```python
# backend/audit/models.py — dans class Action, ajouter après MERGE_REFERENTIEL (L35)
        CREATE_ATTESTATION = 'CREATE_ATTESTATION', 'Création demande attestation'
        CHANGE_STATUT_ATTESTATION = 'CHANGE_STATUT_ATTESTATION', 'Changement statut attestation'
        DELETE_ATTESTATION = 'DELETE_ATTESTATION', 'Annulation demande attestation'
```

Run: `cd backend && python manage.py makemigrations audit -n add_attestation_actions`
Run: `cd backend && python manage.py migrate audit`

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -v`
Expected: all passed (check the fixture names `employee`/`admin_user`/`direction` against `backend/tests/conftest.py` — adjust the test's fixture usage if the project's existing fixtures use different names, e.g. `admin` instead of `admin_user`; grep first with `grep -n "^def \|@pytest.fixture" backend/tests/conftest.py`)

- [ ] **Step 8: Commit**

```bash
git add backend/attestations backend/audit/models.py backend/audit/migrations backend/config/urls.py backend/tests/test_attestations.py backend/tests/conftest.py
git commit -m "feat(attestations): création/liste/annulation des demandes d'attestation"
```

---

### Task 6 : Changement de statut (workflow)

**Files:**
- Modify: `backend/attestations/serializers.py` (ajoute `DemandeAttestationStatutSerializer`)
- Modify: `backend/attestations/views.py` (ajoute `DemandeAttestationStatutView`)
- Modify: `backend/attestations/urls.py`
- Test: `backend/tests/test_attestations.py` (section workflow)

**Interfaces:**
- Consumes: `DemandeAttestation.Statut`, `accounts.permissions.IsAdmin`.
- Produces: `PATCH /api/attestations/demandes/<uuid:pk>/statut/`, body `{"statut": "...", "motif_rejet": "..."}`, utilisé par le frontend Task 14.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
ORDRE_STATUTS = ['recue', 'imprimee', 'signee', 'prete', 'recuperee']


@pytest.mark.parametrize('depuis,vers', list(zip(ORDRE_STATUTS, ORDRE_STATUTS[1:])))
def test_admin_can_advance_statut_in_order(admin_user, employee, gestionnaire_user, depuis, vers):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut=depuis,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': vers}, format='json')
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == vers
    assert demande.traite_par_id == admin_user.id


def test_admin_cannot_skip_statuses(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'prete'}, format='json')
    assert resp.status_code == 400
    demande.refresh_from_db()
    assert demande.statut == 'recue'


def test_admin_can_reject_from_any_non_terminal_status(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='signee',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{demande.id}/statut/',
        {'statut': 'rejetee', 'motif_rejet': 'Employé non éligible'}, format='json',
    )
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.statut == 'rejetee'
    assert demande.motif_rejet == 'Employé non éligible'


def test_reject_without_motif_is_rejected(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.patch(
        f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'rejetee'}, format='json',
    )
    assert resp.status_code == 400


def test_gestionnaire_cannot_change_statut(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='recue',
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.patch(f'/api/attestations/demandes/{demande.id}/statut/', {'statut': 'imprimee'}, format='json')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k "advance_statut or skip_statuses or reject" -v`
Expected: FAIL — 404 (route absente)

- [ ] **Step 3: Implement the serializer**

```python
# backend/attestations/serializers.py — ajouter à la fin du fichier
class DemandeAttestationStatutSerializer(serializers.ModelSerializer):
    ORDRE = [
        DemandeAttestation.Statut.RECUE,
        DemandeAttestation.Statut.IMPRIMEE,
        DemandeAttestation.Statut.SIGNEE,
        DemandeAttestation.Statut.PRETE,
        DemandeAttestation.Statut.RECUPEREE,
    ]

    class Meta:
        model = DemandeAttestation
        fields = ['statut', 'motif_rejet']

    def validate(self, attrs):
        instance = self.instance
        nouveau = attrs.get('statut')
        if nouveau == DemandeAttestation.Statut.REJETEE:
            if instance.statut == DemandeAttestation.Statut.RECUPEREE:
                raise serializers.ValidationError("Une demande déjà récupérée ne peut plus être rejetée.")
            if not attrs.get('motif_rejet', '').strip():
                raise serializers.ValidationError({'motif_rejet': "Motif de rejet requis."})
            return attrs

        try:
            idx_actuel = self.ORDRE.index(instance.statut)
            idx_nouveau = self.ORDRE.index(nouveau)
        except ValueError:
            raise serializers.ValidationError("Transition de statut invalide.")
        if idx_nouveau != idx_actuel + 1:
            raise serializers.ValidationError(
                f"Impossible de passer de '{instance.statut}' à '{nouveau}' — "
                "le statut suivant attendu est "
                f"'{self.ORDRE[idx_actuel + 1] if idx_actuel + 1 < len(self.ORDRE) else None}'."
            )
        return attrs
```

- [ ] **Step 4: Implement the view**

```python
# backend/attestations/views.py — ajouter
from accounts.permissions import IsAdmin
from .serializers import DemandeAttestationStatutSerializer


class DemandeAttestationStatutView(generics.UpdateAPIView):
    """PATCH /api/attestations/demandes/<id>/statut/ — ADMIN/SUPERADMIN uniquement."""
    permission_classes = [IsAdmin]
    serializer_class = DemandeAttestationStatutSerializer
    queryset = DemandeAttestation.objects.all()
    http_method_names = ['patch']

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        ancien_statut = instance.statut
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        demande = serializer.save(traite_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.CHANGE_STATUT_ATTESTATION, target=demande,
            details={
                'de': ancien_statut, 'vers': demande.statut,
                'motif_rejet': demande.motif_rejet or None,
            },
        )
        return Response(DemandeAttestationSerializer(demande).data)
```

- [ ] **Step 5: Wire the URL**

```python
# backend/attestations/urls.py — ajouter
from .views import DemandeAttestationStatutView

urlpatterns += [
    path('demandes/<uuid:pk>/statut/', DemandeAttestationStatutView.as_view()),
]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -v`
Expected: all passed

- [ ] **Step 7: Commit**

```bash
git add backend/attestations/serializers.py backend/attestations/views.py backend/attestations/urls.py backend/tests/test_attestations.py
git commit -m "feat(attestations): workflow de statuts (transitions + rejet)"
```

---

### Task 7 : Upload du scan (optionnel)

**Files:**
- Modify: `backend/attestations/views.py` (ajoute `DemandeAttestationScanView`)
- Modify: `backend/attestations/urls.py`
- Test: `backend/tests/test_attestations.py` (section scan)

**Interfaces:**
- Produces: `POST /api/attestations/demandes/<uuid:pk>/scan/` (multipart, champ `scan_document`), ADMIN only.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
from django.core.files.uploadedfile import SimpleUploadedFile


def test_admin_can_upload_scan_at_any_statut(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
        statut='prete',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    fichier = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 contenu', content_type='application/pdf')
    resp = client.post(
        f'/api/attestations/demandes/{demande.id}/scan/', {'scan_document': fichier}, format='multipart',
    )
    assert resp.status_code == 200, resp.data
    demande.refresh_from_db()
    assert demande.scan_document.name
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k upload_scan -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement**

```python
# backend/attestations/views.py — ajouter
class DemandeAttestationScanView(generics.UpdateAPIView):
    """POST/PATCH /api/attestations/demandes/<id>/scan/ — ADMIN uniquement,
    jamais bloquant sur le statut (aide-mémoire optionnel, voir spec)."""
    permission_classes = [IsAdmin]
    queryset = DemandeAttestation.objects.all()
    http_method_names = ['post', 'patch']

    class _ScanSerializer(serializers.ModelSerializer):
        class Meta:
            model = DemandeAttestation
            fields = ['scan_document']

    serializer_class = _ScanSerializer

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)
```

Add the missing `from rest_framework import serializers` import at the top of `backend/attestations/views.py` if not already present from Task 6.

- [ ] **Step 4: Wire the URL**

```python
# backend/attestations/urls.py — ajouter
from .views import DemandeAttestationScanView

urlpatterns += [
    path('demandes/<uuid:pk>/scan/', DemandeAttestationScanView.as_view()),
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -k upload_scan -v`
Expected: 1 passed

- [ ] **Step 6: Commit**

```bash
git add backend/attestations/views.py backend/attestations/urls.py backend/tests/test_attestations.py
git commit -m "feat(attestations): upload optionnel du scan du document signé"
```

---

### Task 8 : Configuration du modèle (`AttestationTemplateConfig`) — API

**Files:**
- Modify: `backend/attestations/serializers.py` (ajoute `AttestationTemplateConfigSerializer`)
- Modify: `backend/attestations/views.py` (ajoute `AttestationTemplateConfigView`)
- Modify: `backend/attestations/urls.py`
- Test: `backend/tests/test_attestations.py` (section config)

**Interfaces:**
- Produces: `GET/PUT /api/attestations/config/` — ADMIN écrit, ADMIN+GESTIONNAIRE+CONSULTANT lisent (nécessaire pour l'aperçu, mais en pratique seul l'aperçu généré côté backend en a besoin — lecture restreinte à `IsAdmin` pour rester cohérent avec `/parametres`, qui est ADMIN only).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
from attestations.models import AttestationTemplateConfig


def test_get_config_creates_singleton_on_first_access(admin_user):
    assert AttestationTemplateConfig.objects.count() == 0
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/config/')
    assert resp.status_code == 200
    assert AttestationTemplateConfig.objects.count() == 1


def test_put_config_updates_singleton_in_place(admin_user):
    client = APIClient()
    client.force_authenticate(admin_user)
    client.get('/api/attestations/config/')  # crée le singleton
    resp = client.put('/api/attestations/config/', {
        'societe_nom': 'SOMIZ', 'ville': 'Arzew',
        'signataire_titre': 'Chef de Département Administration du Personnel',
        'signataire_nom': 'A.BOUSMAHA',
    }, format='json')
    assert resp.status_code == 200, resp.data
    assert AttestationTemplateConfig.objects.count() == 1
    assert AttestationTemplateConfig.objects.first().ville == 'Arzew'


def test_gestionnaire_cannot_access_config(gestionnaire_user):
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/config/')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k "config" -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement the serializer**

```python
# backend/attestations/serializers.py — ajouter
from .models import AttestationTemplateConfig


class AttestationTemplateConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttestationTemplateConfig
        fields = [
            'id', 'societe_nom', 'societe_soustitre', 'societe_capital', 'holding',
            'adresse', 'ville', 'telephone', 'fax', 'telex',
            'signataire_titre', 'signataire_nom', 'texte_intro', 'logo',
        ]
        read_only_fields = ['id']
```

- [ ] **Step 4: Implement the view**

```python
# backend/attestations/views.py — ajouter
from .models import AttestationTemplateConfig
from .serializers import AttestationTemplateConfigSerializer


class AttestationTemplateConfigView(generics.RetrieveUpdateAPIView):
    """GET/PUT /api/attestations/config/ — singleton, ADMIN only."""
    permission_classes = [IsAdmin]
    serializer_class = AttestationTemplateConfigSerializer

    def get_object(self):
        obj, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        return obj
```

- [ ] **Step 5: Wire the URL**

```python
# backend/attestations/urls.py — ajouter
from .views import AttestationTemplateConfigView

urlpatterns += [
    path('config/', AttestationTemplateConfigView.as_view()),
]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -k config -v`
Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add backend/attestations/serializers.py backend/attestations/views.py backend/attestations/urls.py backend/tests/test_attestations.py
git commit -m "feat(attestations): configuration du modèle de document (singleton)"
```

---

### Task 9 : Aperçu imprimable HTML

**Files:**
- Create: `backend/attestations/templates/attestations/apercu.html`
- Modify: `backend/attestations/views.py` (ajoute `AttestationApercuView`)
- Modify: `backend/attestations/urls.py`
- Test: `backend/tests/test_attestations.py` (section aperçu)

**Interfaces:**
- Produces: `GET /api/attestations/demandes/<uuid:pk>/apercu/` (ADMIN only) → `text/html`, ouvert dans un nouvel onglet par le frontend Task 14 (`window.open(url)` puis impression manuelle par l'ADMIN — pas de `window.print()` automatique pour laisser le temps de vérifier l'aperçu).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
def test_apercu_contains_reference_and_employee_name(admin_user, employee, gestionnaire_user):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='Dossier administratif',
        demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    assert resp.status_code == 200
    assert resp['Content-Type'].startswith('text/html')
    body = resp.content.decode('utf-8')
    assert '00001/26' in body
    assert employee.nom in body
    assert 'Dossier administratif' in body


def test_gestionnaire_cannot_access_apercu(gestionnaire_user, employee):
    demande = DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get(f'/api/attestations/demandes/{demande.id}/apercu/')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k apercu -v`
Expected: FAIL — 404

- [ ] **Step 3: Write the HTML template**

```html
<!-- backend/attestations/templates/attestations/apercu.html -->
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Attestation de travail — {{ demande.reference }}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 40px; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 12px; }
  .header img { height: 60px; }
  .header .societe { text-align: center; flex: 1; }
  .header .societe h1 { font-size: 15px; margin: 0; }
  .header .societe p { font-size: 11px; margin: 2px 0; }
  .titre { text-align: center; border: 2px solid #111; display: inline-block; padding: 8px 24px; margin: 32px auto; font-weight: bold; font-size: 15px; }
  .titre-wrap { text-align: center; }
  .meta { margin-top: 24px; line-height: 1.8; }
  .corps { margin-top: 24px; line-height: 2; }
  .date-lieu { margin-top: 48px; text-align: right; }
  .signature { margin-top: 24px; }
  .footer { margin-top: 80px; border-top: 1px solid #999; padding-top: 8px; font-size: 10px; text-align: center; color: #444; }
</style>
</head>
<body>
  <div class="header">
    {% if config.logo %}<img src="{{ config.logo.url }}" alt="logo">{% endif %}
    <div class="societe">
      <h1>{{ config.societe_nom }}</h1>
      <p>{{ config.societe_soustitre }}</p>
      <p>{{ config.societe_capital }}</p>
      <p>{{ config.holding }}</p>
    </div>
  </div>

  <div class="titre-wrap"><div class="titre">ATTESTATION DE TRAVAIL</div></div>

  <div class="meta">
    REF N° : {{ demande.reference }}<br>
    MATRICULE : {{ demande.employee.matricule }}<br>
    {% if demande.contrat %}CONTRAT N° : {{ demande.contrat.numero_contrat }}<br>{% endif %}
  </div>

  <div class="corps">
    Nous soussigné(e)s : {{ config.signataire_titre }}<br><br>
    Attestons que M(r) (elle) (me) : <strong>{{ demande.employee.nom }} {{ demande.employee.prenom }}</strong><br>
    Né(e) le : {{ demande.employee.date_naissance|date:"d/m/Y" }} à : {{ demande.employee.lieu_naissance }}<br>
    Exerce au sein de la Société du : {{ demande.employee.date_embauche|date:"d/m/Y" }} à ce jour<br>
    Et occupe le poste de : {{ demande.employee.poste }}<br>
    Motif : {{ demande.motif }}<br><br>
    La présente Attestation lui est délivrée pour servir et valoir ce que de droit.
  </div>

  <div class="date-lieu">{{ config.ville }} le : {{ date_generation|date:"d/m/Y" }}</div>

  <div class="signature">
    LE {{ config.signataire_titre|upper }}<br>
    {{ config.signataire_nom }}
  </div>

  <div class="footer">
    {{ config.societe_nom }} {{ config.adresse }}
    {% if config.telephone %} Tél : {{ config.telephone }}{% endif %}
    {% if config.fax %} Fax : {{ config.fax }}{% endif %}
    {% if config.telex %} Télex : {{ config.telex }}{% endif %}
  </div>
</body>
</html>
```

- [ ] **Step 4: Implement the view**

```python
# backend/attestations/views.py — ajouter
from django.shortcuts import render
from django.utils import timezone


class AttestationApercuView(generics.RetrieveAPIView):
    """GET /api/attestations/demandes/<id>/apercu/ — ADMIN only, rend une
    page HTML autonome (impression navigateur côté frontend)."""
    permission_classes = [IsAdmin]
    queryset = DemandeAttestation.objects.select_related('employee', 'contrat')

    def get(self, request, *args, **kwargs):
        demande = self.get_object()
        config, _ = AttestationTemplateConfig.objects.get_or_create(pk=1)
        return render(request, 'attestations/apercu.html', {
            'demande': demande, 'config': config, 'date_generation': timezone.localdate(),
        })
```

- [ ] **Step 5: Wire the URL and ensure app templates are discoverable**

```python
# backend/attestations/urls.py — ajouter
from .views import AttestationApercuView

urlpatterns += [
    path('demandes/<uuid:pk>/apercu/', AttestationApercuView.as_view()),
]
```

Check `backend/config/settings.py` `TEMPLATES[0]['APP_DIRS']` is `True` (Django app-loader finds `attestations/templates/attestations/apercu.html` automatically) — if `APP_DIRS` is `False`, add `'attestations'` handling by adding the app's `templates` dir to `DIRS` instead; verify with `grep -n "APP_DIRS\|'DIRS'" backend/config/settings.py` before assuming.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -k apercu -v`
Expected: 2 passed (adjust template field names `demande.employee.matricule`/`date_naissance`/`lieu_naissance`/`date_embauche`/`poste` if they differ on the real `Employee` model — verify with `grep -n "matricule\|date_naissance\|lieu_naissance\|date_embauche\|def poste\| poste " backend/employees/models.py` before finalizing the template)

- [ ] **Step 7: Commit**

```bash
git add backend/attestations/templates backend/attestations/views.py backend/attestations/urls.py backend/tests/test_attestations.py
git commit -m "feat(attestations): aperçu HTML imprimable du document"
```

---

### Task 10 : Reporting (statistiques par gestionnaire/employé)

**Files:**
- Modify: `backend/attestations/views.py` (ajoute `AttestationStatsView`)
- Modify: `backend/attestations/urls.py`
- Test: `backend/tests/test_attestations.py` (section reporting)

**Interfaces:**
- Produces: `GET /api/attestations/stats/?date_debut=&date_fin=` (ADMIN only) → `{par_gestionnaire: [...], par_employe: [...], par_statut: {...}, delai_moyen_jours: float|null}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_attestations.py — ajouter
def test_stats_counts_demandes_by_gestionnaire_and_employee(
    admin_user, employee, gestionnaire_user, other_gestionnaire,
):
    DemandeAttestation.objects.create(
        reference='00001/26', employee=employee, motif='A', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00002/26', employee=employee, motif='B', demandeur=gestionnaire_user,
    )
    DemandeAttestation.objects.create(
        reference='00003/26', employee=employee, motif='C', demandeur=other_gestionnaire,
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 200
    par_gest = {r['demandeur_nom']: r['count'] for r in resp.data['par_gestionnaire']}
    assert par_gest[gestionnaire_user.full_name] == 2
    assert par_gest[other_gestionnaire.full_name] == 1
    par_emp = resp.data['par_employe']
    assert par_emp[0]['count'] == 3


def test_stats_forbidden_for_gestionnaire(gestionnaire_user):
    client = APIClient()
    client.force_authenticate(gestionnaire_user)
    resp = client.get('/api/attestations/stats/')
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_attestations.py -k stats -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement**

```python
# backend/attestations/views.py — ajouter
from datetime import datetime, time
from django.db.models import Count, F, Avg, ExpressionWrapper, DurationField
from django.utils import timezone as tz
from rest_framework.views import APIView


class AttestationStatsView(APIView):
    """GET /api/attestations/stats/?date_debut=&date_fin= — ADMIN only."""
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = DemandeAttestation.objects.all()
        date_debut = request.query_params.get('date_debut')
        date_fin = request.query_params.get('date_fin')
        if date_debut:
            d = datetime.strptime(date_debut, '%Y-%m-%d').date()
            qs = qs.filter(created_at__gte=tz.make_aware(datetime.combine(d, time.min)))
        if date_fin:
            d = datetime.strptime(date_fin, '%Y-%m-%d').date()
            qs = qs.filter(created_at__lte=tz.make_aware(datetime.combine(d, time.max)))

        par_gestionnaire = list(
            qs.values('demandeur_id', 'demandeur__nom', 'demandeur__prenom')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_gestionnaire:
            row['demandeur_nom'] = f"{row.pop('demandeur__prenom')} {row.pop('demandeur__nom')}"

        par_employe = list(
            qs.values('employee_id', 'employee__nom', 'employee__prenom', 'employee__matricule')
              .annotate(count=Count('id')).order_by('-count')
        )
        for row in par_employe:
            row['employee_nom'] = f"{row.pop('employee__prenom')} {row.pop('employee__nom')}"

        par_statut = dict(
            qs.values('statut').annotate(count=Count('id')).values_list('statut', 'count')
        )

        duree = qs.filter(statut=DemandeAttestation.Statut.RECUPEREE).annotate(
            duree=ExpressionWrapper(F('updated_at') - F('created_at'), output_field=DurationField())
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        return Response({
            'par_gestionnaire': par_gestionnaire,
            'par_employe': par_employe,
            'par_statut': par_statut,
            'delai_moyen_jours': round(duree.total_seconds() / 86400, 1) if duree else None,
        })
```

- [ ] **Step 4: Wire the URL**

```python
# backend/attestations/urls.py — ajouter
from .views import AttestationStatsView

urlpatterns += [
    path('stats/', AttestationStatsView.as_view()),
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && pytest tests/test_attestations.py -v`
Expected: all passed — lance la suite complète du fichier pour vérifier l'absence de régression sur les tasks précédentes.

- [ ] **Step 6: Commit**

```bash
git add backend/attestations/views.py backend/attestations/urls.py backend/tests/test_attestations.py
git commit -m "feat(attestations): reporting par gestionnaire/employé"
```

---

### Task 11 : Visibilité du journal d'audit pour GESTIONNAIRE

**Files:**
- Modify: `backend/audit/views.py:61-64` (`AuditLogListView.get`)
- Test: `backend/tests/test_audit_visibility.py` (nouveau fichier, ou ajout au fichier de test audit existant si présent — vérifier avec `ls backend/tests/test_audit*`)

**Interfaces:**
- Consumes: rien de nouveau, modification pure de la clause `Q()` existante.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_audit_visibility.py
import pytest
from rest_framework.test import APIClient
from audit.models import AuditLog

pytestmark = pytest.mark.django_db


def test_admin_sees_gestionnaire_actions_in_audit_log(admin_user, gestionnaire_user):
    AuditLog.log_test_helper = None  # placeholder removed below if AuditLog.log needs a request; use direct create instead
    AuditLog.objects.create(
        user=gestionnaire_user, username_snapshot=gestionnaire_user.username,
        action=AuditLog.Action.CREATE_ATTESTATION, target_label='test',
    )
    client = APIClient()
    client.force_authenticate(admin_user)
    resp = client.get('/api/reporting/audit-logs/')  # vérifier le préfixe exact dans audit/urls.py avant d'exécuter
    assert resp.status_code == 200
    usernames = [r['username_snapshot'] for r in resp.data['results']]
    assert gestionnaire_user.username in usernames
```

Before running, check the exact registered URL for `AuditLogListView` with `grep -n "AuditLogListView" backend/audit/urls.py` and adjust the request path in the test accordingly (the plan's guess `/api/reporting/audit-logs/` follows the `reporting/` prefix seen in `config/urls.py`, but the exact suffix must be confirmed against `audit/urls.py`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_audit_visibility.py -v`
Expected: FAIL — le gestionnaire n'apparaît pas dans `usernames` (filtre encore limité à CONSULTANT)

- [ ] **Step 3: Implement**

```python
# backend/audit/views.py:61-64 — remplacer
        else:
            qs = qs.filter(
                Q(user=request.user) | Q(user__role__in=['CONSULTANT', 'GESTIONNAIRE'])
            )
```

Update the docstring above (`audit/views.py:39-45`) to mention GESTIONNAIRE alongside CONSULTANT, consistent with CLAUDE.md's convention of keeping doc comments accurate.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_audit_visibility.py -v`
Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add backend/audit/views.py backend/tests/test_audit_visibility.py
git commit -m "feat(audit): étend la visibilité ADMIN du journal aux comptes GESTIONNAIRE"
```

---

### Task 12 : Frontend — routes, rôle GESTIONNAIRE dans `/users`, Navbar + badge

**Files:**
- Modify: `frontend/src/App.js` (nouvelles routes, ajoutées dans ce task en placeholder de navigation — les composants réels arrivent Tasks 13-15)
- Modify: `frontend/src/pages/Users.jsx` (select de rôle, libellé, modale Périmètre)
- Modify: `frontend/src/components/Navbar.jsx` (lien + badge)
- Test: `frontend/src/__tests__/Navbar.test.jsx` (étend le test existant si présent, sinon nouveau)
- Test: `frontend/src/__tests__/Users.test.jsx` (étend le test existant — vérifier avec `ls frontend/src/__tests__/Users*`)

**Interfaces:**
- Consumes: `GET /api/attestations/demandes/?statut=recue&statut=imprimee&statut=signee&statut=prete` pour le compteur (ou un paramètre dédié — voir Step 3).
- Produces: route `/attestations` protégée pour ADMIN+GESTIONNAIRE, badge `pendingCount` dans `Navbar`.

- [ ] **Step 1: Check existing role select markup in Users.jsx**

Run: `grep -n "CONSULTANT\|Role.choices\|<select" frontend/src/pages/Users.jsx | head -30`
Read the surrounding 20 lines of the role `<select>` (`frontend/src/pages/Users.jsx`) to match its exact JSX structure before editing — this plan assumes a `<select value={form.role} onChange={...}>` with `<option value="CONSULTANT">Consultant</option>` etc., mirror that exact pattern.

- [ ] **Step 2: Add GESTIONNAIRE option and libelle_role field**

```jsx
// frontend/src/pages/Users.jsx — dans le <select> de rôle, ajouter une option
<option value="GESTIONNAIRE">Gestionnaire</option>
```

```jsx
// frontend/src/pages/Users.jsx — juste après le select de rôle, afficher
// conditionnellement le champ libellé (uniquement si role === 'GESTIONNAIRE')
{form.role === 'GESTIONNAIRE' && (
  <div style={{ marginTop: 12 }}>
    <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
      Libellé d'affichage (optionnel)
    </label>
    <input
      className="input-focus"
      placeholder="Ex. Secrétaire, Superviseur..."
      value={form.libelle_role || ''}
      onChange={(e) => setForm({ ...form, libelle_role: e.target.value })}
      style={{
        width: '100%', padding: '8px 10px', borderRadius: 6,
        border: `1px solid ${theme.border}`, fontSize: 13, marginTop: 4,
      }}
    />
  </div>
)}
```

- [ ] **Step 3: Make the "Périmètre" section visible for GESTIONNAIRE too**

Run: `grep -n "role === 'CONSULTANT'\|role === \"CONSULTANT\"" frontend/src/pages/Users.jsx`
For every occurrence gating the "Périmètre" button/modal on `role === 'CONSULTANT'`, change the condition to `['CONSULTANT', 'GESTIONNAIRE'].includes(role)` (adapt variable name — `form.role`, `user.role`, or `editingUser.role` depending on the exact call site found).

- [ ] **Step 4: Add the navbar link and pending-count badge**

```jsx
// frontend/src/components/Navbar.jsx — ajouter à navLinks, visible ADMIN + GESTIONNAIRE
const navLinks = [
  { path: "/employees", label: "Personnel" },
  { path: "/organigramme", label: "Organigramme" },
  {
    path: "/attestations", label: "Attestations",
    show: ["ADMIN", "SUPERADMIN", "GESTIONNAIRE"].includes(user?.role),
  },
  { path: "/dashboard", label: "Tableau de bord", adminOnly: true },
  { path: "/statistiques", label: "Statistiques", adminOnly: true },
  { path: "/recherche-documents", label: "Recherche OCR", adminOnly: true },
].filter((item) =>
  item.show !== undefined ? item.show : (!item.adminOnly || ["ADMIN", "SUPERADMIN"].includes(user?.role))
);
```

```jsx
// frontend/src/components/Navbar.jsx — ajouter un state + fetch du compteur,
// juste au-dessus du render (à côté de la déclaration de `user`)
const [pendingAttestations, setPendingAttestations] = useState(0);

useEffect(() => {
  if (!["ADMIN", "SUPERADMIN"].includes(user?.role)) return;
  let cancelled = false;
  api.get("/attestations/demandes/", { params: { pending: 1 } })
    .then((res) => {
      if (cancelled) return;
      const results = res.data?.results || res.data || [];
      setPendingAttestations(results.length);
    })
    .catch(() => {});
  return () => { cancelled = true; };
}, [user?.role]);
```

```jsx
// frontend/src/components/Navbar.jsx — dans le rendu du lien "Attestations",
// ajouter le badge à côté du label
{link.label}
{link.path === "/attestations" && pendingAttestations > 0 && (
  <span style={{
    marginLeft: 6, background: theme.danger, color: "#fff",
    borderRadius: 999, fontSize: 10, fontWeight: 700,
    padding: "1px 6px", display: "inline-block",
  }}>
    {pendingAttestations}
  </span>
)}
```

Add a `?pending=1` query param handling on the backend list view (small addition to `DemandeAttestationListCreateView.get_queryset`, Task 5's view) — done here since it's needed for the badge:

```python
# backend/attestations/views.py — dans DemandeAttestationListCreateView.get_queryset,
# après le bloc `if user.is_admin:` existant
        if user.is_admin:
            statut = self.request.query_params.get('statut')
            if statut:
                qs = qs.filter(statut=statut)
            if self.request.query_params.get('pending'):
                qs = qs.exclude(statut__in=['recuperee', 'rejetee'])
            return qs
```

- [ ] **Step 5: Write/adjust the Navbar test**

```jsx
// frontend/src/__tests__/Navbar.test.jsx — ajouter un test (vérifier d'abord
// la structure du fichier existant avec `ls frontend/src/__tests__/Navbar*`
// et le pattern de mock d'AuthContext/api déjà utilisé dans ce fichier)
test("affiche le lien Attestations pour un GESTIONNAIRE", () => {
  // reprendre le mock AuthContext existant du fichier avec role: 'GESTIONNAIRE'
  // puis vérifier screen.getByText('Attestations') est présent
  // et screen.queryByText('Tableau de bord') est absent (adminOnly)
});
```

- [ ] **Step 6: Run frontend tests**

Run: `cd frontend && npm test -- Navbar Users --watchAll=false`
Expected: PASS (ajuster les mocks selon la structure réelle des fichiers de test trouvée au Step 1/5)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Users.jsx frontend/src/components/Navbar.jsx frontend/src/__tests__/Navbar.test.jsx backend/attestations/views.py
git commit -m "feat(frontend): rôle GESTIONNAIRE dans /users, lien+badge Attestations navbar"
```

---

### Task 13 : Page liste `/attestations` (+ filtre) et badge de statut réutilisable

**Files:**
- Create: `frontend/src/components/attestations/StatutBadge.jsx`
- Create: `frontend/src/pages/Attestations.jsx`
- Modify: `frontend/src/App.js` (route `/attestations`)
- Test: `frontend/src/__tests__/Attestations.test.jsx`

**Interfaces:**
- Consumes: `GET /api/attestations/demandes/?statut=` (Task 5), `theme.js` tokens, `heroPadding`/`contentPadding`, `useIsMobile`.
- Produces: composant `StatutBadge({ statut })`, page `Attestations` exportée par défaut, réutilisée par Task 14/15.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/Attestations.test.jsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Attestations from "../pages/Attestations";
import api from "../services/api"; // vérifier le chemin exact du module api avec `grep -rn "from.*services/api" frontend/src/pages/Employees.jsx`
import { AuthContext } from "../context/AuthContext"; // idem, vérifier le nom exact exporté

jest.mock("../services/api");

const renderWithAuth = (role) =>
  render(
    <AuthContext.Provider value={{ user: { role, full_name: "Test User" } }}>
      <MemoryRouter>
        <Attestations />
      </MemoryRouter>
    </AuthContext.Provider>
  );

test("affiche la liste des demandes reçues de l'API", async () => {
  api.get.mockResolvedValueOnce({
    data: {
      results: [
        { id: "1", reference: "00001/26", employee_nom: "Jean Dupont", statut: "recue", demandeur_nom: "Ali Ben" },
      ],
    },
  });
  renderWithAuth("ADMIN");
  await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
  expect(screen.getByText("Jean Dupont")).toBeInTheDocument();
});

test("un GESTIONNAIRE voit un bouton Nouvelle demande", async () => {
  api.get.mockResolvedValueOnce({ data: { results: [] } });
  renderWithAuth("GESTIONNAIRE");
  await waitFor(() => expect(screen.getByText(/Nouvelle demande/i)).toBeInTheDocument());
});
```

Before writing further, run `grep -n "import api from\|import.*AuthContext" frontend/src/pages/Employees.jsx` to confirm the exact import paths/names, and adjust the test imports accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Attestations --watchAll=false`
Expected: FAIL — `Cannot find module '../pages/Attestations'`

- [ ] **Step 3: Implement StatutBadge**

```jsx
// frontend/src/components/attestations/StatutBadge.jsx
import theme from "../../styles/theme";

const STATUT_META = {
  recue: { label: "Reçue", bg: theme.badgeBg, color: theme.badgeColor },
  imprimee: { label: "Imprimée", bg: theme.accentBg, color: theme.accent },
  signee: { label: "Signée", bg: theme.accentBg, color: theme.accent },
  prete: { label: "Prête", bg: theme.primaryBg, color: theme.primary },
  recuperee: { label: "Récupérée", bg: theme.primaryBg, color: theme.primary },
  rejetee: { label: "Rejetée", bg: theme.dangerBg, color: theme.danger },
};

export default function StatutBadge({ statut }) {
  const meta = STATUT_META[statut] || { label: statut, bg: theme.badgeBg, color: theme.badgeColor };
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "3px 10px", fontSize: 11, fontWeight: 700, display: "inline-block",
      }}
    >
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 4: Implement the list page**

```jsx
// frontend/src/pages/Attestations.jsx
import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import theme, { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";

const STATUTS = [
  { value: "", label: "Tous" },
  { value: "recue", label: "Reçue" },
  { value: "imprimee", label: "Imprimée" },
  { value: "signee", label: "Signée" },
  { value: "prete", label: "Prête" },
  { value: "recuperee", label: "Récupérée" },
  { value: "rejetee", label: "Rejetée" },
];

export default function Attestations() {
  const { user } = useContext(AuthContext);
  const isMobile = useIsMobile();
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const [demandes, setDemandes] = useState([]);
  const [statutFiltre, setStatutFiltre] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchDemandes = async (statut = statutFiltre, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = statut ? { statut } : {};
      const res = await api.get("/attestations/demandes/", { params });
      setDemandes(res.data?.results || res.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemandes(); }, [statutFiltre]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: theme.textSecondary }}>Chargement...</div>;

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>Demandes d'attestation de travail</h1>
        {["GESTIONNAIRE", "ADMIN", "SUPERADMIN"].includes(user?.role) && (
          <Link to="/attestations/nouvelle" className="btn-lift" style={{
            display: "inline-block", marginTop: 16, background: "#fff", color: theme.primary,
            borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none",
          }}>
            + Nouvelle demande
          </Link>
        )}
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 1200, margin: "0 auto" }}>
        {isAdmin && (
          <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUTS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatutFiltre(s.value)}
                style={{
                  padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${statutFiltre === s.value ? theme.primary : theme.border}`,
                  background: statutFiltre === s.value ? theme.primaryBg : theme.surface,
                  color: statutFiltre === s.value ? theme.primary : theme.textSecondary,
                  cursor: "pointer",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", color: theme.textSecondary }}>
                <th style={{ padding: 10 }}>Référence</th>
                <th style={{ padding: 10 }}>Employé</th>
                <th style={{ padding: 10 }}>Demandeur</th>
                <th style={{ padding: 10 }}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {demandes.map((d) => (
                <tr key={d.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                  <td style={{ padding: 10 }}>
                    <Link to={`/attestations/${d.id}`} style={{ color: theme.primary, fontWeight: 700, textDecoration: "none" }}>
                      {d.reference}
                    </Link>
                  </td>
                  <td style={{ padding: 10 }}>{d.employee_nom}</td>
                  <td style={{ padding: 10 }}>{d.demandeur_nom}</td>
                  <td style={{ padding: 10 }}><StatutBadge statut={d.statut} /></td>
                </tr>
              ))}
              {demandes.length === 0 && (
                <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: theme.textMuted }}>Aucune demande.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the route**

```jsx
// frontend/src/App.js — ajouter, à côté des autres routes protégées
<Route path="/attestations" element={<ProtectedRoute><Attestations /></ProtectedRoute>} />
```
Import `Attestations` en haut du fichier (`import Attestations from "./pages/Attestations";`), en suivant le style d'import des autres pages déjà listées.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- Attestations --watchAll=false`
Expected: PASS (2 tests) — ajuster les noms de mocks selon la structure réelle trouvée au Step 1

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Attestations.jsx frontend/src/components/attestations frontend/src/App.js frontend/src/__tests__/Attestations.test.jsx
git commit -m "feat(frontend): page liste /attestations"
```

---

### Task 14 : Page `/attestations/nouvelle` (formulaire de création)

**Files:**
- Create: `frontend/src/pages/AttestationNouvelle.jsx`
- Modify: `frontend/src/App.js`
- Test: `frontend/src/__tests__/AttestationNouvelle.test.jsx`

**Interfaces:**
- Consumes: `GET /api/employees/search/?q=` (scope déjà appliqué serveur), `GET /api/employees/<id>/` (pour lister ses contrats si besoin — ou `EmployeeListSerializer`/`EmployeeDetailSerializer` expose déjà `contrats`, vérifier avant de coder), `POST /api/attestations/demandes/` (Task 5).

- [ ] **Step 1: Check the employee detail response shape for contrats**

Run: `grep -n "'contrats'" backend/employees/serializers.py`
Confirms whether `EmployeeDetailSerializer` already exposes a `contrats` list (with `id`/`numero_contrat`) — use that field to populate the "Contrat concerné" select once an employee is chosen, instead of a separate endpoint.

- [ ] **Step 2: Write the failing test**

```jsx
// frontend/src/__tests__/AttestationNouvelle.test.jsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import AttestationNouvelle from "../pages/AttestationNouvelle";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";

jest.mock("../services/api");

test("recherche un employé puis soumet la demande", async () => {
  api.get.mockResolvedValueOnce({ data: [{ id: "emp1", nom: "Dupont", prenom: "Jean", matricule: "M1", contrats: [] }] });
  api.post.mockResolvedValueOnce({ data: { id: "d1", reference: "00001/26" } });

  render(
    <AuthContext.Provider value={{ user: { role: "GESTIONNAIRE" } }}>
      <MemoryRouter><AttestationNouvelle /></MemoryRouter>
    </AuthContext.Provider>
  );

  await userEvent.type(screen.getByLabelText(/employé/i), "Dupont");
  await waitFor(() => expect(screen.getByText(/Dupont Jean/)).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Dupont Jean/));
  await userEvent.type(screen.getByLabelText(/motif/i), "Dossier administratif");
  fireEvent.click(screen.getByText(/Envoyer la demande/i));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/attestations/demandes/",
    expect.objectContaining({ employee: "emp1", motif: "Dossier administratif" })
  ));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- AttestationNouvelle --watchAll=false`
Expected: FAIL — module introuvable

- [ ] **Step 4: Implement the form page**

```jsx
// frontend/src/pages/AttestationNouvelle.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import theme, { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";

export default function AttestationNouvelle() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [contratId, setContratId] = useState("");
  const [motif, setMotif] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async (value) => {
    setQuery(value);
    setEmployee(null);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    const res = await api.get("/employees/search/", { params: { q: value } });
    setSuggestions(res.data || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employee) { setError("Sélectionnez un employé dans la liste."); return; }
    setSubmitting(true);
    try {
      const payload = { employee: employee.id, motif, commentaire };
      if (contratId) payload.contrat = contratId;
      const res = await api.post("/attestations/demandes/", payload);
      navigate(`/attestations/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.motif?.[0] || "Impossible de créer la demande.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>Nouvelle demande d'attestation</h1>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 600, margin: "0 auto" }}>
        <form onSubmit={handleSubmit}>
          <label htmlFor="employe-search" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Employé</label>
          <input
            id="employe-search"
            className="input-focus"
            value={employee ? `${employee.prenom} ${employee.nom}` : query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nom, prénom ou matricule..."
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 8 }}
          />
          {suggestions.length > 0 && !employee && (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, marginBottom: 12 }}>
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setEmployee(s); setSuggestions([]); }}
                  style={{ padding: 8, cursor: "pointer", borderBottom: `1px solid ${theme.borderLight}` }}
                >
                  {s.prenom} {s.nom} — {s.matricule}
                </div>
              ))}
            </div>
          )}

          {employee?.contrats?.length > 1 && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Contrat concerné</label>
              <select
                value={contratId}
                onChange={(e) => setContratId(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12 }}
              >
                <option value="">-- Sélectionner --</option>
                {employee.contrats.map((c) => (
                  <option key={c.id} value={c.id}>{c.numero_contrat}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="motif" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Motif</label>
          <input
            id="motif"
            className="input-focus"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. Dossier administratif, Banque..."
            required
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 12 }}
          />

          <label htmlFor="commentaire" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>Commentaire (optionnel)</label>
          <textarea
            id="commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4, marginBottom: 16 }}
          />

          {error && <div style={{ color: theme.danger, marginBottom: 12 }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-lift"
            style={{
              background: theme.primary, color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontWeight: 700, cursor: submitting ? "default" : "pointer",
            }}
          >
            Envoyer la demande
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire the route**

```jsx
// frontend/src/App.js — ajouter
<Route path="/attestations/nouvelle" element={<ProtectedRoute><AttestationNouvelle /></ProtectedRoute>} />
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm test -- AttestationNouvelle --watchAll=false`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AttestationNouvelle.jsx frontend/src/App.js frontend/src/__tests__/AttestationNouvelle.test.jsx
git commit -m "feat(frontend): formulaire de création /attestations/nouvelle"
```

---

### Task 15 : Page `/attestations/:id` (détail, statuts, aperçu, scan, annulation)

**Files:**
- Create: `frontend/src/pages/AttestationDetail.jsx`
- Modify: `frontend/src/App.js`
- Test: `frontend/src/__tests__/AttestationDetail.test.jsx`

**Interfaces:**
- Consumes: `GET /api/attestations/demandes/<id>/` (Task 5), `PATCH .../statut/` (Task 6), `POST .../scan/` (Task 7), `GET .../apercu/` (Task 9, ouvert via `window.open`), `useConfirm`/`usePrompt` (`components/ConfirmDialog.jsx`).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/AttestationDetail.test.jsx
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AttestationDetail from "../pages/AttestationDetail";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";

jest.mock("../services/api");

const renderDetail = (role) => render(
  <AuthContext.Provider value={{ user: { role, id: "u1" } }}>
    <MemoryRouter initialEntries={["/attestations/d1"]}>
      <Routes><Route path="/attestations/:id" element={<AttestationDetail />} /></Routes>
    </MemoryRouter>
  </AuthContext.Provider>
);

test("un ADMIN peut faire avancer le statut", async () => {
  api.get.mockResolvedValueOnce({ data: {
    id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif: "Dossier administratif",
    statut: "recue", demandeur: "u2", demandeur_nom: "Ali Ben", commentaire: "",
  }});
  api.patch.mockResolvedValueOnce({ data: { statut: "imprimee" } });
  renderDetail("ADMIN");
  await waitFor(() => expect(screen.getByText("00001/26")).toBeInTheDocument());
  fireEvent.click(screen.getByText(/Marquer Imprimée/i));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/attestations/demandes/d1/statut/", { statut: "imprimee" }
  ));
});

test("un GESTIONNAIRE voit un bouton Annuler si statut Reçue et qu'il est l'auteur", async () => {
  api.get.mockResolvedValueOnce({ data: {
    id: "d1", reference: "00001/26", employee_nom: "Jean Dupont", motif: "Dossier administratif",
    statut: "recue", demandeur: "u1", demandeur_nom: "Moi", commentaire: "",
  }});
  renderDetail("GESTIONNAIRE");
  await waitFor(() => expect(screen.getByText(/Annuler la demande/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- AttestationDetail --watchAll=false`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implement**

```jsx
// frontend/src/pages/AttestationDetail.jsx
import { useContext, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { AuthContext } from "../context/AuthContext";
import theme, { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import StatutBadge from "../components/attestations/StatutBadge";
import { useConfirm, usePrompt } from "../components/ConfirmDialog";

const PROCHAIN_STATUT = {
  recue: { value: "imprimee", label: "Marquer Imprimée" },
  imprimee: { value: "signee", label: "Marquer Signée" },
  signee: { value: "prete", label: "Marquer Prête" },
  prete: { value: "recuperee", label: "Marquer Récupérée" },
};

export default function AttestationDetail() {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isAdmin = ["ADMIN", "SUPERADMIN"].includes(user?.role);
  const { confirm, ConfirmDialog } = useConfirm();
  const { prompt, PromptDialog } = usePrompt();

  const [demande, setDemande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const fetchDemande = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/attestations/demandes/${id}/`);
      setDemande(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => { fetchDemande(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const avancerStatut = async () => {
    const suivant = PROCHAIN_STATUT[demande.statut];
    if (!suivant) return;
    try {
      await api.patch(`/attestations/demandes/${id}/statut/`, { statut: suivant.value });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || err.response?.data?.error || "Erreur lors du changement de statut.");
    }
  };

  const rejeter = async () => {
    const motif = await prompt("Motif du rejet :", "");
    if (motif === null || !motif.trim()) return;
    try {
      await api.patch(`/attestations/demandes/${id}/statut/`, { statut: "rejetee", motif_rejet: motif });
      fetchDemande(true);
    } catch (err) {
      setMessage(err.response?.data?.non_field_errors?.[0] || "Erreur lors du rejet.");
    }
  };

  const annuler = async () => {
    if (!(await confirm("Annuler cette demande ?"))) return;
    await api.delete(`/attestations/demandes/${id}/`);
    navigate("/attestations");
  };

  const uploadScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("scan_document", file);
    await api.post(`/attestations/demandes/${id}/scan/`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    fetchDemande(true);
  };

  const ouvrirApercu = () => {
    window.open(`/api/attestations/demandes/${id}/apercu/`, "_blank");
  };

  if (loading || !demande) return <div style={{ textAlign: "center", padding: 40, color: theme.textSecondary }}>Chargement...</div>;

  const peutAnnuler = demande.demandeur === user?.id && demande.statut === "recue";
  const suivant = PROCHAIN_STATUT[demande.statut];

  return (
    <div>
      <div style={{
        background: "linear-gradient(135deg, #052e16 0%, #14532d 50%, #166534 100%)",
        padding: heroPadding(isMobile),
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, margin: 0 }}>{demande.reference}</h1>
        <div style={{ marginTop: 8 }}><StatutBadge statut={demande.statut} /></div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 700, margin: "0 auto" }}>
        <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 20, marginBottom: 16 }}>
          <p><strong>Employé :</strong> {demande.employee_nom}</p>
          <p><strong>Motif :</strong> {demande.motif}</p>
          {demande.commentaire && <p><strong>Commentaire :</strong> {demande.commentaire}</p>}
          <p><strong>Demandeur :</strong> {demande.demandeur_nom}</p>
          {demande.motif_rejet && <p style={{ color: theme.danger }}><strong>Motif de rejet :</strong> {demande.motif_rejet}</p>}
        </div>

        {message && <div style={{ color: theme.danger, marginBottom: 12 }}>{message}</div>}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && (
            <button onClick={ouvrirApercu} className="btn-lift" style={{
              background: theme.surface, color: theme.primary, border: `1px solid ${theme.primaryBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Aperçu / Imprimer
            </button>
          )}
          {isAdmin && suivant && (
            <button onClick={avancerStatut} className="btn-lift" style={{
              background: theme.primary, color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              {suivant.label}
            </button>
          )}
          {isAdmin && demande.statut !== "recuperee" && demande.statut !== "rejetee" && (
            <button onClick={rejeter} className="btn-lift" style={{
              background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Rejeter
            </button>
          )}
          {peutAnnuler && (
            <button onClick={annuler} className="btn-lift" style={{
              background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`,
              borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer",
            }}>
              Annuler la demande
            </button>
          )}
        </div>

        {isAdmin && (
          <div style={{ marginTop: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
              Scan du document signé (optionnel)
            </label>
            <input type="file" accept="application/pdf,image/*" onChange={uploadScan} style={{ display: "block", marginTop: 6 }} />
            {demande.scan_document && (
              <a href={demande.scan_document} target="_blank" rel="noreferrer" style={{ color: theme.primary, fontSize: 12 }}>
                Voir le scan déjà envoyé
              </a>
            )}
          </div>
        )}
      </div>
      {ConfirmDialog}
      {PromptDialog}
    </div>
  );
}
```

- [ ] **Step 4: Wire the route**

```jsx
// frontend/src/App.js — ajouter
<Route path="/attestations/:id" element={<ProtectedRoute><AttestationDetail /></ProtectedRoute>} />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- AttestationDetail --watchAll=false`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AttestationDetail.jsx frontend/src/App.js frontend/src/__tests__/AttestationDetail.test.jsx
git commit -m "feat(frontend): page détail /attestations/:id (statuts, aperçu, scan, annulation)"
```

---

### Task 16 : Onglet reporting sur `/attestations`

**Files:**
- Modify: `frontend/src/pages/Attestations.jsx` (ajoute un sous-onglet "Statistiques")
- Test: `frontend/src/__tests__/Attestations.test.jsx` (étend)

**Interfaces:**
- Consumes: `GET /api/attestations/stats/` (Task 10).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/Attestations.test.jsx — ajouter
test("l'onglet Statistiques affiche le nombre de demandes par gestionnaire", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/attestations/demandes/") return Promise.resolve({ data: { results: [] } });
    if (url === "/attestations/stats/") return Promise.resolve({
      data: { par_gestionnaire: [{ demandeur_nom: "Ali Ben", count: 4 }], par_employe: [], par_statut: {}, delai_moyen_jours: 2.5 },
    });
    return Promise.resolve({ data: {} });
  });
  renderWithAuth("ADMIN");
  fireEvent.click(await screen.findByText(/Statistiques/i));
  await waitFor(() => expect(screen.getByText("Ali Ben")).toBeInTheDocument());
  expect(screen.getByText("4")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Attestations --watchAll=false`
Expected: FAIL — pas d'onglet "Statistiques" dans le DOM

- [ ] **Step 3: Implement**

```jsx
// frontend/src/pages/Attestations.jsx — ajouter l'état et le rendu de l'onglet
const [sousOnglet, setSousOnglet] = useState("liste");
const [stats, setStats] = useState(null);

useEffect(() => {
  if (sousOnglet === "stats" && isAdmin && !stats) {
    api.get("/attestations/stats/").then((res) => setStats(res.data));
  }
}, [sousOnglet, isAdmin, stats]);
```

```jsx
// frontend/src/pages/Attestations.jsx — dans le rendu, juste après le hero,
// avant le bloc de filtres existant, ajouter les onglets (ADMIN only)
{isAdmin && (
  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
    <button onClick={() => setSousOnglet("liste")} style={{
      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 12,
      background: sousOnglet === "liste" ? theme.primaryBg : "transparent",
      color: sousOnglet === "liste" ? theme.primary : theme.textSecondary,
    }}>
      Liste
    </button>
    <button onClick={() => setSousOnglet("stats")} style={{
      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
      fontWeight: 700, fontSize: 12,
      background: sousOnglet === "stats" ? theme.primaryBg : "transparent",
      color: sousOnglet === "stats" ? theme.primary : theme.textSecondary,
    }}>
      Statistiques
    </button>
  </div>
)}
{sousOnglet === "stats" && isAdmin ? (
  <div>
    <h3 style={{ fontSize: 13, textTransform: "uppercase", color: theme.textSecondary }}>Par gestionnaire</h3>
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
      <tbody>
        {(stats?.par_gestionnaire || []).map((r) => (
          <tr key={r.demandeur_nom} style={{ borderTop: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8 }}>{r.demandeur_nom}</td>
            <td style={{ padding: 8, fontWeight: 700 }}>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <h3 style={{ fontSize: 13, textTransform: "uppercase", color: theme.textSecondary }}>Par employé</h3>
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {(stats?.par_employe || []).map((r) => (
          <tr key={r.employee_id} style={{ borderTop: `1px solid ${theme.border}` }}>
            <td style={{ padding: 8 }}>{r.employee_nom}</td>
            <td style={{ padding: 8, fontWeight: 700 }}>{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
) : (
  // ... bloc "Liste" existant (filtres + table) reste inchangé, englobé dans
  // un fragment conditionné par `sousOnglet === "liste" || !isAdmin`
)}
```

Wrap the existing filter+table block (already written in Task 13) inside `{(sousOnglet === "liste" || !isAdmin) && ( ... )}` rather than rewriting it — the plan text above shows the new branch only, the pre-existing JSX from Task 13 is reused as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Attestations --watchAll=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Attestations.jsx frontend/src/__tests__/Attestations.test.jsx
git commit -m "feat(frontend): onglet Statistiques sur /attestations"
```

---

### Task 17 : Configuration du modèle dans `/parametres`

**Files:**
- Modify: `frontend/src/config/parametresTabs.js`
- Modify: `frontend/src/pages/Parametres.jsx`
- Test: `frontend/src/__tests__/Parametres.test.jsx` (étend le fichier existant)

**Interfaces:**
- Consumes: `GET/PUT /api/attestations/config/` (Task 8).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/Parametres.test.jsx — ajouter (vérifier d'abord la
// structure exacte des tests existants avec `grep -n "describe\|test(" frontend/src/__tests__/Parametres.test.jsx`
// et adapter les mocks/imports en conséquence)
test("l'onglet Attestation de travail charge et enregistre la configuration", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/attestations/config/") return Promise.resolve({ data: { societe_nom: "SOMIZ", ville: "Arzew" } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValueOnce({ data: { societe_nom: "SOMIZ", ville: "Oran" } });
  // ... render Parametres, cliquer sur l'onglet "Attestation de travail",
  // modifier le champ Ville, cliquer Enregistrer, vérifier api.put appelé
  // avec le payload attendu (adapter selon les sélecteurs réels utilisés
  // ailleurs dans ce fichier de test pour changer d'onglet)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Parametres --watchAll=false`
Expected: FAIL — onglet introuvable

- [ ] **Step 3: Register the tab**

```js
// frontend/src/config/parametresTabs.js — ajouter à TABS
{ key: "attestation-config", label: "Attestation de travail" },
```

```js
// frontend/src/config/parametresTabs.js — ajouter un groupe ou l'inclure
// dans un groupe existant pertinent (ex. "Dossier RH")
{ label: "Dossier RH", keys: ["types-documents", "champs-personnalises", "motifs-archivage", "attestation-config"] },
```

```js
// frontend/src/config/parametresTabs.js — ajouter aux deux sets existants
// (pas d'import CSV ni de fusion générique pour ce singleton)
export const IMPORT_UNSUPPORTED_TABS = new Set([
  "types-documents",
  "champs-personnalises",
  "attestation-config",
]);

export const MERGE_UNSUPPORTED_TABS = new Set([
  "types-documents",
  "champs-personnalises",
  "attestation-config",
]);
```

- [ ] **Step 4: Render a dedicated form for this tab (singleton, not RefTable/RefForm)**

```jsx
// frontend/src/pages/Parametres.jsx — ajouter un composant dédié, rendu
// conditionnellement quand activeTab === "attestation-config" à la place
// du bloc RefTable/RefForm générique
function AttestationConfigPanel() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/attestations/config/").then((res) => setConfig(res.data));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put("/attestations/config/", config);
      setConfig(res.data);
      setMessage("Configuration enregistrée.");
    } catch {
      setMessage("Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  if (!config) return <div style={{ color: theme.textSecondary }}>Chargement...</div>;

  const champ = (key, label) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>{label}</label>
      <input
        className="input-focus"
        value={config[key] || ""}
        onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${theme.border}`, marginTop: 4 }}
      />
    </div>
  );

  return (
    <form onSubmit={handleSave} style={{ maxWidth: 500 }}>
      {champ("societe_nom", "Nom de la société")}
      {champ("societe_soustitre", "Sous-titre")}
      {champ("societe_capital", "Capital social")}
      {champ("holding", "Holding")}
      {champ("adresse", "Adresse")}
      {champ("ville", "Ville")}
      {champ("telephone", "Téléphone")}
      {champ("fax", "Fax")}
      {champ("telex", "Télex")}
      {champ("signataire_titre", "Titre du signataire")}
      {champ("signataire_nom", "Nom du signataire")}
      {message && <div style={{ color: theme.primary, marginBottom: 12 }}>{message}</div>}
      <button type="submit" disabled={saving} className="btn-lift" style={{
        background: theme.primary, color: "#fff", border: "none", borderRadius: 8,
        padding: "10px 20px", fontWeight: 700, cursor: saving ? "default" : "pointer",
      }}>
        Enregistrer
      </button>
    </form>
  );
}
```

```jsx
// frontend/src/pages/Parametres.jsx — dans le rendu principal, avant le
// bloc RefTable/RefForm générique, ajouter :
{activeTab === "attestation-config" ? (
  <AttestationConfigPanel />
) : (
  // ... bloc RefTable/RefForm existant, inchangé
)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- Parametres --watchAll=false`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/config/parametresTabs.js frontend/src/pages/Parametres.jsx frontend/src/__tests__/Parametres.test.jsx
git commit -m "feat(frontend): onglet configuration Attestation de travail dans /parametres"
```

---

### Task 18 : Bouton "Demander une attestation" sur la fiche employé

**Files:**
- Modify: `frontend/src/components/employeeDetail/DossierTab.jsx:624-665`
- Test: `frontend/src/__tests__/DossierTab.test.jsx` (vérifier le nom exact du fichier avec `ls frontend/src/__tests__/DossierTab*` avant d'écrire)

**Interfaces:**
- Consumes: `react-router-dom` `useNavigate` ou `Link`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/DossierTab.test.jsx — ajouter (adapter le render
// existant du fichier : props employee/user déjà mockées ailleurs dans ce
// fichier, réutiliser le même pattern de rendu)
test("un GESTIONNAIRE voit le bouton Demander une attestation", () => {
  // render DossierTab avec user.role = 'GESTIONNAIRE' (adapter au pattern
  // de rendu déjà utilisé plus haut dans ce fichier de test)
  expect(screen.getByText(/Demander une attestation/i)).toBeInTheDocument();
});

test("un CONSULTANT ne voit pas le bouton", () => {
  // render DossierTab avec user.role = 'CONSULTANT'
  expect(screen.queryByText(/Demander une attestation/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- DossierTab --watchAll=false`
Expected: FAIL — bouton absent

- [ ] **Step 3: Implement**

```jsx
// frontend/src/components/employeeDetail/DossierTab.jsx — ajouter l'import en haut du fichier
import { useNavigate } from "react-router-dom";
```

```jsx
// frontend/src/components/employeeDetail/DossierTab.jsx — dans le composant,
// récupérer navigate (à côté des autres hooks déjà déclarés)
const navigate = useNavigate();
```

```jsx
// frontend/src/components/employeeDetail/DossierTab.jsx — juste avant le
// bloc existant `{["ADMIN", "SUPERADMIN"].includes(user?.role) && (...)}`
// (L624), ajouter un bloc séparé visible aussi pour GESTIONNAIRE
{["ADMIN", "SUPERADMIN", "GESTIONNAIRE"].includes(user?.role) && (
  <div style={{ padding: "0 16px 12px" }}>
    <button
      onClick={() => navigate("/attestations/nouvelle", { state: { employeeId: employee.id } })}
      className="btn-lift"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        width: "100%", background: theme.surface, color: theme.primary,
        border: `1px solid ${theme.primaryBorder}`, borderRadius: 6,
        padding: "8px", fontSize: 12, fontWeight: 700, cursor: "pointer",
      }}
    >
      Demander une attestation
    </button>
  </div>
)}
```

- [ ] **Step 4: Pre-fill the employee on AttestationNouvelle when navigated with state**

```jsx
// frontend/src/pages/AttestationNouvelle.jsx — ajouter, en haut du composant
import { useLocation } from "react-router-dom";
// ...
const location = useLocation();
```

```jsx
// frontend/src/pages/AttestationNouvelle.jsx — ajouter un effet pour
// pré-remplir l'employé si on arrive avec un employeeId dans le state
useEffect(() => {
  const employeeId = location.state?.employeeId;
  if (!employeeId) return;
  api.get(`/employees/${employeeId}/`).then((res) => setEmployee(res.data));
}, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test -- DossierTab AttestationNouvelle --watchAll=false`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/employeeDetail/DossierTab.jsx frontend/src/pages/AttestationNouvelle.jsx frontend/src/__tests__/DossierTab.test.jsx
git commit -m "feat(frontend): bouton Demander une attestation sur la fiche employé"
```

---

### Task 19 : Documentation — `CLAUDE.md` et `securite.md`

**Files:**
- Modify: `CLAUDE.md` (nouvelle section "Demandes d'attestation de travail", tableau des rôles, tableau des routes)
- Modify: `securite.md` (nouveau point numéroté)

**Interfaces:** aucune (documentation pure).

- [ ] **Step 1: Add the role to the roles table**

Add `GESTIONNAIRE` to the "Rôles utilisateurs" bullet list at the top of `CLAUDE.md`, one line, following the existing SUPERADMIN/ADMIN/CONSULTANT bullet style:

```markdown
- `GESTIONNAIRE` — lecture seule type CONSULTANT sur son périmètre
  organisationnel (même scoping, mêmes champs `scope_*`), plus le droit de
  créer des demandes d'attestation de travail pour les employés de ce
  périmètre (voir section "Demandes d'attestation de travail"). Libellé
  d'affichage personnalisable par compte (`User.libelle_role`, ex.
  "Secrétaire", "Superviseur") — purement cosmétique, aucune permission
  différente selon le libellé.
```

- [ ] **Step 2: Add the full feature section**

Insert a new `## Demandes d'attestation de travail (2026-09-22)` section into `CLAUDE.md`, summarizing: workflow statuses, `DemandeAttestation`/`AttestationTemplateConfig` models, endpoints table, and the routes table entry (`/attestations`, `/attestations/nouvelle`, `/attestations/:id`), formatted consistently with existing sections (e.g. "Archivage employé (2026-09-02)") — condense the approved design spec at `docs/superpowers/specs/2026-09-22-demandes-attestation-travail-design.md` into ~40 lines rather than duplicating it verbatim.

- [ ] **Step 3: Add the routes table row**

```markdown
| `/attestations` | Demandes d'attestation de travail (liste ADMIN, ou "mes demandes" GESTIONNAIRE) | ADMIN, GESTIONNAIRE |
| `/attestations/nouvelle` | Nouvelle demande | ADMIN, GESTIONNAIRE |
| `/attestations/:id` | Détail, traitement | ADMIN (lecture pour le demandeur) |
```
in the existing "Routes principales" table of `CLAUDE.md`.

- [ ] **Step 4: Add a securite.md entry**

Check the last point number with `grep -n "^### Point\|^## Point\|^[0-9]\+\." securite.md | tail -5`, then append a new numbered point documenting: new role GESTIONNAIRE (permission surface, reuses CONSULTANT scoping — no new attack surface on scoping itself), new `CanRequestAttestation` permission and its consent/active checks, `DemandeAttestation.employee` on `PROTECT` (prevents silent data loss on employee deletion), and that the apercu/config endpoints are `IsAdmin`-gated (GESTIONNAIRE never sees the raw template config or triggers document generation).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md securite.md
git commit -m "docs: documente le rôle GESTIONNAIRE et les demandes d'attestation de travail"
```

---

### Task 20 : Suite de tests complète + vérification finale

**Files:** aucun fichier modifié — validation pure.

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && pytest`
Expected: all tests pass (188 pré-existants + les nouveaux de ce plan) — si un test pré-existant échoue à cause d'un changement de ce plan (ex. un test qui itère sur `User.Role.choices` et attend exactement 3 valeurs), corriger ce test pour inclure GESTIONNAIRE plutôt que le supprimer.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: all tests pass (261+ pré-existants + les nouveaux) — même consigne : corriger tout test pré-existant cassé par l'ajout du rôle GESTIONNAIRE (ex. un test qui compte le nombre d'options du `<select>` de rôle dans `/users`) plutôt que le contourner.

- [ ] **Step 3: Manual smoke test (dev servers)**

Start backend (`cd backend && python manage.py runserver`) and frontend (`cd frontend && npm start`), then manually:
1. En tant que SUPERADMIN, créer un compte GESTIONNAIRE via `/users`, lui assigner un périmètre (Direction/Département) et un libellé "Secrétaire".
2. Se connecter avec ce compte, vérifier l'accès à `/employees` (scopé), et créer une demande d'attestation via `/attestations/nouvelle` ou le bouton sur une fiche employé.
3. Se reconnecter en ADMIN, vérifier le badge navbar "1 en attente", ouvrir `/attestations`, faire avancer le statut jusqu'à "Prête", vérifier l'aperçu (`Aperçu / Imprimer`) affiche correctement les données.
4. Vérifier `/audit` (en ADMIN) affiche les actions du compte GESTIONNAIRE.
5. Vérifier l'onglet "Statistiques" de `/attestations` affiche le décompte.

- [ ] **Step 4: Commit (if any smoke-test fixes were needed)**

```bash
git add -A
git commit -m "fix: corrections suite aux tests de non-régression (attestations)"
```

# Congés — noyau backend (soldes, workflow, titre PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le backend complet des demandes de congé : soldes (reliquat/annuel/anticipé), validation avec débit, rejet, annulation, interruption, bascule du 1er juillet, titre de congé PDF calé sur le modèle officiel, configuration, statistiques, audit.

**Architecture:** Nouvelle app Django `conges` calquée sur `attestations`. La logique de solde vit dans deux modules de services testables sans HTTP (`services.py` : exercice, ventilation, mouvements ; `workflow.py` : valider/rejeter/annuler/interrompre, toujours dans une transaction avec verrou sur `SoldeConge`). Chaque variation de solde écrit un `MouvementConge` immuable ; le solde doit toujours égaler la somme des mouvements. Les vues sont minces et appellent les services. Le PDF réutilise les helpers de `attestations/pdf.py`.

**Tech Stack:** Django 5.2, DRF, PostgreSQL, ReportLab, python-magic, pytest.

Spec : `docs/superpowers/specs/2026-10-20-demandes-conge-design.md`. **Plan suivant (à écrire après celui-ci)** : frontend (pages, onglet profil, panneau de validation, configuration), dont l'API est figée par ce plan.

## Global Constraints

- Jamais de hard delete d'un titre : annulation et rejet changent le statut ; l'annulation par le demandeur est un soft-delete (`is_active=False`).
- Toute opération qui modifie un solde : `transaction.atomic()` + `select_for_update()` sur `SoldeConge`, puis un `MouvementConge` (immuable : ni update ni delete).
- Solde actuel = `reliquat + annuel` ; l'anticipé n'est jamais compté. Reliquat consommé avant l'annuel. Droit annuel = 30 jours (`ParametreConge`). Exercice = 1er juillet → 30 juin, noté `AAAA/AAAA`.
- CP : débite reliquat puis annuel, l'excédent passe en anticipé (plafond = droit annuel) ; CE : aucun débit ; CS : n'ajoute qu'au `retrait_cs`. Le débit a lieu à la validation (jamais à la demande).
- Seul un traiteur (`User.can_manage_conges`) valide, rejette, annule, interrompt, saisit/corrige les soldes. Un ADMIN ordinaire ne crée jamais de demande. `charge_conge` n'est attribuable que par un SUPERADMIN.
- Toute vue listant des titres ou des soldes applique `User.can_access_employee()` (scoping) ; un demandeur ne voit que ses demandes.
- `AuditLog.action` est limité à **20 caractères** : respecter exactement les noms ci-dessous.
- Aucune valeur codée en dur dans le PDF : tout vient de `CongeTemplateConfig` et du titre. Fax par défaut des congés : `213 (0) 41.68.01.03`.
- Une permission « transversale » se vérifie par un test d'intégration sur une vraie route métier.
- Commits `type: description`, un par tâche ; `git add` uniquement des fichiers cités (le working tree contient des modifications sans rapport — utiliser `git add -p` au besoin). Après toute modification touchant `accounts`, lancer `cd backend && pytest` entier avant de commiter.
- Messages d'erreur utilisateur en français ; erreurs métier de service = sous-classes de `CongeError`.

## Noms figés (utilisés dans toutes les tâches)

**Actions d'audit** : `CREATE_CONGE`, `VALIDER_CONGE`, `REJETER_CONGE`, `RECUPERER_CONGE`, `ANNULER_CONGE`, `INTERROMPRE_CONGE`, `DELETE_CONGE`, `MODIFY_CONGE`, `INITIAL_SOLDE_CONGE`, `CORRIGER_SOLDE_CONGE`, `BASCULE_CONGE`, `APERCU_CONGE`, `SCAN_CONGE`.
**Types de notification** : `CONGE_NOUVELLE`, `CONGE_PRETE`, `CONGE_REJETEE`, `CONGE_ANNULEE`, `CONGE_INTERROMPUE`.
**Statuts** : `recue`, `prete`, `recuperee`, `rejetee`, `annulee`, `interrompue`. **Types** : `CP`, `CE`, `CS`.
**Natures de mouvement** : `INITIAL`, `DEBIT`, `RETRAIT_CS`, `RESTITUTION_ANNULATION`, `RESTITUTION_INTERRUPTION`, `BASCULE`, `CORRECTION`.

## File Structure

**Créés** — `backend/conges/` : `__init__.py`, `apps.py`, `models.py`, `reference.py`, `services.py`, `workflow.py`, `permissions.py`, `serializers.py`, `views.py`, `urls.py`, `pdf.py`, `notifications.py`, `management/commands/basculer_exercice.py`, `management/commands/verifier_soldes_conges.py`, `migrations/0001_initial.py` (générée) ; `backend/accounts/migrations/0020_user_conge_flags.py` (générée) ; tests `backend/tests/test_conges_flag.py`, `test_conges_models.py`, `test_conges_services.py`, `test_conges_workflow.py`, `test_conges_commands.py`, `test_conges_api.py`, `test_conges_pdf.py`.

**Modifiés** — `backend/accounts/models.py`, `admin_views.py`, `views.py` ; `backend/audit/models.py` (+migration) ; `backend/notifications/models.py` (+migration) ; `backend/attestations/pdf.py` (`_draw_title(titre=…)`) ; `backend/config/settings.py`, `urls.py` ; `backend/tests/conftest.py` (fixtures).

---

### Task 1: Drapeaux `charge_conge` / `peut_demander_conge`

**Files:**
- Modify: `backend/accounts/models.py` (après `peut_demander_consultation`, ~l.118 ; propriétés après `can_request_consultations`, ~l.275), `backend/accounts/admin_views.py` (sérialiseurs l.64-226, snapshots l.268-321), `backend/accounts/views.py` (l.155-158 et l.203-206)
- Create: `backend/accounts/migrations/0020_user_conge_flags.py` (générée)
- Test: `backend/tests/test_conges_flag.py`

**Interfaces:**
- Produces: `User.charge_conge`, `User.peut_demander_conge` (bool), `User.can_manage_conges`, `User.can_request_conges` (propriétés) ; `/api/auth/me/` et le login exposent `can_manage_conges` et `can_request_conges` ; `/api/admin-users/` expose `charge_conge`, `peut_demander_conge`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_conges_flag.py
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()


def _user(role, **extra):
    return User.objects.create_user(
        username=f"u_{role}_{User.objects.count()}", password="Passw0rd!Long1",
        nom="N", prenom="P", role=role,
        consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def test_superadmin_peut_traiter_et_demander_sans_drapeau():
    sa = _user('SUPERADMIN')
    assert sa.can_manage_conges is True
    assert sa.can_request_conges is True


def test_admin_ordinaire_ne_traite_pas_et_ne_demande_jamais():
    admin = _user('ADMIN')
    assert admin.can_manage_conges is False
    assert admin.can_request_conges is False
    admin.charge_conge = True
    admin.peut_demander_conge = True
    assert admin.can_manage_conges is True
    assert admin.can_request_conges is False  # traiteur seul, jamais demandeur


@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT'])
def test_demandeur_exige_le_drapeau(role):
    u = _user(role)
    assert u.can_request_conges is False
    u.peut_demander_conge = True
    assert u.can_request_conges is True
    assert u.can_manage_conges is False


def test_admin_ordinaire_ne_peut_pas_se_donner_charge_conge():
    admin = _user('ADMIN')
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{admin.id}/', {'charge_conge': True}, format='json')
    assert resp.status_code == 400
    assert 'charge_conge' in resp.data
    admin.refresh_from_db()
    assert admin.charge_conge is False


def test_superadmin_peut_attribuer_charge_conge():
    sa = _user('SUPERADMIN')
    cible = _user('ADMIN')
    client = APIClient()
    client.force_authenticate(sa)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_conge': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_conge is True


def test_admin_peut_attribuer_peut_demander_conge_a_un_gestionnaire():
    admin = _user('ADMIN')
    gest = _user('GESTIONNAIRE')
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.patch(f'/api/admin-users/{gest.id}/', {'peut_demander_conge': True}, format='json')
    assert resp.status_code == 200, resp.data
    gest.refresh_from_db()
    assert gest.peut_demander_conge is True


def test_charge_conge_remis_a_zero_si_le_role_n_est_pas_admin():
    sa = _user('SUPERADMIN')
    cible = _user('ADMIN', charge_conge=True)
    client = APIClient()
    client.force_authenticate(sa)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'role': 'CONSULTANT'}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_conge is False


def test_me_expose_les_droits_conges():
    gest = _user('GESTIONNAIRE', peut_demander_conge=True)
    client = APIClient()
    client.force_authenticate(gest)
    resp = client.get('/api/auth/me/')
    assert resp.status_code == 200
    assert resp.data['can_request_conges'] is True
    assert resp.data['can_manage_conges'] is False
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_flag.py -v`
Expected: FAIL (`AttributeError … can_manage_conges` / champs inconnus).

- [ ] **Step 3: Add fields and properties to `accounts/models.py`**

Après `peut_demander_consultation` :

```python
    # Pendants « congés » (2026-10-20) : traiteur (charge_conge, attribuable par
    # un SUPERADMIN uniquement) et demandeur (peut_demander_conge, attribuable
    # par tout ADMIN). Même logique que charge_attestation / peut_demander_attestation.
    charge_conge = models.BooleanField(
        default=False, verbose_name="Chargé des demandes de congé",
        help_text="Réservé aux comptes Administrateur : reçoit et traite les "
                   "demandes de congé, tient les soldes et édite les titres. Un "
                   "Super-administrateur y a toujours accès, quel que soit ce champ.",
    )
    peut_demander_conge = models.BooleanField(
        default=False, verbose_name="Peut demander des congés",
        help_text="Gestionnaire/Consultant : autorisé à créer des demandes de congé.",
    )
```

Après `can_request_consultations` :

```python
    @property
    def can_manage_conges(self):
        """Traite les demandes de congé (valide, annule, interrompt, tient les
        soldes) — SUPERADMIN toujours, ADMIN seulement si charge_conge."""
        return self.is_superadmin or (self.role == self.Role.ADMIN and self.charge_conge)

    @property
    def can_request_conges(self):
        """Peut créer une demande de congé : SUPERADMIN toujours,
        GESTIONNAIRE/CONSULTANT seulement si peut_demander_conge."""
        return self.is_superadmin or (
            self.role in (self.Role.GESTIONNAIRE, self.Role.CONSULTANT) and self.peut_demander_conge
        )
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && python manage.py makemigrations accounts -n user_conge_flags`
Expected: `0020_user_conge_flags.py` avec deux `AddField` (pas de `RunPython` : fonctionnalité neuve).

- [ ] **Step 5: Expose the flags in `admin_views.py`**

- `UserSerializer.Meta.fields` et `UserCreateSerializer.Meta.fields` : ajouter `'charge_conge'` après `'charge_registre'` et `'peut_demander_conge'` après `'peut_demander_consultation'`.
- `UserSerializer.validate` :

```python
        if role != 'ADMIN':
            attrs['charge_attestation'] = False
            attrs['charge_consultation'] = False
            attrs['charge_registre'] = False
            attrs['charge_conge'] = False
        if role not in ('GESTIONNAIRE', 'CONSULTANT'):
            attrs['peut_demander_attestation'] = False
            attrs['peut_demander_consultation'] = False
            attrs['peut_demander_conge'] = False
```

- `UserSerializer` : 

```python
    def validate_charge_conge(self, value):
        return _reserve_au_superadmin(
            self, value, self.instance.charge_conge if self.instance else False, "aux demandes de congé",
        )
```

- `UserCreateSerializer` :

```python
    def validate_charge_conge(self, value):
        return _reserve_au_superadmin(self, value, False, "aux demandes de congé")
```

  et dans son `validate` : mêmes remises à zéro que ci-dessus (clés `charge_conge`, `peut_demander_conge`).
- `UserListCreateView.perform_create` : ajouter aux `details` d'audit `'charge_conge': user.charge_conge, 'peut_demander_conge': user.peut_demander_conge,`.
- `UserUpdateView.perform_update`, fonction `_scope_snapshot` : ajouter `'charge_conge': u.charge_conge, 'peut_demander_conge': u.peut_demander_conge,`.

- [ ] **Step 6: Expose the rights in `accounts/views.py`**

Aux deux endroits qui listent `can_request_consultations` (login l.155-158, `UserMeView` l.203-206), ajouter :

```python
'can_manage_conges': user.can_manage_conges,
'can_request_conges': user.can_request_conges,
```

(avec l'indentation locale de chaque dictionnaire.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_conges_flag.py tests/test_consultations_flag.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/accounts/models.py backend/accounts/admin_views.py backend/accounts/views.py backend/accounts/migrations/0020_user_conge_flags.py backend/tests/test_conges_flag.py
git commit -m "feat(conges): drapeaux charge_conge et peut_demander_conge sur User"
```

---

### Task 2: App `conges` — modèles, référence, fixtures

**Files:**
- Create: `backend/conges/__init__.py`, `apps.py`, `models.py`, `reference.py`, `urls.py`, `migrations/__init__.py`
- Modify: `backend/config/settings.py` (après `'attestations',` l.63), `backend/config/urls.py` (après la ligne `attestations`, l.16), `backend/tests/conftest.py` (fixtures en fin de fichier)
- Test: `backend/tests/test_conges_models.py`

**Interfaces:**
- Produces:
  - `conges.models` : `TypeConge` (`CP`/`CE`/`CS`), `MotifConge(nom, type_conge, is_active)`, `ParametreConge` (singleton, `ParametreConge.get() -> ParametreConge`, `droit_annuel_jours` défaut 30), `SoldeConge(employee, reliquat, annuel, anticipe, droit_initial, cp_consomme, retrait_cs, exercice)` + propriété `actuel`, `MouvementConge` (immuable, `Nature`), `DemandeConge` (voir champs), `ReferenceCounter`, `CongeTemplateConfig`.
  - `conges.reference.generate_reference() -> str` (`NNNNN/AA`).
  - Fixtures de test : `traiteur_conge` (ADMIN, `charge_conge=True`), `demandeur_conge` (GESTIONNAIRE, `peut_demander_conge=True`), `solde_employe` (fabrique : `solde_employe(reliquat=…, annuel=…, anticipe=…) -> SoldeConge`), `demande_recue` (fabrique : `demande_recue(**champs) -> DemandeConge`).

- [ ] **Step 1: Add the fixtures to `tests/conftest.py`**

Ajouter en fin de fichier (les imports `timezone`, `User`, `pytest` y existent déjà) :

```python
# ─── Congés ────────────────────────────────────────────────────────────────

@pytest.fixture
def traiteur_conge(db):
    """ADMIN chargé des demandes de congé."""
    return User.objects.create_user(
        username="traiteur_conge", password="TraitPass123!", nom="Traiteur", prenom="Conge",
        role="ADMIN", charge_conge=True, consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def demandeur_conge(db):
    return User.objects.create_user(
        username="demandeur_conge", password="DemPass123!", nom="Demandeur", prenom="Conge",
        role="GESTIONNAIRE", peut_demander_conge=True, consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def solde_employe(db, employee, traiteur_conge):
    """Fabrique : initialise le solde de `employee` via le service (donc avec son
    mouvement INITIAL) — `solde_employe(reliquat=13, annuel=30)`."""
    def _fabrique(reliquat=0, annuel=30, anticipe=0, droit_initial=0, cp_consomme=0, retrait_cs=0):
        from conges.services import initialiser_solde
        return initialiser_solde(
            employee,
            {'reliquat': reliquat, 'annuel': annuel, 'anticipe': anticipe,
             'droit_initial': droit_initial, 'cp_consomme': cp_consomme, 'retrait_cs': retrait_cs},
            auteur=traiteur_conge, motif="Reprise de l'existant",
        )
    return _fabrique


@pytest.fixture
def demande_recue(db, employee, demandeur_conge):
    """Fabrique : une demande `Reçue` du 01/11 au 11/11/2026 (10 jours)."""
    compteur = {'n': 0}

    def _fabrique(**champs):
        import datetime
        from conges.models import DemandeConge
        compteur['n'] += 1
        base = dict(
            reference=f"{compteur['n']:05d}/26", employee=employee, demandeur=demandeur_conge,
            date_depart=datetime.date(2026, 11, 1), date_retour=datetime.date(2026, 11, 11),
            nb_jours=10, adresse_conge="12 rue des Oliviers, Oran",
        )
        base.update(champs)
        return DemandeConge.objects.create(**base)
    return _fabrique
```

- [ ] **Step 2: Write the failing tests**

```python
# backend/tests/test_conges_models.py
import datetime

import pytest
from django.db import IntegrityError, transaction

from conges.models import (
    DemandeConge, MotifConge, MouvementConge, ParametreConge, ReferenceCounter,
    SoldeConge, CongeTemplateConfig,
)
from conges.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_demande_statut_par_defaut_et_champs_de_validation_vides(demande_recue):
    d = demande_recue()
    assert d.statut == DemandeConge.Statut.RECUE
    assert d.is_active is True
    assert d.type_conge == ''
    assert (d.debit_reliquat, d.debit_annuel, d.debit_anticipe) == (0, 0, 0)
    assert d.signataire_interim is False


def test_reference_unique(demande_recue):
    demande_recue(reference='00001/26')
    with pytest.raises(IntegrityError), transaction.atomic():
        demande_recue(reference='00001/26')


def test_reference_counter_unique_par_annee():
    ReferenceCounter.objects.create(annee=2026, dernier_numero=5)
    with pytest.raises(IntegrityError), transaction.atomic():
        ReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_generate_reference_format_et_incrementation():
    n1, a1 = generate_reference().split('/')
    n2, a2 = generate_reference().split('/')
    assert len(n1) == 5 and n1.isdigit() and len(a1) == 2 and a1.isdigit()
    assert a1 == a2 and int(n2) == int(n1) + 1


def test_solde_actuel_exclut_l_anticipe(employee):
    s = SoldeConge.objects.create(employee=employee, reliquat=4, annuel=20, anticipe=6)
    assert s.actuel == 24


def test_solde_refuse_les_valeurs_negatives(employee):
    with pytest.raises(IntegrityError), transaction.atomic():
        SoldeConge.objects.create(employee=employee, reliquat=-1)


def test_solde_un_seul_par_employe(employee):
    SoldeConge.objects.create(employee=employee)
    with pytest.raises(IntegrityError), transaction.atomic():
        SoldeConge.objects.create(employee=employee)


def test_mouvement_est_immuable(employee, traiteur_conge):
    m = MouvementConge.objects.create(
        employee=employee, nature=MouvementConge.Nature.INITIAL, d_annuel=30, auteur=traiteur_conge,
    )
    m.motif = 'x'
    with pytest.raises(RuntimeError):
        m.save()
    with pytest.raises(RuntimeError):
        m.delete()


def test_parametre_conge_singleton_30_jours():
    p = ParametreConge.get()
    assert p.droit_annuel_jours == 30
    assert ParametreConge.get().pk == p.pk == 1


def test_motif_conge_unique_par_type():
    MotifConge.objects.create(nom='Mariage', type_conge='CE')
    MotifConge.objects.create(nom='Mariage', type_conge='CS')  # autre type : autorisé
    with pytest.raises(IntegrityError), transaction.atomic():
        MotifConge.objects.create(nom='Mariage', type_conge='CE')


def test_config_defauts_mode_test_et_fax_du_papier_conge():
    c = CongeTemplateConfig.objects.create()
    assert c.mode_test is True
    assert c.fax == '213 (0) 41.68.01.03'
    assert not c.logo
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_models.py -v`
Expected: FAIL (`ModuleNotFoundError: No module named 'conges'`).

- [ ] **Step 4: Create the app files**

`backend/conges/__init__.py` et `backend/conges/migrations/__init__.py` : vides. `backend/conges/urls.py` : `urlpatterns = []` (complété en Task 8).

`backend/conges/apps.py` :

```python
from django.apps import AppConfig


class CongesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'conges'
```

`backend/conges/reference.py` :

```python
from django.db import transaction
from django.utils import timezone

from .models import ReferenceCounter


def generate_reference():
    """Prochaine référence NNNNN/AA de l'année civile, réservée sous verrou
    (pas de collision entre créations concurrentes). Compteur propre aux
    congés, indépendant des attestations."""
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

`backend/conges/models.py` :

```python
import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


def conge_scan_upload_path(instance, filename):
    return f"conges/{instance.employee_id}/{uuid.uuid4()}_{filename}"


def conge_logo_upload_path(instance, filename):
    return f"conge_logo/{uuid.uuid4()}_{filename}"


class TypeConge(models.TextChoices):
    CP = 'CP', 'Congé payé'
    CE = 'CE', 'Congé exceptionnel'
    CS = 'CS', 'Congé sans solde'


class MotifConge(models.Model):
    """Référentiel des motifs, propres à chaque type (géré dans /parametres)."""
    nom = models.CharField(max_length=100)
    type_conge = models.CharField(max_length=2, choices=TypeConge.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'conge_motifs'
        ordering = ['type_conge', 'nom']
        constraints = [
            models.UniqueConstraint(fields=['nom', 'type_conge'], name='uniq_motif_conge_nom_type'),
        ]

    def __str__(self):
        return f"{self.type_conge} — {self.nom}"


class ParametreConge(models.Model):
    """Singleton (pk=1) : paramètres globaux des congés."""
    droit_annuel_jours = models.PositiveSmallIntegerField(default=30)

    class Meta:
        db_table = 'conge_parametres'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ReferenceCounter(models.Model):
    """Compteur annuel des références NNNNN/AA — une ligne par année civile."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'conge_reference_counters'


class SoldeConge(models.Model):
    """Soldes de congé d'un employé (voir spec §2.1). Ne se modifie QUE via
    conges.services (verrou + MouvementConge) : jamais directement."""
    employee = models.OneToOneField(
        'employees.Employee', on_delete=models.PROTECT, related_name='solde_conge',
    )
    reliquat = models.IntegerField(default=0)
    annuel = models.IntegerField(default=0)
    # Jours pris par avance sur l'exercice suivant — jamais comptés dans `actuel`.
    anticipe = models.IntegerField(default=0)
    droit_initial = models.IntegerField(default=0)
    cp_consomme = models.IntegerField(default=0)
    retrait_cs = models.IntegerField(default=0)
    # Exercice auquel ce solde est à jour (« 2025/2026 ») : sert au rattrapage
    # automatique de la bascule du 1er juillet.
    exercice = models.CharField(max_length=9, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'conge_soldes'
        constraints = [
            models.CheckConstraint(condition=models.Q(reliquat__gte=0), name='solde_conge_reliquat_pos'),
            models.CheckConstraint(condition=models.Q(annuel__gte=0), name='solde_conge_annuel_pos'),
            models.CheckConstraint(condition=models.Q(anticipe__gte=0), name='solde_conge_anticipe_pos'),
        ]

    @property
    def actuel(self):
        return self.reliquat + self.annuel

    def __str__(self):
        return f"Solde {self.employee_id} ({self.exercice})"


class MouvementConge(models.Model):
    """Ligne d'historique IMMUABLE : toute variation de solde en écrit une.
    Invariant : pour chaque compartiment, solde == somme des d_* de l'employé."""

    class Nature(models.TextChoices):
        INITIAL = 'INITIAL', 'Saisie initiale'
        DEBIT = 'DEBIT', 'Débit (validation CP)'
        RETRAIT_CS = 'RETRAIT_CS', 'Congé sans solde'
        RESTITUTION_ANNULATION = 'RESTITUTION_ANNULATION', 'Restitution (annulation/rejet)'
        RESTITUTION_INTERRUPTION = 'RESTITUTION_INTERRUPTION', 'Restitution (interruption)'
        BASCULE = 'BASCULE', 'Bascule du 1er juillet'
        CORRECTION = 'CORRECTION', 'Correction manuelle'

    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT, related_name='mouvements_conge',
    )
    demande = models.ForeignKey(
        'conges.DemandeConge', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='mouvements',
    )
    nature = models.CharField(max_length=30, choices=Nature.choices)
    d_reliquat = models.IntegerField(default=0)
    d_annuel = models.IntegerField(default=0)
    d_anticipe = models.IntegerField(default=0)
    d_droit_initial = models.IntegerField(default=0)
    d_cp_consomme = models.IntegerField(default=0)
    d_retrait_cs = models.IntegerField(default=0)
    avant = models.JSONField(default=dict, blank=True)
    apres = models.JSONField(default=dict, blank=True)
    motif = models.TextField(blank=True)
    auteur = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='mouvements_conge_faits',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'conge_mouvements'
        ordering = ['-created_at', '-id']

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Un mouvement de congé est immuable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise RuntimeError("Un mouvement de congé ne se supprime jamais.")


class DemandeConge(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'
        ANNULEE = 'annulee', 'Annulée'
        INTERROMPUE = 'interrompue', 'Interrompue'

    class Importance(models.TextChoices):
        HAUTE = 'haute', 'Haute'
        MOYENNE = 'moyenne', 'Moyenne'
        FAIBLE = 'faible', 'Faible'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True)
    importance = models.CharField(max_length=10, choices=Importance.choices, default=Importance.MOYENNE)
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT, related_name='demandes_conge')
    contrat = models.ForeignKey(
        'employees.Contrat', null=True, blank=True, on_delete=models.SET_NULL, related_name='demandes_conge',
    )

    # Saisi par le demandeur. Période = [date_depart, date_retour[ : date_retour
    # est la date de REPRISE du travail. Corrigeable par le traiteur à la validation.
    date_depart = models.DateField()
    date_retour = models.DateField()
    nb_jours = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    adresse_conge = models.CharField(max_length=255)
    commentaire = models.TextField(blank=True)

    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    motif_rejet = models.TextField(blank=True)

    # Renseigné par le traiteur à la validation.
    type_conge = models.CharField(max_length=2, choices=TypeConge.choices, blank=True)
    motif = models.ForeignKey(MotifConge, null=True, blank=True, on_delete=models.PROTECT, related_name='demandes')
    # Libellé imprimé (« 2024/2025 ») : peut viser un exercice antérieur (reliquat).
    exercice = models.CharField(max_length=9, blank=True)
    date_etablissement = models.DateField(null=True, blank=True)
    observations = models.TextField(blank=True)
    # Ventilation du débit CP (restituée telle quelle en cas d'annulation).
    debit_reliquat = models.PositiveSmallIntegerField(default=0)
    debit_annuel = models.PositiveSmallIntegerField(default=0)
    debit_anticipe = models.PositiveSmallIntegerField(default=0)
    # Exercice DU SOLDE au moment du débit (≠ `exercice` imprimé) : permet de
    # restituer correctement si le solde a basculé depuis.
    exercice_debit = models.CharField(max_length=9, blank=True)
    # Signataire figé à la validation.
    signataire_nom = models.CharField(max_length=150, blank=True)
    signataire_titre = models.CharField(max_length=150, blank=True)
    signataire_interim = models.BooleanField(default=False)
    validateur_nom = models.CharField(max_length=150, blank=True)

    motif_annulation = models.TextField(blank=True)
    annulee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_annulees',
    )
    date_annulation = models.DateTimeField(null=True, blank=True)

    date_rappel = models.DateField(null=True, blank=True)
    jours_effectifs = models.PositiveSmallIntegerField(null=True, blank=True)
    motif_interruption = models.TextField(blank=True)
    interrompue_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_interrompues',
    )
    date_interruption = models.DateTimeField(null=True, blank=True)

    date_prete = models.DateTimeField(null=True, blank=True)
    date_recuperee = models.DateTimeField(null=True, blank=True)
    # Date imprimée sur le titre, figée au premier aperçu (voir CongeApercuView).
    date_document = models.DateField(null=True, blank=True)
    scan_document = models.FileField(upload_to=conge_scan_upload_path, null=True, blank=True)

    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='demandes_conge_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_conge_traitees',
    )

    # Soft-delete : l'annulation par le demandeur ne supprime jamais la ligne.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_conge'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} — {self.employee} ({self.statut})"


class CongeTemplateConfig(models.Model):
    """Singleton (pk=1) — modèle du titre de congé. Mêmes champs que
    AttestationTemplateConfig (attestations.pdf lit ces attributs par nom) ;
    seul le fax par défaut diffère (valeur relevée sur le papier de congé)."""
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(
        max_length=255, blank=True, default="SOCIÉTÉ DE MAINTENANCE INDUSTRIELLE D'ARZEW",
    )
    societe_capital = models.CharField(
        max_length=255, blank=True, default="SPA Au Capital Social de 3.700.000.000 DA",
    )
    holding = models.CharField(
        max_length=255, blank=True, default="Holding SONATRACH Services Parapétroliers Spa",
    )
    adresse = models.CharField(max_length=255, blank=True, default="BP 28 Route d'El Mohgoun 31200 Arzew")
    ville = models.CharField(max_length=100, blank=True, default="Arzew")
    telephone = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.00")
    fax = models.CharField(max_length=50, blank=True, default="213 (0) 41.68.01.03")
    telex = models.CharField(max_length=50, blank=True, default="12048 DZ")
    signataire_titre = models.CharField(
        max_length=150, blank=True, default="Chef de Département Administration du Personnel",
    )
    signataire_nom = models.CharField(max_length=150, blank=True, default="A.BOUSMAHA")
    signataire_interim = models.BooleanField(default=False)
    signataire_interim_nom = models.CharField(max_length=150, blank=True)
    logo = models.ImageField(upload_to=conge_logo_upload_path, null=True, blank=True)
    # « (mode test) » imprimé sur TOUT titre tant que la case n'est pas décochée.
    mode_test = models.BooleanField(default=True)

    class Meta:
        db_table = 'conge_template_config'
```

- [ ] **Step 5: Register the app**

`backend/config/settings.py` : après `'attestations',` ajouter `'conges',`.
`backend/config/urls.py` : après la ligne `path('attestations/', include('attestations.urls')),` ajouter `path('conges/', include('conges.urls')),` (même indentation).

- [ ] **Step 6: Generate the migration**

Run: `cd backend && python manage.py makemigrations conges`
Expected: `conges/migrations/0001_initial.py` créant les 8 modèles. Si Django refuse `CheckConstraint(condition=…)` (versions < 5.1), utiliser `check=` à la place.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_conges_models.py -v`
Expected: PASS (10 tests).

- [ ] **Step 8: Commit**

```bash
git add backend/conges backend/config/settings.py backend/config/urls.py backend/tests/conftest.py backend/tests/test_conges_models.py
git commit -m "feat(conges): app conges, modèles (demande, soldes, mouvements, motifs, paramètres, config)"
```

---

### Task 3: Actions d'audit et types de notification

**Files:**
- Modify: `backend/audit/models.py` (après `DELETE_ATTESTATION`, ~l.38), `backend/notifications/models.py` (après `ATTESTATION_REJETEE`, l.18)
- Create: `backend/audit/migrations/0013_*.py`, `backend/notifications/migrations/0005_*.py` (générées), `backend/conges/notifications.py`
- Test: `backend/tests/test_conges_workflow.py` (créé ici, enrichi en Task 5)

**Interfaces:**
- Produces: les valeurs d'enum de la section « Noms figés » ; `conges.notifications.notifier_nouvelle_demande(demande)`, `notifier_validee(demande, auteur=None)`, `notifier_rejetee(demande, auteur=None)`, `notifier_annulee(demande, auteur=None)`, `notifier_interrompue(demande, auteur=None)`.
- Consumes: `notifications.service.notify(destinataires, type, message, lien, severite=None)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_conges_workflow.py
import datetime

import pytest

from audit.models import AuditLog
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def test_actions_audit_conges_tiennent_dans_20_caracteres():
    noms = [
        'CREATE_CONGE', 'VALIDER_CONGE', 'REJETER_CONGE', 'RECUPERER_CONGE', 'ANNULER_CONGE',
        'INTERROMPRE_CONGE', 'DELETE_CONGE', 'MODIFY_CONGE', 'INITIAL_SOLDE_CONGE',
        'CORRIGER_SOLDE_CONGE', 'BASCULE_CONGE', 'APERCU_CONGE', 'SCAN_CONGE',
    ]
    for nom in noms:
        assert getattr(AuditLog.Action, nom) == nom
        assert len(nom) <= 20


def test_types_notification_conges_existent():
    for nom in ['CONGE_NOUVELLE', 'CONGE_PRETE', 'CONGE_REJETEE', 'CONGE_ANNULEE', 'CONGE_INTERROMPUE']:
        assert getattr(Notification.Type, nom) == nom
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_conges_workflow.py -v`
Expected: FAIL (`AttributeError: CREATE_CONGE`).

- [ ] **Step 3: Add the enum values**

`backend/audit/models.py`, après `DELETE_ATTESTATION` :

```python
        CREATE_CONGE = 'CREATE_CONGE', 'Création demande congé'
        VALIDER_CONGE = 'VALIDER_CONGE', 'Validation titre de congé'
        REJETER_CONGE = 'REJETER_CONGE', 'Rejet demande congé'
        RECUPERER_CONGE = 'RECUPERER_CONGE', 'Titre de congé récupéré'
        ANNULER_CONGE = 'ANNULER_CONGE', 'Annulation titre de congé'
        INTERROMPRE_CONGE = 'INTERROMPRE_CONGE', 'Interruption de congé'
        DELETE_CONGE = 'DELETE_CONGE', 'Annulation demande congé par le demandeur'
        MODIFY_CONGE = 'MODIFY_CONGE', 'Modification observations congé'
        INITIAL_SOLDE_CONGE = 'INITIAL_SOLDE_CONGE', 'Saisie initiale solde congé'
        CORRIGER_SOLDE_CONGE = 'CORRIGER_SOLDE_CONGE', 'Correction solde congé'
        BASCULE_CONGE = 'BASCULE_CONGE', 'Bascule exercice congé'
        APERCU_CONGE = 'APERCU_CONGE', 'Aperçu / impression titre de congé'
        SCAN_CONGE = 'SCAN_CONGE', 'Dépôt scan titre de congé'
```

`backend/notifications/models.py`, après `ATTESTATION_REJETEE` :

```python
        CONGE_NOUVELLE = 'CONGE_NOUVELLE', "Nouvelle demande de congé"
        CONGE_PRETE = 'CONGE_PRETE', "Titre de congé prêt"
        CONGE_REJETEE = 'CONGE_REJETEE', "Demande de congé rejetée"
        CONGE_ANNULEE = 'CONGE_ANNULEE', "Titre de congé annulé"
        CONGE_INTERROMPUE = 'CONGE_INTERROMPUE', "Congé interrompu"
```

- [ ] **Step 4: Generate the migrations**

Run: `cd backend && python manage.py makemigrations audit notifications`
Expected: un `AlterField` sur `auditlog.action` et un sur `notification.type` (aucune modification de `max_length`).

- [ ] **Step 5: Create `conges/notifications.py`**

```python
"""Notifications du workflow des congés (voir docs/fonctionnel/notifications.md).
Textes neutres : seule la référence NNNNN/AA apparaît, jamais le nom de l'employé."""
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.service import notify


def _link(demande):
    return f"/conges/{demande.reference.replace('/', '-')}"


def _vers_le_demandeur(demande, auteur, type_notif, message, severite=None):
    if demande.demandeur_id is None or (auteur is not None and auteur.pk == demande.demandeur_id):
        return
    args = [[demande.demandeur_id], type_notif, message, _link(demande)]
    if severite is not None:
        args.append(severite)
    notify(*args)


def notifier_nouvelle_demande(demande):
    """Prévient les traiteurs (SUPERADMIN + ADMIN chargés des congés), sauf l'auteur."""
    traiteurs = [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_conges and u.pk != demande.demandeur_id
    ]
    notify(
        traiteurs, Notification.Type.CONGE_NOUVELLE,
        f"Nouvelle demande de congé {demande.reference}", _link(demande),
    )


def notifier_validee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_PRETE,
        f"Votre titre de congé {demande.reference} est prêt à être récupéré",
    )


def notifier_rejetee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_REJETEE,
        f"Votre demande de congé {demande.reference} a été rejetée",
        Notification.Severity.WARNING,
    )


def notifier_annulee(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_ANNULEE,
        f"Le titre de congé {demande.reference} a été annulé",
        Notification.Severity.WARNING,
    )


def notifier_interrompue(demande, auteur=None):
    _vers_le_demandeur(
        demande, auteur, Notification.Type.CONGE_INTERROMPUE,
        f"Le congé {demande.reference} a été interrompu",
        Notification.Severity.WARNING,
    )
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && pytest tests/test_conges_workflow.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/audit backend/notifications backend/conges/notifications.py backend/tests/test_conges_workflow.py
git commit -m "feat(conges): actions d'audit, types de notification et notifications du workflow"
```

---

### Task 4: Services de solde (exercice, ventilation, mouvements, rattrapage)

**Files:**
- Create: `backend/conges/services.py`
- Test: `backend/tests/test_conges_services.py`

**Interfaces:**
- Produces (`conges.services`) :
  - Exceptions : `CongeError`, `SoldeNonInitialise`, `SoldeInsuffisant`, `TransitionInvalide`, `ChevauchementError` (toutes `CongeError`, `str(e)` = message français).
  - `exercice_pour(jour: date) -> str`, `exercice_courant(aujourdhui: date | None = None) -> str`, `exercice_suivant(exercice: str) -> str`.
  - `Ventilation(reliquat, annuel, anticipe)` (dataclass figée, propriété `total`) ; `calculer_ventilation(solde, nb_jours, plafond_anticipe) -> Ventilation`.
  - `appliquer_mouvement(solde, nature, deltas: dict, *, demande=None, auteur=None, motif='', exercice=None) -> MouvementConge` — l'appelant tient déjà la transaction et le verrou.
  - `verrouiller_solde(employee, *, auteur=None) -> SoldeConge` (verrou + rattrapage de l'exercice ; lève `SoldeNonInitialise`).
  - `rattraper_exercice(solde, *, auteur=None) -> None`.
  - `initialiser_solde(employee, valeurs: dict, *, auteur, motif='') -> SoldeConge` ; `corriger_solde(employee, deltas: dict, *, auteur, motif) -> SoldeConge`.
  - `solde_attendu(employee) -> dict` (somme des mouvements) et `ecarts_solde(solde) -> dict` (vide si cohérent).
  - `CHAMPS_SOLDE = ('reliquat','annuel','anticipe','droit_initial','cp_consomme','retrait_cs')`.
- Consumes: `SoldeConge`, `MouvementConge`, `ParametreConge` (Task 2).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_conges_services.py
import datetime

import pytest
from django.db import transaction

from conges.models import MouvementConge, ParametreConge, SoldeConge
from conges.services import (
    CongeError, SoldeInsuffisant, SoldeNonInitialise, Ventilation,
    calculer_ventilation, corriger_solde, ecarts_solde, exercice_courant, exercice_pour,
    exercice_suivant, initialiser_solde, verrouiller_solde,
)

pytestmark = pytest.mark.django_db


# ─── Exercice (1er juillet → 30 juin) ───────────────────────────────────────

@pytest.mark.parametrize('jour,attendu', [
    (datetime.date(2026, 6, 30), '2025/2026'),
    (datetime.date(2026, 7, 1), '2026/2027'),
    (datetime.date(2026, 8, 10), '2026/2027'),
    (datetime.date(2027, 1, 15), '2026/2027'),
])
def test_exercice_pour(jour, attendu):
    assert exercice_pour(jour) == attendu


def test_exercice_suivant():
    assert exercice_suivant('2025/2026') == '2026/2027'


# ─── Ventilation du débit : reliquat → annuel → anticipé ────────────────────

def _solde(reliquat=0, annuel=0, anticipe=0):
    return SoldeConge(reliquat=reliquat, annuel=annuel, anticipe=anticipe)


def test_ventilation_consomme_le_reliquat_avant_l_annuel():
    assert calculer_ventilation(_solde(13, 30), 20, 30) == Ventilation(13, 7, 0)


def test_ventilation_reste_dans_le_reliquat_si_suffisant():
    assert calculer_ventilation(_solde(13, 30), 10, 30) == Ventilation(10, 0, 0)


def test_ventilation_excedent_passe_en_anticipe():
    assert calculer_ventilation(_solde(2, 3), 10, 30) == Ventilation(2, 3, 5)


def test_ventilation_plafonne_l_anticipe_au_droit_annuel():
    with pytest.raises(SoldeInsuffisant):
        calculer_ventilation(_solde(0, 0, anticipe=25), 10, 30)  # 25 + 10 > 30


def test_ventilation_total():
    assert Ventilation(1, 2, 3).total == 6


def test_ventilation_refuse_zero_jour():
    with pytest.raises(CongeError):
        calculer_ventilation(_solde(5, 5), 0, 30)


# ─── Saisie initiale et mouvements ──────────────────────────────────────────

def test_initialiser_cree_le_solde_et_un_mouvement(employee, traiteur_conge):
    solde = initialiser_solde(
        employee, {'reliquat': 5, 'annuel': 30, 'droit_initial': 210, 'cp_consomme': 180},
        auteur=traiteur_conge, motif="Reprise",
    )
    assert (solde.reliquat, solde.annuel, solde.anticipe) == (5, 30, 0)
    assert solde.exercice == exercice_courant()
    m = MouvementConge.objects.get(employee=employee)
    assert m.nature == MouvementConge.Nature.INITIAL
    assert (m.d_reliquat, m.d_annuel, m.d_droit_initial, m.d_cp_consomme) == (5, 30, 210, 180)
    assert m.auteur_id == traiteur_conge.id
    assert ecarts_solde(solde) == {}


def test_initialiser_refuse_un_double_appel(employee, traiteur_conge, solde_employe):
    solde_employe(annuel=30)
    with pytest.raises(CongeError):
        initialiser_solde(employee, {'annuel': 10}, auteur=traiteur_conge)


def test_initialiser_refuse_les_valeurs_negatives_et_l_anticipe_hors_plafond(employee, traiteur_conge):
    with pytest.raises(CongeError):
        initialiser_solde(employee, {'reliquat': -1}, auteur=traiteur_conge)
    with pytest.raises(CongeError):
        initialiser_solde(employee, {'anticipe': 31}, auteur=traiteur_conge)


def test_corriger_exige_un_motif_et_garde_une_trace(employee, traiteur_conge, solde_employe):
    solde_employe(reliquat=5, annuel=30)
    with pytest.raises(CongeError):
        corriger_solde(employee, {'reliquat': -2}, auteur=traiteur_conge, motif='  ')
    solde = corriger_solde(employee, {'reliquat': -2}, auteur=traiteur_conge, motif="Erreur de reprise")
    assert solde.reliquat == 3
    m = MouvementConge.objects.filter(nature=MouvementConge.Nature.CORRECTION).get()
    assert m.d_reliquat == -2 and m.motif == "Erreur de reprise"
    assert m.avant['reliquat'] == 5 and m.apres['reliquat'] == 3
    assert ecarts_solde(solde) == {}


def test_corriger_refuse_de_passer_sous_zero(employee, traiteur_conge, solde_employe):
    solde_employe(reliquat=1, annuel=0)
    with pytest.raises(SoldeInsuffisant):
        corriger_solde(employee, {'reliquat': -2}, auteur=traiteur_conge, motif="x")


def test_verrouiller_sans_solde_initialise_leve(employee):
    with transaction.atomic():
        with pytest.raises(SoldeNonInitialise):
            verrouiller_solde(employee)


# ─── Rattrapage automatique de la bascule du 1er juillet ───────────────────

def test_rattrapage_applique_la_bascule_si_l_exercice_est_en_retard(employee, traiteur_conge, solde_employe):
    solde = solde_employe(reliquat=4, annuel=20, anticipe=6)
    SoldeConge.objects.filter(pk=solde.pk).update(exercice=exercice_pour(datetime.date(2025, 8, 1)))
    with transaction.atomic():
        s = verrouiller_solde(employee, auteur=traiteur_conge)
    # reliquat += annuel ; annuel = 30 − anticipé ; anticipé = 0
    assert (s.reliquat, s.annuel, s.anticipe) == (24, 24, 0)
    assert s.exercice == exercice_courant()
    assert ecarts_solde(s) == {}
    assert MouvementConge.objects.filter(nature=MouvementConge.Nature.BASCULE).count() >= 1


def test_rattrapage_traverse_plusieurs_exercices_sans_manquer_d_etape(employee, solde_employe):
    solde = solde_employe(reliquat=0, annuel=30)
    SoldeConge.objects.filter(pk=solde.pk).update(exercice=exercice_pour(datetime.date(2023, 8, 1)))
    with transaction.atomic():
        s = verrouiller_solde(employee)
    assert s.exercice == exercice_courant()
    assert ecarts_solde(s) == {}


def test_rattrapage_est_idempotent(employee, solde_employe):
    solde_employe(reliquat=3, annuel=30)
    with transaction.atomic():
        verrouiller_solde(employee)
    avant = MouvementConge.objects.count()
    with transaction.atomic():
        verrouiller_solde(employee)
    assert MouvementConge.objects.count() == avant


def test_bascule_ne_rend_jamais_l_annuel_negatif(employee, solde_employe):
    solde = solde_employe(annuel=0, anticipe=30)
    SoldeConge.objects.filter(pk=solde.pk).update(exercice=exercice_pour(datetime.date(2025, 8, 1)))
    ParametreConge.objects.update_or_create(pk=1, defaults={'droit_annuel_jours': 20})  # droit réduit
    with transaction.atomic():
        s = verrouiller_solde(employee)
    assert s.annuel == 0 and s.anticipe == 0
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_services.py -v`
Expected: FAIL (`ModuleNotFoundError: conges.services`).

- [ ] **Step 3: Implement `conges/services.py`**

```python
"""Calcul et mouvements des soldes de congé (spec : §2).

Règle d'or : un solde ne se modifie QUE par appliquer_mouvement(), appelée dans
une transaction avec le solde verrouillé (verrouiller_solde). Chaque appel écrit
un MouvementConge immuable, de sorte que `solde == somme des mouvements`
(vérifié par ecarts_solde / la commande verifier_soldes_conges).
"""
from dataclasses import dataclass
from datetime import date

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import MouvementConge, ParametreConge, SoldeConge

CHAMPS_SOLDE = ('reliquat', 'annuel', 'anticipe', 'droit_initial', 'cp_consomme', 'retrait_cs')
CHAMPS_NON_NEGATIFS = ('reliquat', 'annuel', 'anticipe')
MOIS_DEBUT_EXERCICE = 7


class CongeError(Exception):
    """Erreur métier : le message est destiné à l'utilisateur (français)."""


class SoldeNonInitialise(CongeError):
    pass


class SoldeInsuffisant(CongeError):
    pass


class TransitionInvalide(CongeError):
    pass


class ChevauchementError(CongeError):
    pass


# ─── Exercice : du 1er juillet au 30 juin ───────────────────────────────────

def exercice_pour(jour: date) -> str:
    debut = jour.year if jour.month >= MOIS_DEBUT_EXERCICE else jour.year - 1
    return f"{debut}/{debut + 1}"


def exercice_courant(aujourdhui: date | None = None) -> str:
    return exercice_pour(aujourdhui or timezone.localdate())


def exercice_suivant(exercice: str) -> str:
    debut = int(exercice.split('/')[0]) + 1
    return f"{debut}/{debut + 1}"


# ─── Ventilation d'un débit CP : reliquat → annuel → anticipé ──────────────

@dataclass(frozen=True)
class Ventilation:
    reliquat: int = 0
    annuel: int = 0
    anticipe: int = 0

    @property
    def total(self) -> int:
        return self.reliquat + self.annuel + self.anticipe


def calculer_ventilation(solde, nb_jours: int, plafond_anticipe: int) -> Ventilation:
    if nb_jours < 1:
        raise CongeError("Le nombre de jours doit être supérieur à zéro.")
    du_reliquat = min(solde.reliquat, nb_jours)
    reste = nb_jours - du_reliquat
    de_annuel = min(solde.annuel, reste)
    en_anticipe = reste - de_annuel
    if solde.anticipe + en_anticipe > plafond_anticipe:
        raise SoldeInsuffisant(
            f"Solde insuffisant : {nb_jours} jour(s) demandé(s), "
            f"{solde.reliquat + solde.annuel} disponible(s) et "
            f"{max(0, plafond_anticipe - solde.anticipe)} possible(s) en anticipé."
        )
    return Ventilation(du_reliquat, de_annuel, en_anticipe)


# ─── Mouvements ─────────────────────────────────────────────────────────────

def _snapshot(solde) -> dict:
    return {**{c: getattr(solde, c) for c in CHAMPS_SOLDE}, 'exercice': solde.exercice}


def appliquer_mouvement(solde, nature, deltas, *, demande=None, auteur=None, motif='', exercice=None):
    """Applique `deltas` (dict champ → variation signée) au solde et écrit le
    mouvement. L'appelant tient la transaction et le verrou."""
    avant = _snapshot(solde)
    for champ, delta in deltas.items():
        setattr(solde, champ, getattr(solde, champ) + delta)
    if exercice is not None:
        solde.exercice = exercice
    solde.save()
    return MouvementConge.objects.create(
        employee=solde.employee, demande=demande, nature=nature,
        d_reliquat=deltas.get('reliquat', 0), d_annuel=deltas.get('annuel', 0),
        d_anticipe=deltas.get('anticipe', 0), d_droit_initial=deltas.get('droit_initial', 0),
        d_cp_consomme=deltas.get('cp_consomme', 0), d_retrait_cs=deltas.get('retrait_cs', 0),
        avant=avant, apres=_snapshot(solde), motif=motif, auteur=auteur,
    )


def verrouiller_solde(employee, *, auteur=None) -> SoldeConge:
    """Verrou de ligne + rattrapage éventuel de la bascule. À appeler dans
    transaction.atomic()."""
    try:
        solde = SoldeConge.objects.select_for_update().select_related('employee').get(employee=employee)
    except SoldeConge.DoesNotExist:
        raise SoldeNonInitialise(
            "Les soldes de congé de cet employé ne sont pas initialisés : "
            "saisissez d'abord son solde de départ."
        )
    rattraper_exercice(solde, auteur=auteur)
    return solde


def rattraper_exercice(solde, *, auteur=None) -> None:
    """Applique, une par une, les bascules du 1er juillet manquantes (le
    planificateur a pu ne pas tourner). Idempotent."""
    cible = exercice_courant()
    while solde.exercice and solde.exercice < cible:
        _appliquer_bascule(solde, auteur)


def _appliquer_bascule(solde, auteur) -> None:
    """reliquat += annuel (jours non pris) ; annuel = droit − anticipé ;
    anticipé = 0. Le nouvel annuel ne descend jamais sous zéro."""
    suivant = exercice_suivant(solde.exercice)
    droit = ParametreConge.get().droit_annuel_jours
    nouvel_annuel = max(0, droit - solde.anticipe)
    appliquer_mouvement(
        solde, MouvementConge.Nature.BASCULE,
        {'reliquat': solde.annuel, 'annuel': nouvel_annuel - solde.annuel, 'anticipe': -solde.anticipe},
        auteur=auteur, motif=f"Passage à l'exercice {suivant}", exercice=suivant,
    )


# ─── Saisie initiale et correction (traiteur) ──────────────────────────────

def initialiser_solde(employee, valeurs, *, auteur, motif='') -> SoldeConge:
    plafond = ParametreConge.get().droit_annuel_jours
    deltas = {c: int(valeurs.get(c, 0) or 0) for c in CHAMPS_SOLDE}
    if any(v < 0 for v in deltas.values()):
        raise CongeError("Les soldes ne peuvent pas être négatifs.")
    if deltas['anticipe'] > plafond:
        raise CongeError(f"L'anticipé ne peut pas dépasser le droit annuel ({plafond} jours).")
    with transaction.atomic():
        if SoldeConge.objects.select_for_update().filter(employee=employee).exists():
            raise CongeError("Le solde de cet employé est déjà initialisé : utilisez une correction.")
        solde = SoldeConge.objects.create(employee=employee, exercice=exercice_courant())
        appliquer_mouvement(
            solde, MouvementConge.Nature.INITIAL, deltas, auteur=auteur,
            motif=motif or "Saisie initiale",
        )
        return solde


def corriger_solde(employee, deltas, *, auteur, motif) -> SoldeConge:
    motif = (motif or '').strip()
    if not motif:
        raise CongeError("Un motif est obligatoire pour corriger un solde.")
    variations = {c: int(deltas.get(c, 0) or 0) for c in CHAMPS_SOLDE if deltas.get(c)}
    if not variations:
        raise CongeError("Aucune correction à appliquer.")
    with transaction.atomic():
        solde = verrouiller_solde(employee, auteur=auteur)
        for champ in CHAMPS_NON_NEGATIFS:
            if getattr(solde, champ) + variations.get(champ, 0) < 0:
                raise SoldeInsuffisant(f"La correction rendrait le compartiment « {champ} » négatif.")
        appliquer_mouvement(
            solde, MouvementConge.Nature.CORRECTION, variations, auteur=auteur, motif=motif,
        )
        return solde


# ─── Contrôle d'intégrité ───────────────────────────────────────────────────

def solde_attendu(employee) -> dict:
    """Somme des mouvements de l'employé, par compartiment."""
    sommes = MouvementConge.objects.filter(employee=employee).aggregate(
        **{c: Sum(f'd_{c}') for c in CHAMPS_SOLDE}
    )
    return {c: sommes[c] or 0 for c in CHAMPS_SOLDE}


def ecarts_solde(solde) -> dict:
    """{champ: (valeur_en_base, somme_des_mouvements)} — vide si cohérent."""
    attendu = solde_attendu(solde.employee)
    return {
        c: (getattr(solde, c), attendu[c])
        for c in CHAMPS_SOLDE if getattr(solde, c) != attendu[c]
    }
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/test_conges_services.py -v`
Expected: PASS. Les tests de rattrapage supposent la date courante ≥ 1er juillet 2026 (le projet est daté du 2026-10-20).

- [ ] **Step 5: Commit**

```bash
git add backend/conges/services.py backend/tests/test_conges_services.py
git commit -m "feat(conges): services de solde (exercice, ventilation, mouvements immuables, rattrapage de bascule)"
```

---

### Task 5: Workflow — valider, rejeter, récupérer, annuler, interrompre

**Files:**
- Create: `backend/conges/workflow.py`
- Test: `backend/tests/test_conges_workflow.py` (ajouts)

**Interfaces:**
- Produces (`conges.workflow`) :
  - `trouver_chevauchement(employee, depart, retour, exclude_pk=None) -> DemandeConge | None`
  - `valider_demande(demande, *, auteur, donnees) -> DemandeConge` ; `donnees` : `type_conge`, `motif` (`MotifConge`), `date_etablissement`, `nb_jours`, `date_depart`, `date_retour`, `exercice`, `adresse_conge`, `observations`, `signataire_nom`, `signataire_titre`, `signataire_interim`, `reference` (optionnel).
  - `rejeter_demande(demande, *, auteur, motif) -> DemandeConge`
  - `marquer_recuperee(demande, *, auteur) -> DemandeConge`
  - `annuler_demande(demande, *, auteur, motif) -> DemandeConge`
  - `interrompre_demande(demande, *, auteur, date_rappel, motif) -> DemandeConge`
- Consumes: `conges.services` (Task 4), modèles (Task 2).

- [ ] **Step 1: Write the failing tests**

Ajouter à `backend/tests/test_conges_workflow.py` (les imports `datetime`, `pytest`, `AuditLog`, `Notification` et `pytestmark` sont déjà en tête de fichier) :

```python
from conges import workflow
from conges.models import DemandeConge, MotifConge, MouvementConge, SoldeConge
from conges.services import (
    CongeError, SoldeInsuffisant, SoldeNonInitialise, TransitionInvalide, ChevauchementError,
    ecarts_solde, exercice_courant, exercice_pour,
)


@pytest.fixture
def motif_cp(db):
    return MotifConge.objects.create(nom='Congé annuel', type_conge='CP')


@pytest.fixture
def motif_ce(db):
    return MotifConge.objects.create(nom='Mariage', type_conge='CE')


@pytest.fixture
def motif_cs(db):
    return MotifConge.objects.create(nom='Convenance personnelle', type_conge='CS')


def _donnees(motif, type_conge='CP', **extra):
    base = dict(
        type_conge=type_conge, motif=motif, date_etablissement=datetime.date(2026, 10, 20),
        nb_jours=10, date_depart=datetime.date(2026, 11, 1), date_retour=datetime.date(2026, 11, 11),
        exercice='2025/2026', adresse_conge='ALGERIE', observations='',
        signataire_nom='A.BOUSMAHA', signataire_titre='Chef de Département', signataire_interim=False,
    )
    base.update(extra)
    return base


def _valider(demande, traiteur, motif, **extra):
    return workflow.valider_demande(demande, auteur=traiteur, donnees=_donnees(motif, **extra))


# ─── Validation CP : débit reliquat → annuel → anticipé ─────────────────────

def test_valider_cp_debite_le_reliquat_puis_l_annuel(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.anticipe) == (0, 23, 0)
    assert solde.cp_consomme == 20
    assert (d.debit_reliquat, d.debit_annuel, d.debit_anticipe) == (13, 7, 0)
    assert d.exercice_debit == solde.exercice == exercice_courant()
    assert d.statut == DemandeConge.Statut.PRETE
    assert d.traite_par_id == traiteur_conge.id
    assert d.validateur_nom == traiteur_conge.full_name
    assert d.date_prete is not None and d.type_conge == 'CP' and d.motif_id == motif_cp.id
    assert ecarts_solde(solde) == {}
    m = MouvementConge.objects.get(demande=d, nature=MouvementConge.Nature.DEBIT)
    assert (m.d_reliquat, m.d_annuel, m.d_cp_consomme) == (-13, -7, 20)


def test_valider_cp_excedent_va_en_anticipe_et_l_actuel_reste_nul(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=2, annuel=3)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.anticipe) == (0, 0, 5)
    assert solde.actuel == 0  # l'anticipé n'est pas compté
    assert (d.debit_reliquat, d.debit_annuel, d.debit_anticipe) == (2, 3, 5)


def test_valider_cp_refuse_au_dela_du_plafond_et_ne_change_rien(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=0, annuel=0, anticipe=25)
    d = demande_recue()
    with pytest.raises(SoldeInsuffisant):
        _valider(d, traiteur_conge, motif_cp)
    d.refresh_from_db()
    assert d.statut == DemandeConge.Statut.RECUE
    assert SoldeConge.objects.get(employee=employee).anticipe == 25
    assert not MouvementConge.objects.filter(demande=d).exists()


def test_valider_cp_sans_solde_initialise_est_refuse(demande_recue, traiteur_conge, motif_cp):
    d = demande_recue()
    with pytest.raises(SoldeNonInitialise):
        _valider(d, traiteur_conge, motif_cp)
    d.refresh_from_db()
    assert d.statut == DemandeConge.Statut.RECUE


def test_valider_ce_ne_debite_rien(demande_recue, traiteur_conge, solde_employe, motif_ce, employee):
    solde_employe(reliquat=5, annuel=30)
    d = _valider(demande_recue(nb_jours=3), traiteur_conge, motif_ce, type_conge='CE', nb_jours=3)
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (5, 30, 0)
    assert d.statut == DemandeConge.Statut.PRETE and d.type_conge == 'CE'
    assert not MouvementConge.objects.filter(demande=d).exists()


def test_valider_ce_fonctionne_meme_sans_solde_initialise(demande_recue, traiteur_conge, motif_ce):
    d = _valider(demande_recue(nb_jours=3), traiteur_conge, motif_ce, type_conge='CE', nb_jours=3)
    assert d.statut == DemandeConge.Statut.PRETE


def test_valider_cs_ajoute_au_retrait_cs_sans_debiter(demande_recue, traiteur_conge, solde_employe, motif_cs, employee):
    solde_employe(reliquat=5, annuel=30)
    d = _valider(demande_recue(nb_jours=7), traiteur_conge, motif_cs, type_conge='CS', nb_jours=7)
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.retrait_cs, solde.cp_consomme) == (5, 30, 7, 0)
    assert ecarts_solde(solde) == {}
    assert d.debit_reliquat == d.debit_annuel == d.debit_anticipe == 0


def test_valider_refuse_un_statut_autre_que_recue(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    with pytest.raises(TransitionInvalide):
        _valider(d, traiteur_conge, motif_cp)


def test_valider_refuse_un_chevauchement_apres_correction_des_dates(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    _valider(demande_recue(), traiteur_conge, motif_cp)  # 01/11 → 11/11
    autre = demande_recue(date_depart=datetime.date(2026, 12, 1), date_retour=datetime.date(2026, 12, 11))
    with pytest.raises(ChevauchementError):
        _valider(autre, traiteur_conge, motif_cp,
                 date_depart=datetime.date(2026, 11, 5), date_retour=datetime.date(2026, 11, 15))


def test_valider_permet_de_changer_la_reference_et_fige_le_signataire(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp, reference='04512/26',
                 signataire_nom='INTERIMAIRE X', signataire_interim=True)
    assert d.reference == '04512/26'
    assert d.signataire_nom == 'INTERIMAIRE X' and d.signataire_interim is True


# ─── Rejet, récupération ────────────────────────────────────────────────────

def test_rejeter_une_demande_recue_exige_un_motif_et_ne_touche_pas_au_solde(demande_recue, traiteur_conge, solde_employe, employee):
    solde_employe(annuel=30)
    d = demande_recue()
    with pytest.raises(CongeError):
        workflow.rejeter_demande(d, auteur=traiteur_conge, motif=' ')
    d = workflow.rejeter_demande(d, auteur=traiteur_conge, motif="Période de clôture")
    assert d.statut == DemandeConge.Statut.REJETEE and d.motif_rejet == "Période de clôture"
    assert SoldeConge.objects.get(employee=employee).annuel == 30


def test_rejeter_un_titre_prete_restitue_le_debit(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    workflow.rejeter_demande(d, auteur=traiteur_conge, motif="Erreur")
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (13, 30, 0)
    assert ecarts_solde(solde) == {}


def test_marquer_recuperee_exige_le_statut_prete(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.marquer_recuperee(d, auteur=traiteur_conge)
    d = _valider(d, traiteur_conge, motif_cp)
    d = workflow.marquer_recuperee(d, auteur=traiteur_conge)
    assert d.statut == DemandeConge.Statut.RECUPEREE and d.date_recuperee is not None


# ─── Annulation (même signé) ────────────────────────────────────────────────

def test_annuler_restitue_exactement_la_ventilation(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20)
    d = workflow.marquer_recuperee(d, auteur=traiteur_conge)  # signé et récupéré
    d = workflow.annuler_demande(d, auteur=traiteur_conge, motif="Annulé par l'employé")
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.anticipe, solde.cp_consomme) == (13, 30, 0, 0)
    assert d.statut == DemandeConge.Statut.ANNULEE
    assert d.motif_annulation == "Annulé par l'employé" and d.annulee_par_id == traiteur_conge.id
    assert d.date_annulation is not None and d.is_active is True  # conservé dans l'historique
    assert ecarts_solde(solde) == {}
    assert MouvementConge.objects.filter(demande=d, nature=MouvementConge.Nature.RESTITUTION_ANNULATION).count() == 1


def test_annuler_exige_un_motif_et_un_statut_valide(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    recue = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(recue, auteur=traiteur_conge, motif="x")
    prete = _valider(recue, traiteur_conge, motif_cp)
    with pytest.raises(CongeError):
        workflow.annuler_demande(prete, auteur=traiteur_conge, motif="")


def test_annuler_deux_fois_est_impossible(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")


def test_annuler_cs_retire_du_retrait_cs(demande_recue, traiteur_conge, solde_employe, motif_cs, employee):
    solde_employe(annuel=30)
    d = _valider(demande_recue(nb_jours=7), traiteur_conge, motif_cs, type_conge='CS', nb_jours=7)
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    solde = SoldeConge.objects.get(employee=employee)
    assert solde.retrait_cs == 0 and ecarts_solde(solde) == {}


def test_annuler_apres_une_bascule_rend_l_annuel_au_reliquat(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=0, annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)  # annuel 30 → 20
    # Le solde « date » d'un exercice antérieur : l'annulation déclenche d'abord la bascule.
    ancien = exercice_pour(datetime.date(2025, 8, 1))
    SoldeConge.objects.filter(employee=employee).update(exercice=ancien)
    DemandeConge.objects.filter(pk=d.pk).update(exercice_debit=ancien)
    workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")
    solde = SoldeConge.objects.get(employee=employee)
    # bascule : reliquat 20, annuel 30 ; restitution des 10 j annuels de l'ancien exercice → reliquat
    assert (solde.reliquat, solde.annuel) == (30, 30)
    assert ecarts_solde(solde) == {}


# ─── Interruption ───────────────────────────────────────────────────────────

def test_interrompre_restitue_les_jours_non_pris_reliquat_d_abord(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(reliquat=13, annuel=30)
    d = _valider(demande_recue(nb_jours=20), traiteur_conge, motif_cp, nb_jours=20,
                 date_depart=datetime.date(2026, 11, 1), date_retour=datetime.date(2026, 11, 21))
    d = workflow.interrompre_demande(
        d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="Rappel de l'employeur",
    )
    # pris : 4 jours (01→05/11) ; restitués : 16 = 13 reliquat + 3 annuel
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (13, 26, 4)
    assert d.statut == DemandeConge.Statut.INTERROMPUE
    assert d.jours_effectifs == 4 and d.date_rappel == datetime.date(2026, 11, 5)
    assert d.motif_interruption == "Rappel de l'employeur" and d.interrompue_par_id == traiteur_conge.id
    assert (d.debit_reliquat, d.debit_annuel) == (13, 7)  # le titre d'origine reste intact
    assert ecarts_solde(solde) == {}
    m = MouvementConge.objects.get(demande=d, nature=MouvementConge.Nature.RESTITUTION_INTERRUPTION)
    assert (m.d_reliquat, m.d_annuel, m.d_cp_consomme) == (13, 3, -16)


def test_interrompre_valide_la_date_de_rappel(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    for mauvaise in (datetime.date(2026, 11, 1), datetime.date(2026, 11, 11), datetime.date(2026, 10, 1)):
        with pytest.raises(CongeError):
            workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=mauvaise, motif="x")
    with pytest.raises(CongeError):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif=" ")


def test_interrompre_une_seule_fois_et_pas_avant_validation(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = demande_recue()
    with pytest.raises(TransitionInvalide):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    d = _valider(d, traiteur_conge, motif_cp)
    d = workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 6), motif="x")


def test_un_titre_interrompu_n_est_pas_annulable_en_v1(demande_recue, traiteur_conge, solde_employe, motif_cp):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)
    d = workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    with pytest.raises(TransitionInvalide):
        workflow.annuler_demande(d, auteur=traiteur_conge, motif="x")


def test_la_periode_effective_d_un_titre_interrompu_libere_les_dates(demande_recue, traiteur_conge, solde_employe, motif_cp, employee):
    solde_employe(annuel=30)
    d = _valider(demande_recue(), traiteur_conge, motif_cp)  # 01 → 11/11
    workflow.interrompre_demande(d, auteur=traiteur_conge, date_rappel=datetime.date(2026, 11, 5), motif="x")
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 6), datetime.date(2026, 11, 9)) is None
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 3), datetime.date(2026, 11, 9)) is not None


# ─── Chevauchement ──────────────────────────────────────────────────────────

def test_chevauchement_ignore_les_demandes_rejetee_annulee_ou_supprimee(demande_recue, employee):
    demande_recue(statut='rejetee')
    demande_recue(statut='annulee')
    demande_recue(is_active=False)
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 5), datetime.date(2026, 11, 8)) is None


def test_chevauchement_accepte_une_reprise_le_jour_du_nouveau_depart(demande_recue, employee):
    demande_recue(date_depart=datetime.date(2026, 10, 20), date_retour=datetime.date(2026, 11, 1))
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 1), datetime.date(2026, 11, 5)) is None


def test_chevauchement_detecte_une_demande_active_qui_recoupe(demande_recue, employee):
    existante = demande_recue()  # 01 → 11/11
    assert workflow.trouver_chevauchement(employee, datetime.date(2026, 11, 5), datetime.date(2026, 11, 15)) == existante
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_workflow.py -v`
Expected: FAIL (`ImportError: cannot import name 'workflow'`).

- [ ] **Step 3: Implement `conges/workflow.py`**

```python
"""Workflow d'un titre de congé : valider, rejeter, récupérer, annuler,
interrompre (spec : §2.3 et §4). Toutes les fonctions sont atomiques, verrouillent
la demande puis le solde, et écrivent les MouvementConge via conges.services."""
from collections import defaultdict

from django.db import transaction
from django.utils import timezone

from .models import DemandeConge, MouvementConge, ParametreConge, TypeConge
from .services import (
    ChevauchementError, CongeError, TransitionInvalide, appliquer_mouvement,
    calculer_ventilation, verrouiller_solde,
)

Statut = DemandeConge.Statut
STATUTS_ACTIFS = (Statut.RECUE, Statut.PRETE, Statut.RECUPEREE, Statut.INTERROMPUE)
STATUTS_ANNULABLES = (Statut.PRETE, Statut.RECUPEREE)
CHAMPS_VALIDATION = (
    'type_conge', 'motif', 'date_etablissement', 'nb_jours', 'date_depart', 'date_retour',
    'exercice', 'adresse_conge', 'observations', 'signataire_nom', 'signataire_titre',
    'signataire_interim',
)


def _verrouiller_demande(demande) -> DemandeConge:
    return DemandeConge.objects.select_for_update().select_related('employee').get(pk=demande.pk)


def _motif_obligatoire(motif, message) -> str:
    motif = (motif or '').strip()
    if not motif:
        raise CongeError(message)
    return motif


def trouver_chevauchement(employee, depart, retour, exclude_pk=None):
    """Première demande ACTIVE de l'employé dont la période recoupe
    [depart, retour[. Rejetées, annulées et supprimées sont ignorées ; la fin
    d'un titre interrompu est sa date de rappel ; une reprise le jour d'un
    nouveau départ est acceptée."""
    candidats = DemandeConge.objects.filter(
        employee=employee, is_active=True, statut__in=STATUTS_ACTIFS, date_depart__lt=retour,
    )
    if exclude_pk is not None:
        candidats = candidats.exclude(pk=exclude_pk)
    for candidat in candidats:
        fin = candidat.date_rappel if candidat.statut == Statut.INTERROMPUE and candidat.date_rappel \
            else candidat.date_retour
        if fin > depart:
            return candidat
    return None


# ─── Validation (débit) ─────────────────────────────────────────────────────

def valider_demande(demande, *, auteur, donnees) -> DemandeConge:
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut != Statut.RECUE:
            raise TransitionInvalide("Seule une demande reçue peut être validée.")
        conflit = trouver_chevauchement(
            demande.employee, donnees['date_depart'], donnees['date_retour'], exclude_pk=demande.pk,
        )
        if conflit:
            raise ChevauchementError(f"Cette période chevauche la demande {conflit.reference} de cet employé.")

        nb_jours, type_conge = donnees['nb_jours'], donnees['type_conge']
        debit = (0, 0, 0)
        exercice_debit = ''
        if type_conge == TypeConge.CP:
            solde = verrouiller_solde(demande.employee, auteur=auteur)
            v = calculer_ventilation(solde, nb_jours, ParametreConge.get().droit_annuel_jours)
            appliquer_mouvement(
                solde, MouvementConge.Nature.DEBIT,
                {'reliquat': -v.reliquat, 'annuel': -v.annuel, 'anticipe': v.anticipe, 'cp_consomme': nb_jours},
                demande=demande, auteur=auteur, motif=f"Titre {demande.reference}",
            )
            debit, exercice_debit = (v.reliquat, v.annuel, v.anticipe), solde.exercice
        elif type_conge == TypeConge.CS:
            solde = verrouiller_solde(demande.employee, auteur=auteur)
            appliquer_mouvement(
                solde, MouvementConge.Nature.RETRAIT_CS, {'retrait_cs': nb_jours},
                demande=demande, auteur=auteur, motif=f"Titre {demande.reference}",
            )
            exercice_debit = solde.exercice

        for champ in CHAMPS_VALIDATION:
            setattr(demande, champ, donnees[champ])
        if donnees.get('reference'):
            demande.reference = donnees['reference']
        demande.debit_reliquat, demande.debit_annuel, demande.debit_anticipe = debit
        demande.exercice_debit = exercice_debit
        demande.statut = Statut.PRETE
        demande.date_prete = timezone.now()
        demande.traite_par = auteur
        demande.validateur_nom = auteur.full_name
        demande.save()
        return demande


# ─── Restitution commune (annulation, rejet d'un titre prêt, interruption) ──

def _rendre(demande, *, jours_reliquat, jours_annuel, jours_anticipe, jours_cs, nature, auteur, motif) -> None:
    """Rend des jours à l'employé, selon le type du titre. CE : rien à rendre.
    Si le solde a basculé depuis le débit, les jours « annuel » reviennent au
    reliquat et les jours « anticipé » à l'annuel (comme l'a fait la bascule)."""
    if demande.type_conge == TypeConge.CP:
        solde = verrouiller_solde(demande.employee, auteur=auteur)
        decale = demande.exercice_debit != solde.exercice
        deltas = defaultdict(int)
        deltas['reliquat'] += jours_reliquat
        deltas['reliquat' if decale else 'annuel'] += jours_annuel
        if decale:
            deltas['annuel'] += jours_anticipe
        else:
            deltas['anticipe'] -= jours_anticipe
        deltas['cp_consomme'] -= jours_reliquat + jours_annuel + jours_anticipe
        appliquer_mouvement(solde, nature, dict(deltas), demande=demande, auteur=auteur, motif=motif)
    elif demande.type_conge == TypeConge.CS:
        solde = verrouiller_solde(demande.employee, auteur=auteur)
        appliquer_mouvement(
            solde, nature, {'retrait_cs': -jours_cs}, demande=demande, auteur=auteur, motif=motif,
        )


def _rendre_tout(demande, *, nature, auteur, motif) -> None:
    _rendre(
        demande, jours_reliquat=demande.debit_reliquat, jours_annuel=demande.debit_annuel,
        jours_anticipe=demande.debit_anticipe, jours_cs=demande.nb_jours,
        nature=nature, auteur=auteur, motif=motif,
    )


# ─── Rejet, récupération ────────────────────────────────────────────────────

def rejeter_demande(demande, *, auteur, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif de rejet requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in (Statut.RECUE, Statut.PRETE):
            raise TransitionInvalide("Cette demande ne peut plus être rejetée.")
        if demande.statut == Statut.PRETE:
            _rendre_tout(
                demande, nature=MouvementConge.Nature.RESTITUTION_ANNULATION, auteur=auteur,
                motif=f"Rejet du titre {demande.reference} : {motif}",
            )
        demande.statut = Statut.REJETEE
        demande.motif_rejet = motif
        demande.traite_par = auteur
        demande.save()
        return demande


def marquer_recuperee(demande, *, auteur) -> DemandeConge:
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut != Statut.PRETE:
            raise TransitionInvalide("Seul un titre prêt peut être marqué comme récupéré.")
        demande.statut = Statut.RECUPEREE
        demande.date_recuperee = timezone.now()
        demande.traite_par = auteur
        demande.save()
        return demande


# ─── Annulation (même après signature) ──────────────────────────────────────

def annuler_demande(demande, *, auteur, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif d'annulation requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in STATUTS_ANNULABLES:
            raise TransitionInvalide(
                "Seul un titre prêt ou récupéré peut être annulé (un titre interrompu ne l'est pas)."
            )
        _rendre_tout(
            demande, nature=MouvementConge.Nature.RESTITUTION_ANNULATION, auteur=auteur,
            motif=f"Annulation du titre {demande.reference} : {motif}",
        )
        demande.statut = Statut.ANNULEE
        demande.motif_annulation = motif
        demande.annulee_par = auteur
        demande.date_annulation = timezone.now()
        demande.save()
        return demande


# ─── Interruption (rappel de l'employé) ─────────────────────────────────────

def interrompre_demande(demande, *, auteur, date_rappel, motif) -> DemandeConge:
    motif = _motif_obligatoire(motif, "Motif d'interruption requis.")
    with transaction.atomic():
        demande = _verrouiller_demande(demande)
        if demande.statut not in STATUTS_ANNULABLES:
            raise TransitionInvalide(
                "Seul un titre prêt ou récupéré peut être interrompu, une seule fois."
            )
        if not (demande.date_depart < date_rappel < demande.date_retour):
            raise CongeError(
                "La date de rappel doit être postérieure à la date de départ et antérieure à la date de retour."
            )
        jours_effectifs = (date_rappel - demande.date_depart).days
        a_rendre = demande.nb_jours - jours_effectifs
        if a_rendre < 1:
            raise CongeError("Aucun jour à restituer pour cette date de rappel.")

        # Reliquat d'abord, dans la limite de ce qui y avait été débité.
        du_reliquat = min(a_rendre, demande.debit_reliquat)
        reste = a_rendre - du_reliquat
        de_annuel = min(reste, demande.debit_annuel)
        reste -= de_annuel
        en_anticipe = min(reste, demande.debit_anticipe)
        _rendre(
            demande, jours_reliquat=du_reliquat, jours_annuel=de_annuel, jours_anticipe=en_anticipe,
            jours_cs=a_rendre, nature=MouvementConge.Nature.RESTITUTION_INTERRUPTION, auteur=auteur,
            motif=f"Interruption du congé {demande.reference} : {motif}",
        )

        demande.statut = Statut.INTERROMPUE
        demande.date_rappel = date_rappel
        demande.jours_effectifs = jours_effectifs
        demande.motif_interruption = motif
        demande.interrompue_par = auteur
        demande.date_interruption = timezone.now()
        demande.save()
        return demande
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/test_conges_workflow.py tests/test_conges_services.py -v`
Expected: PASS. Les tests de bascule supposent la date courante ≥ 1er juillet 2026.

- [ ] **Step 5: Commit**

```bash
git add backend/conges/workflow.py backend/tests/test_conges_workflow.py
git commit -m "feat(conges): workflow valider/rejeter/récupérer/annuler/interrompre avec restitutions et mouvements"
```

---

### Task 6: Commandes `basculer_exercice` et `verifier_soldes_conges`

**Files:**
- Create: `backend/conges/management/__init__.py`, `backend/conges/management/commands/__init__.py`, `backend/conges/management/commands/basculer_exercice.py`, `backend/conges/management/commands/verifier_soldes_conges.py`
- Test: `backend/tests/test_conges_commands.py`

**Interfaces:**
- Produces: `python manage.py basculer_exercice` (idempotente, trace `BASCULE_CONGE` dans l'audit avec le nombre d'employés basculés) ; `python manage.py verifier_soldes_conges` (code retour ≠ 0 si un écart solde/mouvements existe).
- Consumes: `conges.services.verrouiller_solde`, `ecarts_solde`, `exercice_courant`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_conges_commands.py
import datetime
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from audit.models import AuditLog
from conges.models import MouvementConge, SoldeConge
from conges.services import exercice_courant, exercice_pour

pytestmark = pytest.mark.django_db


def test_basculer_exercice_met_a_jour_les_soldes_en_retard_et_trace_l_audit(employee, solde_employe):
    solde = solde_employe(reliquat=4, annuel=20, anticipe=6)
    SoldeConge.objects.filter(pk=solde.pk).update(exercice=exercice_pour(datetime.date(2025, 8, 1)))
    out = StringIO()
    call_command('basculer_exercice', stdout=out)
    solde.refresh_from_db()
    assert (solde.reliquat, solde.annuel, solde.anticipe) == (24, 24, 0)
    assert solde.exercice == exercice_courant()
    assert "1 solde" in out.getvalue()
    log = AuditLog.objects.filter(action=AuditLog.Action.BASCULE_CONGE).latest('id')
    assert log.username_snapshot == 'system:basculer_exercice'
    assert log.details['employes_bascules'] == 1


def test_basculer_exercice_est_idempotente(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    avant = MouvementConge.objects.count()
    call_command('basculer_exercice', stdout=StringIO())
    call_command('basculer_exercice', stdout=StringIO())
    assert MouvementConge.objects.count() == avant  # solde déjà à jour : rien à faire


def test_verifier_soldes_passe_si_tout_est_coherent(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    out = StringIO()
    call_command('verifier_soldes_conges', stdout=out)
    assert "aucun écart" in out.getvalue().lower()


def test_verifier_soldes_signale_un_ecart_et_echoue(employee, solde_employe):
    solde = solde_employe(reliquat=4, annuel=20)
    SoldeConge.objects.filter(pk=solde.pk).update(reliquat=99)  # modification hors service
    with pytest.raises(CommandError) as exc:
        call_command('verifier_soldes_conges', stdout=StringIO())
    assert employee.matricule in str(exc.value)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_commands.py -v`
Expected: FAIL (`Unknown command: 'basculer_exercice'`).

- [ ] **Step 3: Implement the commands**

Créer les deux `__init__.py` vides, puis :

```python
# backend/conges/management/commands/basculer_exercice.py
"""Bascule du 1er juillet : reliquat += annuel, annuel = droit − anticipé,
anticipé = 0, pour tous les soldes encore à l'exercice précédent.

Idempotente : un solde déjà à l'exercice courant n'est pas touché. À planifier
chaque 1er juillet par le planificateur du serveur ; à défaut, la bascule se
rattrape toute seule à la première opération sur un solde (verrouiller_solde)."""
from django.core.management.base import BaseCommand
from django.db import transaction

from audit.models import AuditLog
from conges.models import SoldeConge
from conges.services import exercice_courant, verrouiller_solde


class Command(BaseCommand):
    help = "Applique la bascule d'exercice (1er juillet) aux soldes de congé en retard."

    def handle(self, *args, **opts):
        cible = exercice_courant()
        en_retard = list(SoldeConge.objects.filter(exercice__lt=cible).select_related('employee'))
        for solde in en_retard:
            with transaction.atomic():
                verrouiller_solde(solde.employee)  # applique le rattrapage sous verrou
        if en_retard:
            AuditLog.objects.create(
                user=None, username_snapshot='system:basculer_exercice',
                action=AuditLog.Action.BASCULE_CONGE, target_model='SoldeConge', target_id='',
                target_label=f"Exercice {cible}",
                details={'exercice': cible, 'employes_bascules': len(en_retard)},
            )
        self.stdout.write(self.style.SUCCESS(
            f"{len(en_retard)} solde(s) basculé(s) vers l'exercice {cible}."
        ))
```

```python
# backend/conges/management/commands/verifier_soldes_conges.py
"""Contrôle d'intégrité : pour chaque employé, chaque compartiment du solde doit
égaler la somme de ses mouvements. Échoue (code ≠ 0) au moindre écart."""
from django.core.management.base import BaseCommand, CommandError

from conges.models import SoldeConge
from conges.services import ecarts_solde


class Command(BaseCommand):
    help = "Vérifie que chaque solde de congé égale la somme de ses mouvements."

    def handle(self, *args, **opts):
        anomalies = []
        for solde in SoldeConge.objects.select_related('employee'):
            ecarts = ecarts_solde(solde)
            if ecarts:
                detail = ', '.join(f"{c}: base={b} / mouvements={m}" for c, (b, m) in ecarts.items())
                anomalies.append(f"{solde.employee.matricule} — {detail}")
        if anomalies:
            raise CommandError("Écarts détectés :\n  " + "\n  ".join(anomalies))
        self.stdout.write(self.style.SUCCESS("Aucun écart : tous les soldes égalent la somme de leurs mouvements."))
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd backend && pytest tests/test_conges_commands.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/conges/management backend/tests/test_conges_commands.py
git commit -m "feat(conges): commandes basculer_exercice et verifier_soldes_conges"
```

---

### Task 7: Permissions et sérialiseurs

**Files:**
- Create: `backend/conges/permissions.py`, `backend/conges/serializers.py`
- Test: `backend/tests/test_conges_api.py` (créé ici avec les tests de sérialiseurs/permissions ; enrichi en Tasks 8-9)

**Interfaces:**
- Produces:
  - Permissions : `CanAccessConges`, `IsCongeManager`, `CanRequestConge`.
  - Sérialiseurs : `DemandeCongeSerializer` (lecture), `DemandeCongeCreateSerializer`, `ValiderSerializer`, `RejeterSerializer(motif)`, `AnnulerSerializer(motif, reference_confirmation)`, `InterrompreSerializer(date_rappel, motif)`, `ObservationsSerializer`, `CongeScanSerializer`, `SoldeCongeSerializer`, `MouvementCongeSerializer`, `SoldeInitialSerializer`, `SoldeCorrectionSerializer`, `MotifCongeSerializer`, `ParametreCongeSerializer`, `CongeTemplateConfigSerializer`.
- Consumes: `conges.workflow.trouver_chevauchement`, `conges.reference.generate_reference`, modèles (Task 2).

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_conges_api.py  (début du fichier)
import datetime
from unittest.mock import MagicMock

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from conges.models import DemandeConge, MotifConge, MouvementConge, SoldeConge
from conges.permissions import CanRequestConge, IsCongeManager
from conges.serializers import (
    AnnulerSerializer, DemandeCongeCreateSerializer, InterrompreSerializer, ValiderSerializer,
)
from notifications.models import Notification

pytestmark = pytest.mark.django_db
User = get_user_model()


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _rows(data):
    return data['results'] if isinstance(data, dict) else data


def _payload(employee, **extra):
    data = {
        'employee': str(employee.id), 'date_depart': '2026-11-01', 'date_retour': '2026-11-11',
        'nb_jours': 10, 'adresse_conge': '12 rue des Oliviers, Oran',
    }
    data.update(extra)
    return data


def _ctx(user, **extra):
    request = MagicMock()
    request.user = user
    return {'request': request, **extra}


def _fake_request(role, peut_demander=True, charge=False, consented=True):
    request = MagicMock()
    request.user = User(
        username='fake', role=role, is_active=True, peut_demander_conge=peut_demander, charge_conge=charge,
        consent_loi1807_accepted_at=timezone.now() if consented else None,
    )
    return request


# ─── Permissions ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('role', ['GESTIONNAIRE', 'CONSULTANT', 'SUPERADMIN'])
def test_can_request_conge_autorise_roles_coches_et_superadmin(role):
    assert CanRequestConge().has_permission(_fake_request(role), None) is True


def test_can_request_conge_bloque_admin_ordinaire_meme_coche():
    assert CanRequestConge().has_permission(_fake_request('ADMIN'), None) is False


def test_can_request_conge_bloque_sans_consentement():
    assert CanRequestConge().has_permission(_fake_request('GESTIONNAIRE', consented=False), None) is False


def test_is_conge_manager_exige_charge_conge_pour_un_admin():
    assert IsCongeManager().has_permission(_fake_request('ADMIN', charge=False), None) is False
    assert IsCongeManager().has_permission(_fake_request('ADMIN', charge=True), None) is True
    assert IsCongeManager().has_permission(_fake_request('GESTIONNAIRE'), None) is False


# ─── Création ───────────────────────────────────────────────────────────────

def test_create_refuse_retour_avant_ou_egal_au_depart(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee, date_retour='2026-11-01'), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'date_retour' in s.errors


def test_create_refuse_nb_jours_nul_et_adresse_vide(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee, nb_jours=0, adresse_conge=''), context=_ctx(demandeur_conge))
    assert not s.is_valid()
    assert 'nb_jours' in s.errors and 'adresse_conge' in s.errors


def test_create_refuse_employe_hors_perimetre(employee, demandeur_conge, other_direction):
    demandeur_conge.scope_directions.add(other_direction)
    s = DemandeCongeCreateSerializer(data=_payload(employee), context=_ctx(demandeur_conge))
    assert not s.is_valid() and 'employee' in s.errors


def test_create_ignore_les_champs_reserves_au_traiteur(employee, demandeur_conge):
    demandeur_conge.scope_directions.add(employee.direction)
    s = DemandeCongeCreateSerializer(
        data=_payload(employee, type_conge='CE', observations='triche', debit_reliquat=9, statut='prete', validateur_nom='X'),
        context=_ctx(demandeur_conge),
    )
    assert s.is_valid(), s.errors
    for interdit in ('type_conge', 'observations', 'debit_reliquat', 'statut', 'validateur_nom'):
        assert interdit not in s.validated_data


def test_create_refuse_chevauchement(employee, demandeur_conge, demande_recue):
    demandeur_conge.scope_directions.add(employee.direction)
    demande_recue(reference='00001/26', date_depart=datetime.date(2026, 11, 5), date_retour=datetime.date(2026, 11, 15))
    s = DemandeCongeCreateSerializer(data=_payload(employee), context=_ctx(demandeur_conge))
    assert not s.is_valid() and '00001/26' in str(s.errors)


# ─── Validation (saisie du traiteur) ────────────────────────────────────────

def _valider_data(motif, **extra):
    data = {
        'type_conge': 'CP', 'motif': motif.id, 'date_etablissement': '2026-10-20', 'nb_jours': 10,
        'date_depart': '2026-11-01', 'date_retour': '2026-11-11', 'exercice': '2025/2026',
        'adresse_conge': 'ALGERIE', 'observations': '',
    }
    data.update(extra)
    return data


def test_valider_serializer_exige_un_motif_du_bon_type(demande_recue):
    motif_ce = MotifConge.objects.create(nom='Mariage', type_conge='CE')
    s = ValiderSerializer(data=_valider_data(motif_ce, type_conge='CP'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'motif' in s.errors


def test_valider_serializer_controle_format_exercice_et_reference(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    d = demande_recue()
    assert not ValiderSerializer(data=_valider_data(motif, exercice='2025-2026'), context={'demande': d}).is_valid()
    assert not ValiderSerializer(data=_valider_data(motif, reference='ABC'), context={'demande': d}).is_valid()
    assert ValiderSerializer(data=_valider_data(motif, reference='04512/26'), context={'demande': d}).is_valid()


def test_valider_serializer_refuse_une_reference_deja_prise(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    demande_recue(reference='04512/26')
    s = ValiderSerializer(data=_valider_data(motif, reference='04512/26'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'reference' in s.errors


def test_valider_serializer_signataire_par_defaut_vient_de_la_configuration(demande_recue):
    from conges.models import CongeTemplateConfig
    CongeTemplateConfig.objects.update_or_create(pk=1, defaults={
        'signataire_interim': True, 'signataire_interim_nom': 'INTERIMAIRE Y',
    })
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    s = ValiderSerializer(data=_valider_data(motif), context={'demande': demande_recue()})
    assert s.is_valid(), s.errors
    assert s.validated_data['signataire_nom'] == 'INTERIMAIRE Y'
    assert s.validated_data['signataire_interim'] is True


def test_valider_serializer_retour_apres_depart(demande_recue):
    motif = MotifConge.objects.create(nom='Annuel', type_conge='CP')
    s = ValiderSerializer(data=_valider_data(motif, date_retour='2026-11-01'), context={'demande': demande_recue()})
    assert not s.is_valid() and 'date_retour' in s.errors


# ─── Annulation : confirmation renforcée ────────────────────────────────────

def test_annuler_serializer_exige_la_reference_saisie(demande_recue):
    d = demande_recue(reference='00007/26')
    assert not AnnulerSerializer(data={'motif': 'x', 'reference_confirmation': '00008/26'}, context={'demande': d}).is_valid()
    assert AnnulerSerializer(data={'motif': 'x', 'reference_confirmation': '00007/26'}, context={'demande': d}).is_valid()
    assert not AnnulerSerializer(data={'motif': ' ', 'reference_confirmation': '00007/26'}, context={'demande': d}).is_valid()


def test_interrompre_serializer_exige_date_et_motif():
    assert not InterrompreSerializer(data={'motif': 'x'}).is_valid()
    assert InterrompreSerializer(data={'date_rappel': '2026-11-05', 'motif': 'Rappel'}).is_valid()
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_api.py -v`
Expected: FAIL (`ModuleNotFoundError: conges.permissions`).

- [ ] **Step 3: Create `conges/permissions.py`**

```python
from rest_framework.permissions import BasePermission


class _ConsentedActiveUser(BasePermission):
    """Base : utilisateur authentifié, actif, ayant consenti (Loi 18-07)."""

    def _ok(self, user):
        return bool(user and user.is_authenticated and user.is_active and user.consent_loi1807_accepted_at)


class CanAccessConges(_ConsentedActiveUser):
    """Accès à l'app : traiteur (SUPERADMIN / ADMIN chargé) ou demandeur autorisé.
    Le filtrage sur ses seules demandes reste fait dans get_queryset/get_object."""
    message = "Vous n'avez pas accès aux demandes de congé."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and (user.can_manage_conges or user.can_request_conges)


class IsCongeManager(_ConsentedActiveUser):
    """Traitement (valider, rejeter, annuler, interrompre, soldes, motifs,
    paramètres, configuration, aperçu PDF, reporting) : SUPERADMIN, ou ADMIN
    portant `charge_conge`."""
    message = "Seuls les comptes chargés des congés peuvent effectuer cette opération."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and user.can_manage_conges


class CanRequestConge(_ConsentedActiveUser):
    """Création / annulation par le demandeur : SUPERADMIN, ou GESTIONNAIRE/
    CONSULTANT avec `peut_demander_conge` — jamais un ADMIN ordinaire
    (séparation demandeur/traiteur utile à l'audit)."""
    message = "Vous n'avez pas le droit de demander un congé."

    def has_permission(self, request, view):
        user = request.user
        return self._ok(user) and user.can_request_conges
```

- [ ] **Step 4: Create `conges/serializers.py`**

```python
import magic
from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from .models import (
    CongeTemplateConfig, DemandeConge, MotifConge, MouvementConge, ParametreConge, SoldeConge, TypeConge,
)
from .reference import generate_reference
from .services import CHAMPS_SOLDE
from .workflow import trouver_chevauchement

EXERCICE_REGEX = r'^\d{4}/\d{4}$'
REFERENCE_REGEX = r'^\d{5}/\d{2}$'
TAILLE_SCAN_MAX = 20 * 1024 * 1024


def _contrat_numero(obj):
    """N° de contrat du titre : celui de la demande, sinon le plus récent de l'employé."""
    if obj.contrat_id:
        return obj.contrat.numero_contrat
    from employees.models import Contrat
    return Contrat.objects.filter(employee_id=obj.employee_id).order_by(
        '-date_debut', '-id',
    ).values_list('numero_contrat', flat=True).first()


class DemandeCongeSerializer(serializers.ModelSerializer):
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_date_embauche = serializers.DateField(source='employee.date_embauche', read_only=True, default=None)
    employee_direction_nom = serializers.CharField(source='employee.direction.nom', read_only=True, default=None)
    employee_departement_nom = serializers.CharField(source='employee.departement.nom', read_only=True, default=None)
    employee_service_nom = serializers.CharField(source='employee.service.nom', read_only=True, default=None)
    employee_poste_nom = serializers.CharField(source='employee.poste.nom', read_only=True, default=None)
    employee_type_contrat_nom = serializers.CharField(source='employee.type_contrat.nom', read_only=True, default=None)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    demandeur_role = serializers.CharField(source='demandeur.role', read_only=True)
    demandeur_libelle_role = serializers.CharField(source='demandeur.libelle_role', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    contrat_numero = serializers.SerializerMethodField()
    motif_nom = serializers.CharField(source='motif.nom', read_only=True, default=None)
    annulee_par_nom = serializers.SerializerMethodField()
    interrompue_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = DemandeConge
        fields = [
            'id', 'reference', 'employee', 'employee_nom', 'employee_matricule',
            'employee_date_embauche', 'employee_direction_nom', 'employee_departement_nom',
            'employee_service_nom', 'employee_poste_nom', 'employee_type_contrat_nom',
            'contrat', 'contrat_numero',
            'date_depart', 'date_retour', 'nb_jours', 'adresse_conge', 'commentaire', 'importance',
            'statut', 'motif_rejet', 'type_conge', 'motif', 'motif_nom', 'exercice',
            'date_etablissement', 'observations', 'debit_reliquat', 'debit_annuel', 'debit_anticipe',
            'signataire_nom', 'signataire_titre', 'signataire_interim', 'validateur_nom',
            'motif_annulation', 'annulee_par_nom', 'date_annulation',
            'date_rappel', 'jours_effectifs', 'motif_interruption', 'interrompue_par_nom', 'date_interruption',
            'scan_document', 'demandeur', 'demandeur_nom', 'demandeur_role', 'demandeur_libelle_role',
            'traite_par', 'traite_par_nom',
            'created_at', 'date_prete', 'date_recuperee', 'date_document', 'updated_at',
        ]
        read_only_fields = fields

    def get_employee_nom(self, obj):
        return f"{obj.employee.prenom} {obj.employee.nom}"

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None

    def get_annulee_par_nom(self, obj):
        return obj.annulee_par.full_name if obj.annulee_par_id else None

    def get_interrompue_par_nom(self, obj):
        return obj.interrompue_par.full_name if obj.interrompue_par_id else None

    def get_contrat_numero(self, obj):
        return _contrat_numero(obj)


class DemandeCongeCreateSerializer(serializers.ModelSerializer):
    # Champs du traiteur (type, motif, observations, débit, signataire…) absents
    # de `fields` : un demandeur ne peut jamais les fixer, même dans le body.
    class Meta:
        model = DemandeConge
        fields = ['employee', 'contrat', 'date_depart', 'date_retour', 'nb_jours',
                  'adresse_conge', 'commentaire', 'importance']
        extra_kwargs = {'adresse_conge': {'allow_blank': False}}

    def validate_employee(self, value):
        user = self.context['request'].user
        if not user.is_admin and not user.can_access_employee(value):
            raise serializers.ValidationError("Cet employé n'est pas dans votre périmètre.")
        return value

    def validate(self, attrs):
        employee = attrs['employee']
        contrat = attrs.get('contrat')
        if contrat and contrat.employee_id != employee.id:
            raise serializers.ValidationError({'contrat': "Ce contrat n'appartient pas à l'employé sélectionné."})
        depart, retour = attrs['date_depart'], attrs['date_retour']
        if retour <= depart:
            raise serializers.ValidationError(
                {'date_retour': "La date de retour doit être postérieure à la date de départ."}
            )
        conflit = trouver_chevauchement(employee, depart, retour)
        if conflit:
            raise serializers.ValidationError(
                {'date_depart': f"Cette période chevauche la demande {conflit.reference} de cet employé."}
            )
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)

    def to_representation(self, instance):
        return DemandeCongeSerializer(instance, context=self.context).data


class ValiderSerializer(serializers.Serializer):
    """Saisie du traiteur à la validation. `context['demande']` = la demande."""
    type_conge = serializers.ChoiceField(choices=TypeConge.choices)
    motif = serializers.PrimaryKeyRelatedField(queryset=MotifConge.objects.filter(is_active=True))
    date_etablissement = serializers.DateField()
    nb_jours = serializers.IntegerField(min_value=1, max_value=365)
    date_depart = serializers.DateField()
    date_retour = serializers.DateField()
    exercice = serializers.RegexField(EXERCICE_REGEX)
    adresse_conge = serializers.CharField(max_length=255)
    observations = serializers.CharField(required=False, allow_blank=True, default='')
    reference = serializers.RegexField(REFERENCE_REGEX, required=False)
    signataire_nom = serializers.CharField(required=False, max_length=150)
    signataire_titre = serializers.CharField(required=False, allow_blank=True, max_length=150)
    signataire_interim = serializers.BooleanField(required=False)

    def validate_reference(self, value):
        qs = DemandeConge.objects.filter(reference=value)
        demande = self.context.get('demande')
        if demande is not None:
            qs = qs.exclude(pk=demande.pk)
        if qs.exists():
            raise serializers.ValidationError("Cette référence est déjà utilisée.")
        return value

    def validate(self, attrs):
        if attrs['date_retour'] <= attrs['date_depart']:
            raise serializers.ValidationError(
                {'date_retour': "La date de retour doit être postérieure à la date de départ."}
            )
        if attrs['motif'].type_conge != attrs['type_conge']:
            raise serializers.ValidationError({'motif': "Ce motif ne correspond pas au type de congé choisi."})
        # Signataire : valeurs de la configuration (titulaire ou intérim) sauf saisie explicite.
        if not attrs.get('signataire_nom'):
            config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
            interim = config.signataire_interim and bool(config.signataire_interim_nom.strip())
            attrs['signataire_nom'] = config.signataire_interim_nom.strip() if interim else config.signataire_nom
            attrs['signataire_titre'] = attrs.get('signataire_titre') or config.signataire_titre
            attrs['signataire_interim'] = interim
        else:
            attrs.setdefault('signataire_titre', '')
            attrs.setdefault('signataire_interim', False)
        return attrs


class RejeterSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=1000)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif de rejet requis.")
        return value.strip()


class AnnulerSerializer(serializers.Serializer):
    """Confirmation renforcée : le traiteur doit retaper la référence du titre."""
    motif = serializers.CharField(max_length=1000)
    reference_confirmation = serializers.CharField()

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif d'annulation requis.")
        return value.strip()

    def validate(self, attrs):
        demande = self.context['demande']
        if attrs['reference_confirmation'].strip() != demande.reference:
            raise serializers.ValidationError(
                {'reference_confirmation': "La référence saisie ne correspond pas à ce titre."}
            )
        return attrs


class InterrompreSerializer(serializers.Serializer):
    date_rappel = serializers.DateField()
    motif = serializers.CharField(max_length=1000)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif d'interruption requis.")
        return value.strip()


class ObservationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeConge
        fields = ['observations']

    def validate(self, attrs):
        if self.instance.statut not in (DemandeConge.Statut.RECUE, DemandeConge.Statut.PRETE):
            raise serializers.ValidationError(
                "Les observations ne sont plus modifiables une fois le titre récupéré, annulé ou interrompu."
            )
        return attrs


class CongeScanSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeConge
        fields = ['scan_document']

    def validate_scan_document(self, value):
        # MIME réel (python-magic), jamais l'extension ni le Content-Type client.
        tete = value.read(2048)
        value.seek(0)
        if magic.from_buffer(tete, mime=True) not in settings.ALLOWED_MIME_TYPES:
            raise serializers.ValidationError("Type de fichier non autorisé.")
        if value.size > TAILLE_SCAN_MAX:
            raise serializers.ValidationError("Fichier trop volumineux (20 Mo maximum).")
        return value


class SoldeCongeSerializer(serializers.ModelSerializer):
    actuel = serializers.IntegerField(read_only=True)
    matricule = serializers.CharField(source='employee.matricule', read_only=True)

    class Meta:
        model = SoldeConge
        fields = ['matricule', 'exercice', 'reliquat', 'annuel', 'anticipe', 'actuel',
                  'droit_initial', 'cp_consomme', 'retrait_cs', 'updated_at']
        read_only_fields = fields


class MouvementCongeSerializer(serializers.ModelSerializer):
    auteur_nom = serializers.SerializerMethodField()
    demande_reference = serializers.CharField(source='demande.reference', read_only=True, default=None)
    nature_libelle = serializers.CharField(source='get_nature_display', read_only=True)

    class Meta:
        model = MouvementConge
        fields = ['id', 'nature', 'nature_libelle', 'demande_reference',
                  'd_reliquat', 'd_annuel', 'd_anticipe', 'd_droit_initial', 'd_cp_consomme', 'd_retrait_cs',
                  'avant', 'apres', 'motif', 'auteur_nom', 'created_at']
        read_only_fields = fields

    def get_auteur_nom(self, obj):
        return obj.auteur.full_name if obj.auteur_id else 'Système'


class SoldeInitialSerializer(serializers.Serializer):
    reliquat = serializers.IntegerField(min_value=0, default=0)
    annuel = serializers.IntegerField(min_value=0, default=0)
    anticipe = serializers.IntegerField(min_value=0, default=0)
    droit_initial = serializers.IntegerField(min_value=0, default=0)
    cp_consomme = serializers.IntegerField(min_value=0, default=0)
    retrait_cs = serializers.IntegerField(min_value=0, default=0)
    motif = serializers.CharField(required=False, allow_blank=True, default='')


class SoldeCorrectionSerializer(serializers.Serializer):
    reliquat = serializers.IntegerField(required=False)
    annuel = serializers.IntegerField(required=False)
    anticipe = serializers.IntegerField(required=False)
    droit_initial = serializers.IntegerField(required=False)
    cp_consomme = serializers.IntegerField(required=False)
    retrait_cs = serializers.IntegerField(required=False)
    motif = serializers.CharField(max_length=1000)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Un motif est obligatoire pour corriger un solde.")
        return value.strip()

    def validate(self, attrs):
        if not any(attrs.get(c) for c in CHAMPS_SOLDE):
            raise serializers.ValidationError("Aucune correction à appliquer.")
        return attrs


class MotifCongeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MotifConge
        fields = ['id', 'nom', 'type_conge', 'is_active']

    def validate(self, attrs):
        nom = attrs.get('nom', getattr(self.instance, 'nom', None))
        type_conge = attrs.get('type_conge', getattr(self.instance, 'type_conge', None))
        qs = MotifConge.objects.filter(nom__iexact=nom, type_conge=type_conge)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({'nom': "Ce motif existe déjà pour ce type de congé."})
        return attrs


class ParametreCongeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreConge
        fields = ['droit_annuel_jours']

    def validate_droit_annuel_jours(self, value):
        if not 1 <= value <= 90:
            raise serializers.ValidationError("Le droit annuel doit être compris entre 1 et 90 jours.")
        return value


class CongeTemplateConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CongeTemplateConfig
        fields = [
            'id', 'societe_nom', 'societe_soustitre', 'societe_capital', 'holding',
            'adresse', 'ville', 'telephone', 'fax', 'telex',
            'signataire_titre', 'signataire_nom',
            'signataire_interim', 'signataire_interim_nom', 'logo', 'mode_test',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        interim = attrs.get('signataire_interim', self.instance.signataire_interim if self.instance else False)
        nom = attrs.get('signataire_interim_nom', self.instance.signataire_interim_nom if self.instance else '')
        if interim and not (nom or '').strip():
            raise serializers.ValidationError({'signataire_interim_nom': "Nom du signataire intérimaire requis."})
        if not interim:
            attrs['signataire_interim_nom'] = ''
        return attrs
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && pytest tests/test_conges_api.py -v`
Expected: PASS. Si `test_create_refuse_employe_hors_perimetre` échoue parce que `can_access_employee` accepte un gestionnaire sans périmètre, reproduire exactement le setup du test « hors périmètre » de `tests/test_attestations.py`.

- [ ] **Step 6: Commit**

```bash
git add backend/conges/permissions.py backend/conges/serializers.py backend/tests/test_conges_api.py
git commit -m "feat(conges): permissions et sérialiseurs (création, validation, annulation confirmée, soldes, motifs)"
```

---

### Task 8: Vues et routes (demandes, soldes, motifs, paramètres)

**Files:**
- Create: `backend/conges/views.py`
- Modify: `backend/conges/urls.py`
- Test: `backend/tests/test_conges_api.py` (ajouts)

**Interfaces:**
- Produces (routes sous `/api/conges/`) :
  - `GET|POST demandes/` (liste scopée : `?employee=<matricule>`, `?q=`, `?statut=`, `?pending=1` ; création)
  - `GET|DELETE demandes/<ref>/` (détail ; annulation par le demandeur = soft-delete, statut `Reçue` seulement)
  - `POST demandes/<ref>/valider/`, `.../rejeter/`, `.../recuperee/`, `.../annuler/`, `.../interrompre/` (traiteur ; réponse = `DemandeCongeSerializer`)
  - `PATCH demandes/<ref>/observations/`, `POST|PATCH demandes/<ref>/scan/` (traiteur)
  - `GET soldes/<matricule>/` → `{initialise: bool, solde: {...} | null, mouvements: [...]}` (mouvements pour le traiteur seulement)
  - `POST soldes/<matricule>/initial/`, `POST soldes/<matricule>/correction/` (traiteur ; réponse = solde)
  - `GET|POST motifs/`, `PATCH|DELETE motifs/<id>/` (traiteur ; DELETE = désactivation `is_active=False`)
  - `GET|PUT parametres/` (traiteur)
- Erreurs métier : `CongeError` → HTTP 400 `{"error": "<message>"}`.
- Consumes: workflow, services, serializers, notifications (Tasks 3-7).

- [ ] **Step 1: Write the failing tests**

Ajouter à `backend/tests/test_conges_api.py` :

```python
# ─── Helpers d'API ──────────────────────────────────────────────────────────

@pytest.fixture
def motif_cp(db):
    return MotifConge.objects.create(nom='Congé annuel', type_conge='CP')


def _creer(client, employee, **extra):
    return client.post('/api/conges/demandes/', _payload(employee, **extra), format='json')


def _ref_via_api(demandeur_conge, employee):
    demandeur_conge.scope_directions.add(employee.direction)
    return _creer(_client(demandeur_conge), employee).data['reference'].replace('/', '-')


def _corps_validation(motif, **extra):
    data = {
        'type_conge': 'CP', 'motif': motif.id, 'date_etablissement': '2026-10-20', 'nb_jours': 10,
        'date_depart': '2026-11-01', 'date_retour': '2026-11-11', 'exercice': '2025/2026',
        'adresse_conge': 'ALGERIE', 'observations': 'RAS',
    }
    data.update(extra)
    return data


# ─── Création, liste, détail, annulation par le demandeur ───────────────────

def test_demandeur_cree_une_demande_dans_son_perimetre(demandeur_conge, employee):
    demandeur_conge.scope_directions.add(employee.direction)
    resp = _creer(_client(demandeur_conge), employee)
    assert resp.status_code == 201, resp.data
    assert resp.data['statut'] == 'recue' and resp.data['reference']
    assert resp.data['employee_matricule'] == employee.matricule
    assert DemandeConge.objects.get(id=resp.data['id']).demandeur_id == demandeur_conge.id
    assert AuditLog.objects.filter(action=AuditLog.Action.CREATE_CONGE).exists()


def test_creation_notifie_les_traiteurs(demandeur_conge, traiteur_conge, employee):
    demandeur_conge.scope_directions.add(employee.direction)
    _creer(_client(demandeur_conge), employee)
    assert Notification.objects.filter(destinataire=traiteur_conge, type=Notification.Type.CONGE_NOUVELLE).exists()


def test_gestionnaire_sans_drapeau_et_admin_ordinaire_ne_peuvent_pas_creer(gestionnaire_user, traiteur_conge, employee):
    gestionnaire_user.scope_directions.add(employee.direction)
    assert gestionnaire_user.peut_demander_conge is False
    assert _creer(_client(gestionnaire_user), employee).status_code == 403
    assert _creer(_client(traiteur_conge), employee).status_code == 403  # traiteur seul


def test_admin_non_charge_est_bloque_partout(admin_user, demandeur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(admin_user)
    assert client.get('/api/conges/demandes/').status_code == 403
    assert client.get(f'/api/conges/demandes/{ref}/').status_code == 403
    assert client.post(f'/api/conges/demandes/{ref}/valider/', {}, format='json').status_code == 403
    assert client.post(f'/api/conges/demandes/{ref}/annuler/', {}, format='json').status_code == 403
    assert client.get(f'/api/conges/soldes/{employee.matricule}/').status_code == 403
    assert client.get('/api/conges/motifs/').status_code == 403
    assert client.get('/api/conges/parametres/').status_code == 403


def test_demandeur_ne_voit_que_ses_demandes_et_pas_celles_d_un_autre(demandeur_conge, other_gestionnaire, employee):
    other_gestionnaire.peut_demander_conge = True
    other_gestionnaire.save(update_fields=['peut_demander_conge'])
    for u in (demandeur_conge, other_gestionnaire):
        u.scope_directions.add(employee.direction)
    _creer(_client(demandeur_conge), employee)
    ref2 = _creer(_client(other_gestionnaire), employee, date_depart='2027-01-01', date_retour='2027-01-11').data['reference'].replace('/', '-')
    rows = _rows(_client(demandeur_conge).get('/api/conges/demandes/').data)
    assert len(rows) == 1 and rows[0]['demandeur'] == demandeur_conge.id
    assert _client(demandeur_conge).get(f'/api/conges/demandes/{ref2}/').status_code == 403


def test_traiteur_voit_toutes_les_demandes(demandeur_conge, traiteur_conge, employee):
    _ref_via_api(demandeur_conge, employee)
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/').data)) == 1


def test_annulation_par_le_demandeur_est_un_soft_delete_limite_a_recue(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref1 = _ref_via_api(demandeur_conge, employee)
    assert _client(demandeur_conge).delete(f'/api/conges/demandes/{ref1}/').status_code == 204
    d = DemandeConge.objects.get(reference=ref1.replace('-', '/', 1))
    assert d.is_active is False
    assert AuditLog.objects.filter(action=AuditLog.Action.DELETE_CONGE).exists()
    assert _rows(_client(demandeur_conge).get('/api/conges/demandes/').data) == []
    ref2 = _creer(_client(demandeur_conge), employee).data['reference'].replace('/', '-')
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref2}/valider/', _corps_validation(motif_cp), format='json')
    assert _client(demandeur_conge).delete(f'/api/conges/demandes/{ref2}/').status_code == 403


def test_filtre_pending_traiteur_et_demandeur(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 1
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert len(_rows(_client(traiteur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 0
    assert len(_rows(_client(demandeur_conge).get('/api/conges/demandes/', {'pending': 1}).data)) == 1


# ─── Validation, rejet, récupération ────────────────────────────────────────

def test_valider_debite_les_soldes_et_notifie(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(
        f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp, nb_jours=20, date_retour='2026-11-21'), format='json',
    )
    assert resp.status_code == 200, resp.data
    assert resp.data['statut'] == 'prete'
    assert (resp.data['debit_reliquat'], resp.data['debit_annuel'], resp.data['debit_anticipe']) == (13, 7, 0)
    assert resp.data['validateur_nom'] == traiteur_conge.full_name
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (0, 23, 20)
    assert AuditLog.objects.filter(action=AuditLog.Action.VALIDER_CONGE).exists()
    assert Notification.objects.filter(destinataire=demandeur_conge, type=Notification.Type.CONGE_PRETE).exists()


def test_valider_solde_non_initialise_renvoie_400_lisible(demandeur_conge, traiteur_conge, employee, motif_cp):
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert resp.status_code == 400
    assert 'initialisés' in resp.data['error']


def test_valider_interdit_au_demandeur(demandeur_conge, employee, motif_cp):
    ref = _ref_via_api(demandeur_conge, employee)
    assert _client(demandeur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json').status_code == 403


def test_rejeter_notifie_le_demandeur(demandeur_conge, traiteur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    resp = _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/rejeter/', {'motif': 'Période de clôture'}, format='json')
    assert resp.status_code == 200 and resp.data['statut'] == 'rejetee'
    assert AuditLog.objects.filter(action=AuditLog.Action.REJETER_CONGE).exists()
    assert Notification.objects.filter(destinataire=demandeur_conge, type=Notification.Type.CONGE_REJETEE).exists()


def test_recuperee_exige_prete(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    assert client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json').status_code == 400
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    resp = client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json')
    assert resp.status_code == 200 and resp.data['statut'] == 'recuperee'
    assert AuditLog.objects.filter(action=AuditLog.Action.RECUPERER_CONGE).exists()


# ─── Annulation et interruption par le traiteur ─────────────────────────────

def test_annuler_exige_la_reference_et_restitue_avec_audit(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    mauvais = client.post(f'/api/conges/demandes/{ref}/annuler/', {'motif': 'x', 'reference_confirmation': '99999/99'}, format='json')
    assert mauvais.status_code == 400
    ok = client.post(
        f'/api/conges/demandes/{ref}/annuler/',
        {'motif': "Annulé par l'employé", 'reference_confirmation': ref.replace('-', '/', 1)}, format='json',
    )
    assert ok.status_code == 200 and ok.data['statut'] == 'annulee'
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (13, 30, 0)
    log = AuditLog.objects.filter(action=AuditLog.Action.ANNULER_CONGE).latest('id')
    assert log.details['motif'] == "Annulé par l'employé"
    assert Notification.objects.filter(destinataire=demandeur_conge, type=Notification.Type.CONGE_ANNULEE).exists()


def test_interrompre_recalcule_et_trace(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    resp = client.post(
        f'/api/conges/demandes/{ref}/interrompre/', {'date_rappel': '2026-11-05', 'motif': "Rappel de l'employeur"}, format='json',
    )
    assert resp.status_code == 200, resp.data
    assert resp.data['statut'] == 'interrompue' and resp.data['jours_effectifs'] == 4
    solde = SoldeConge.objects.get(employee=employee)
    assert (solde.reliquat, solde.annuel, solde.cp_consomme) == (9, 30, 4)  # 13 − 4 pris
    log = AuditLog.objects.filter(action=AuditLog.Action.INTERROMPRE_CONGE).latest('id')
    assert log.details['jours_effectifs'] == 4 and log.details['jours_restitues'] == 6
    assert Notification.objects.filter(destinataire=demandeur_conge, type=Notification.Type.CONGE_INTERROMPUE).exists()


def test_interrompre_date_invalide_renvoie_400(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    resp = client.post(f'/api/conges/demandes/{ref}/interrompre/', {'date_rappel': '2026-12-01', 'motif': 'x'}, format='json')
    assert resp.status_code == 400 and 'error' in resp.data


def test_observations_modifiables_tant_que_pas_recuperee(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    client.post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    assert client.patch(f'/api/conges/demandes/{ref}/observations/', {'observations': 'corrigé'}, format='json').status_code == 200
    client.post(f'/api/conges/demandes/{ref}/recuperee/', {}, format='json')
    assert client.patch(f'/api/conges/demandes/{ref}/observations/', {'observations': 'trop tard'}, format='json').status_code == 400
    assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_CONGE).exists()


def test_scan_accepte_un_pdf_et_refuse_un_executable(demandeur_conge, traiteur_conge, employee, media_tmp, pdf_bytes):
    from django.core.files.uploadedfile import SimpleUploadedFile
    ref = _ref_via_api(demandeur_conge, employee)
    client = _client(traiteur_conge)
    ok = client.post(f'/api/conges/demandes/{ref}/scan/',
                     {'scan_document': SimpleUploadedFile('t.pdf', pdf_bytes, content_type='application/pdf')}, format='multipart')
    assert ok.status_code == 200, ok.data
    assert AuditLog.objects.filter(action=AuditLog.Action.SCAN_CONGE).exists()
    ko = client.post(f'/api/conges/demandes/{ref}/scan/',
                     {'scan_document': SimpleUploadedFile('x.pdf', b'MZ\x90\x00' + b'\x00' * 64, content_type='application/pdf')}, format='multipart')
    assert ko.status_code == 400


# ─── Soldes (lecture scopée, saisie initiale, correction) ──────────────────

def test_solde_non_initialise_est_signale(traiteur_conge, employee):
    resp = _client(traiteur_conge).get(f'/api/conges/soldes/{employee.matricule}/')
    assert resp.status_code == 200
    assert resp.data == {'initialise': False, 'solde': None, 'mouvements': []}


def test_initial_puis_lecture_avec_mouvements_pour_le_traiteur(traiteur_conge, employee):
    client = _client(traiteur_conge)
    resp = client.post(f'/api/conges/soldes/{employee.matricule}/initial/',
                       {'reliquat': 5, 'annuel': 30, 'droit_initial': 210, 'cp_consomme': 180}, format='json')
    assert resp.status_code == 201, resp.data
    assert AuditLog.objects.filter(action=AuditLog.Action.INITIAL_SOLDE_CONGE).exists()
    lecture = client.get(f'/api/conges/soldes/{employee.matricule}/').data
    assert lecture['initialise'] is True
    assert (lecture['solde']['reliquat'], lecture['solde']['actuel'], lecture['solde']['cp_consomme']) == (5, 35, 180)
    assert len(lecture['mouvements']) == 1
    assert client.post(f'/api/conges/soldes/{employee.matricule}/initial/', {'annuel': 1}, format='json').status_code == 400


def test_initial_et_correction_interdits_au_demandeur(demandeur_conge, employee):
    client = _client(demandeur_conge)
    assert client.post(f'/api/conges/soldes/{employee.matricule}/initial/', {'annuel': 30}, format='json').status_code == 403
    assert client.post(f'/api/conges/soldes/{employee.matricule}/correction/', {'annuel': 1, 'motif': 'x'}, format='json').status_code == 403


def test_correction_exige_un_motif_et_trace(traiteur_conge, employee, solde_employe):
    solde_employe(reliquat=5, annuel=30)
    client = _client(traiteur_conge)
    assert client.post(f'/api/conges/soldes/{employee.matricule}/correction/', {'reliquat': -2, 'motif': ' '}, format='json').status_code == 400
    ok = client.post(f'/api/conges/soldes/{employee.matricule}/correction/', {'reliquat': -2, 'motif': 'Erreur de reprise'}, format='json')
    assert ok.status_code == 200 and ok.data['reliquat'] == 3
    log = AuditLog.objects.filter(action=AuditLog.Action.CORRIGER_SOLDE_CONGE).latest('id')
    assert log.details['motif'] == 'Erreur de reprise'


def test_demandeur_voit_le_solde_dans_son_perimetre_sans_les_mouvements(demandeur_conge, employee, solde_employe):
    solde_employe(reliquat=5, annuel=30)
    demandeur_conge.scope_directions.add(employee.direction)
    resp = _client(demandeur_conge).get(f'/api/conges/soldes/{employee.matricule}/')
    assert resp.status_code == 200
    assert resp.data['solde']['actuel'] == 35 and resp.data['mouvements'] == []


def test_demandeur_ne_voit_pas_le_solde_hors_perimetre(demandeur_conge, employee, solde_employe, other_direction):
    solde_employe(annuel=30)
    demandeur_conge.scope_directions.add(other_direction)
    assert _client(demandeur_conge).get(f'/api/conges/soldes/{employee.matricule}/').status_code == 403


# ─── Motifs et paramètres ───────────────────────────────────────────────────

def test_motifs_crud_traiteur_et_desactivation(traiteur_conge):
    client = _client(traiteur_conge)
    r = client.post('/api/conges/motifs/', {'nom': 'Mariage', 'type_conge': 'CE'}, format='json')
    assert r.status_code == 201
    assert client.post('/api/conges/motifs/', {'nom': 'mariage', 'type_conge': 'CE'}, format='json').status_code == 400
    assert client.patch(f"/api/conges/motifs/{r.data['id']}/", {'nom': "Mariage de l'employé"}, format='json').status_code == 200
    assert client.delete(f"/api/conges/motifs/{r.data['id']}/").status_code == 204
    assert MotifConge.objects.get(pk=r.data['id']).is_active is False  # jamais supprimé


def test_parametres_droit_annuel(traiteur_conge):
    client = _client(traiteur_conge)
    assert client.get('/api/conges/parametres/').data['droit_annuel_jours'] == 30
    assert client.put('/api/conges/parametres/', {'droit_annuel_jours': 35}, format='json').status_code == 200
    assert client.put('/api/conges/parametres/', {'droit_annuel_jours': 0}, format='json').status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_api.py -v`
Expected: FAIL (404 sur `/api/conges/...`).

- [ ] **Step 3: Create `conges/views.py`**

```python
from functools import wraps

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from employees.models import Employee
from . import notifications, services, workflow
from .models import DemandeConge, MotifConge, MouvementConge, ParametreConge, SoldeConge
from .permissions import CanAccessConges, CanRequestConge, IsCongeManager
from .serializers import (
    AnnulerSerializer, CongeScanSerializer, DemandeCongeCreateSerializer, DemandeCongeSerializer,
    InterrompreSerializer, MotifCongeSerializer, MouvementCongeSerializer, ObservationsSerializer,
    ParametreCongeSerializer, RejeterSerializer, SoldeCongeSerializer, SoldeCorrectionSerializer,
    SoldeInitialSerializer, ValiderSerializer,
)

SELECT_RELATED = (
    'employee', 'employee__direction', 'employee__departement', 'employee__service',
    'employee__poste', 'employee__type_contrat', 'contrat', 'demandeur', 'traite_par',
    'motif', 'annulee_par', 'interrompue_par',
)


def _actives():
    return DemandeConge.objects.filter(is_active=True).select_related(*SELECT_RELATED)


def erreurs_metier(vue):
    """Convertit une CongeError (message français) en HTTP 400 {"error": …}."""
    @wraps(vue)
    def enveloppe(*args, **kwargs):
        try:
            return vue(*args, **kwargs)
        except services.CongeError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return enveloppe


class ReferenceLookupMixin:
    """Résout la demande par sa référence (`00001-26` dans l'URL pour `00001/26`).
    Ne voit que les demandes actives (soft-delete)."""
    lookup_url_kwarg = 'ref'

    def get_queryset(self):
        return _actives()

    def get_object(self):
        ref = self.kwargs[self.lookup_url_kwarg].replace('-', '/', 1)
        obj = get_object_or_404(self.filter_queryset(self.get_queryset()), reference=ref)
        self.check_object_permissions(self.request, obj)
        return obj


def _reponse(demande, request):
    return Response(DemandeCongeSerializer(demande, context={'request': request}).data)


# ─── Demandes : liste, création, détail, annulation par le demandeur ───────

class DemandeCongeListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [CanRequestConge()] if self.request.method == 'POST' else [CanAccessConges()]

    def get_serializer_class(self):
        return DemandeCongeCreateSerializer if self.request.method == 'POST' else DemandeCongeSerializer

    def get_queryset(self):
        qs = _actives()
        user, params = self.request.user, self.request.query_params
        if params.get('employee'):
            qs = qs.filter(employee__matricule=params['employee'])
        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) | Q(employee__nom__icontains=q) | Q(employee__prenom__icontains=q) |
                Q(employee__matricule__icontains=q) | Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )
        if user.can_manage_conges:
            if params.get('statut'):
                qs = qs.filter(statut=params['statut'])
            if params.get('pending'):
                qs = qs.filter(statut=DemandeConge.Statut.RECUE)  # badge traiteur : pas encore prises en charge
            return qs
        qs = qs.filter(demandeur=user)  # un demandeur ne voit que ses demandes
        if params.get('pending'):
            qs = qs.filter(statut=DemandeConge.Statut.PRETE)  # badge demandeur : titres prêts à récupérer
        return qs

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_CONGE, target=demande,
            details={
                'employee': str(demande.employee), 'date_depart': demande.date_depart.isoformat(),
                'date_retour': demande.date_retour.isoformat(), 'nb_jours': demande.nb_jours,
            },
        )
        notifications.notifier_nouvelle_demande(demande)


class DemandeCongeDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET : traiteurs + demandeur (sa demande). DELETE : demandeur, statut `Reçue`
    uniquement, en soft-delete (rien n'a été débité à ce stade)."""
    serializer_class = DemandeCongeSerializer
    permission_classes = [CanAccessConges]

    def get_object(self):
        obj = super().get_object()
        user = self.request.user
        if not user.can_manage_conges and obj.demandeur_id != user.id:
            raise PermissionDenied("Cette demande ne vous appartient pas.")
        return obj

    def perform_destroy(self, instance):
        if instance.demandeur_id != self.request.user.id or instance.statut != DemandeConge.Statut.RECUE:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est au statut 'Reçue'."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_CONGE, target=instance,
            details={'employee': str(instance.employee), 'reference': instance.reference},
        )
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])


# ─── Actions du traiteur sur un titre ──────────────────────────────────────

class _ActionTraiteurView(ReferenceLookupMixin, APIView):
    permission_classes = [IsCongeManager]


class ValiderView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = ValiderSerializer(data=request.data, context={'demande': demande})
        serializer.is_valid(raise_exception=True)
        valide = workflow.valider_demande(demande, auteur=request.user, donnees=serializer.validated_data)
        AuditLog.log(
            request, AuditLog.Action.VALIDER_CONGE, target=valide,
            details={
                'type_conge': valide.type_conge, 'nb_jours': valide.nb_jours, 'exercice': valide.exercice,
                'ventilation': {'reliquat': valide.debit_reliquat, 'annuel': valide.debit_annuel,
                                'anticipe': valide.debit_anticipe},
                'signataire': valide.signataire_nom, 'interim': valide.signataire_interim,
            },
        )
        notifications.notifier_validee(valide, request.user)
        return _reponse(valide, request)


class RejeterView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = RejeterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ancien = demande.statut
        rejete = workflow.rejeter_demande(demande, auteur=request.user, motif=serializer.validated_data['motif'])
        AuditLog.log(
            request, AuditLog.Action.REJETER_CONGE, target=rejete,
            details={'de': ancien, 'motif': rejete.motif_rejet},
        )
        notifications.notifier_rejetee(rejete, request.user)
        return _reponse(rejete, request)


class RecupereeView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        recuperee = workflow.marquer_recuperee(self.get_object(), auteur=request.user)
        AuditLog.log(request, AuditLog.Action.RECUPERER_CONGE, target=recuperee,
                     details={'reference': recuperee.reference})
        return _reponse(recuperee, request)


class AnnulerView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = AnnulerSerializer(data=request.data, context={'demande': demande})
        serializer.is_valid(raise_exception=True)
        annulee = workflow.annuler_demande(demande, auteur=request.user, motif=serializer.validated_data['motif'])
        AuditLog.log(
            request, AuditLog.Action.ANNULER_CONGE, target=annulee,
            details={
                'motif': annulee.motif_annulation, 'type_conge': annulee.type_conge,
                'restitue': {'reliquat': annulee.debit_reliquat, 'annuel': annulee.debit_annuel,
                             'anticipe': annulee.debit_anticipe},
            },
        )
        notifications.notifier_annulee(annulee, request.user)
        return _reponse(annulee, request)


class InterrompreView(_ActionTraiteurView):
    @erreurs_metier
    def post(self, request, ref):
        demande = self.get_object()
        serializer = InterrompreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        interrompue = workflow.interrompre_demande(
            demande, auteur=request.user, date_rappel=serializer.validated_data['date_rappel'],
            motif=serializer.validated_data['motif'],
        )
        AuditLog.log(
            request, AuditLog.Action.INTERROMPRE_CONGE, target=interrompue,
            details={
                'date_rappel': interrompue.date_rappel.isoformat(), 'motif': interrompue.motif_interruption,
                'jours_prevus': interrompue.nb_jours, 'jours_effectifs': interrompue.jours_effectifs,
                'jours_restitues': interrompue.nb_jours - interrompue.jours_effectifs,
            },
        )
        notifications.notifier_interrompue(interrompue, request.user)
        return _reponse(interrompue, request)


class ObservationsView(ReferenceLookupMixin, generics.UpdateAPIView):
    permission_classes = [IsCongeManager]
    serializer_class = ObservationsSerializer
    http_method_names = ['patch']

    def perform_update(self, serializer):
        avant = serializer.instance.observations
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_CONGE, target=demande,
            details={'observations': {'avant': avant, 'apres': demande.observations}},
        )


class ScanView(ReferenceLookupMixin, generics.UpdateAPIView):
    """Scan du titre signé : optionnel, jamais bloquant. Traiteur uniquement."""
    permission_classes = [IsCongeManager]
    serializer_class = CongeScanSerializer
    http_method_names = ['post', 'patch']

    def post(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        demande = serializer.save()
        AuditLog.log(self.request, AuditLog.Action.SCAN_CONGE, target=demande,
                     details={'reference': demande.reference})


# ─── Soldes ─────────────────────────────────────────────────────────────────

class _SoldeBaseView(APIView):
    def get_employee(self, matricule):
        return get_object_or_404(Employee, matricule=matricule)


class SoldeView(_SoldeBaseView):
    """GET soldes/<matricule>/ — traiteur : tout (avec l'historique des
    mouvements) ; demandeur : le solde d'un employé de son périmètre, sans
    l'historique ; les autres : 403."""
    permission_classes = [CanAccessConges]

    def get(self, request, matricule):
        employee = self.get_employee(matricule)
        user = request.user
        if not user.can_manage_conges and not user.can_access_employee(employee):
            raise PermissionDenied("Cet employé n'est pas dans votre périmètre.")
        solde = SoldeConge.objects.filter(employee=employee).select_related('employee').first()
        if solde is None:
            return Response({'initialise': False, 'solde': None, 'mouvements': []})
        mouvements = []
        if user.can_manage_conges:
            mouvements = MouvementCongeSerializer(
                MouvementConge.objects.filter(employee=employee).select_related('auteur', 'demande')[:200], many=True,
            ).data
        return Response({'initialise': True, 'solde': SoldeCongeSerializer(solde).data, 'mouvements': mouvements})


class SoldeInitialView(_SoldeBaseView):
    permission_classes = [IsCongeManager]

    @erreurs_metier
    def post(self, request, matricule):
        employee = self.get_employee(matricule)
        serializer = SoldeInitialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        valeurs = dict(serializer.validated_data)
        motif = valeurs.pop('motif', '')
        solde = services.initialiser_solde(employee, valeurs, auteur=request.user, motif=motif)
        AuditLog.log(request, AuditLog.Action.INITIAL_SOLDE_CONGE, target=employee,
                     details={**valeurs, 'motif': motif})
        return Response(SoldeCongeSerializer(solde).data, status=status.HTTP_201_CREATED)


class SoldeCorrectionView(_SoldeBaseView):
    permission_classes = [IsCongeManager]

    @erreurs_metier
    def post(self, request, matricule):
        employee = self.get_employee(matricule)
        serializer = SoldeCorrectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        valeurs = dict(serializer.validated_data)
        motif = valeurs.pop('motif')
        solde = services.corriger_solde(employee, valeurs, auteur=request.user, motif=motif)
        AuditLog.log(request, AuditLog.Action.CORRIGER_SOLDE_CONGE, target=employee,
                     details={'corrections': valeurs, 'motif': motif})
        return Response(SoldeCongeSerializer(solde).data)


# ─── Motifs et paramètres ───────────────────────────────────────────────────

class MotifCongeListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsCongeManager]
    serializer_class = MotifCongeSerializer
    queryset = MotifConge.objects.all()
    pagination_class = None


class MotifCongeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """DELETE = désactivation (is_active=False) : un motif déjà utilisé n'est jamais supprimé."""
    permission_classes = [IsCongeManager]
    serializer_class = MotifCongeSerializer
    queryset = MotifConge.objects.all()

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active'])


class ParametreCongeView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsCongeManager]
    serializer_class = ParametreCongeSerializer

    def get_object(self):
        return ParametreConge.get()
```

- [ ] **Step 4: Wire the routes**

`backend/conges/urls.py` :

```python
from django.urls import path

from .views import (
    AnnulerView, DemandeCongeDetailView, DemandeCongeListCreateView, InterrompreView,
    MotifCongeDetailView, MotifCongeListCreateView, ObservationsView, ParametreCongeView,
    RecupereeView, RejeterView, ScanView, SoldeCorrectionView, SoldeInitialView, SoldeView,
    ValiderView,
)

urlpatterns = [
    path('demandes/', DemandeCongeListCreateView.as_view()),
    # <str:ref> : référence encodée pour l'URL (« 00001-26 » pour « 00001/26 »).
    path('demandes/<str:ref>/', DemandeCongeDetailView.as_view()),
    path('demandes/<str:ref>/valider/', ValiderView.as_view()),
    path('demandes/<str:ref>/rejeter/', RejeterView.as_view()),
    path('demandes/<str:ref>/recuperee/', RecupereeView.as_view()),
    path('demandes/<str:ref>/annuler/', AnnulerView.as_view()),
    path('demandes/<str:ref>/interrompre/', InterrompreView.as_view()),
    path('demandes/<str:ref>/observations/', ObservationsView.as_view()),
    path('demandes/<str:ref>/scan/', ScanView.as_view()),
    path('soldes/<str:matricule>/', SoldeView.as_view()),
    path('soldes/<str:matricule>/initial/', SoldeInitialView.as_view()),
    path('soldes/<str:matricule>/correction/', SoldeCorrectionView.as_view()),
    path('motifs/', MotifCongeListCreateView.as_view()),
    path('motifs/<int:pk>/', MotifCongeDetailView.as_view()),
    path('parametres/', ParametreCongeView.as_view()),
]
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd backend && pytest tests/test_conges_api.py -v`
Expected: PASS. Si le `matricule` peut contenir un caractère interdit dans `<str:…>` (par exemple `/`), passer à `<path:matricule>` — à vérifier sur les données réelles.

- [ ] **Step 6: Commit**

```bash
git add backend/conges/views.py backend/conges/urls.py backend/tests/test_conges_api.py
git commit -m "feat(conges): vues et routes (demandes, valider/rejeter/annuler/interrompre, soldes, motifs, paramètres)"
```

---

### Task 9: Titre de congé PDF, aperçu, configuration, statistiques

**Files:**
- Modify: `backend/attestations/pdf.py:141-152` (`_draw_title` reçoit `titre`), `backend/conges/views.py` (ajouts), `backend/conges/urls.py`
- Create: `backend/conges/pdf.py`
- Test: `backend/tests/test_conges_pdf.py`, `backend/tests/test_conges_api.py` (ajouts)

**Interfaces:**
- Produces: `attestations.pdf._draw_title(c, mention='', titre="ATTESTATION DE TRAVAIL")` (rétro-compatible) ; `conges.pdf.build_conge_pdf(titre, config, date_generation, contrat_numero='', mention='') -> bytes` ; `conges.pdf.sous_titre(titre) -> str` ; routes `GET demandes/<ref>/apercu/` (409 `{needs_confirmation, date_document, date_nouvelle}` / `?confirmer_date=1`), `GET|PUT|PATCH config/`, `POST config/apercu/`, `GET config/logo-defaut/`, `GET stats/?date_debut=&date_fin=` → `{total, par_gestionnaire[{id,nom,count}], par_employe[{id,nom,count}], par_statut[{id,nom,count}], evolution_mensuelle[{mois,recues,recuperees}], delai_moyen_jours}`.
- Consumes: helpers privés de `attestations.pdf` (`_y`, `_maj`, `_date`, `_draw_header`, `_draw_title`, `_draw_reference_block`, constantes `PAGE_W`, `POLICE*`, `TAILLE_*`, `X_LABEL`, `X_COLON_LONG`, `X_VALUE_LONG`, `X_RIGHT`, `LOGO_PAR_DEFAUT`) — `_draw_header` et `_draw_reference_block` ne lisent que des attributs présents à l'identique sur `CongeTemplateConfig` et sur le titre (`reference`, `employee.matricule`).

- [ ] **Step 1: Write the failing PDF tests**

```python
# backend/tests/test_conges_pdf.py
import datetime
import inspect
from types import SimpleNamespace

import pytest

from conges.models import CongeTemplateConfig
from conges.pdf import build_conge_pdf, sous_titre

pytestmark = pytest.mark.django_db


def _employe(**extra):
    base = dict(
        matricule="009890", nom="NACER", prenom="SID AHMED",
        date_embauche=datetime.date(2015, 1, 1), poste_id=1,
        poste=SimpleNamespace(nom="Peintre industriel"),
        direction=SimpleNamespace(nom="DAT"), departement=SimpleNamespace(nom="GMO"),
        service=SimpleNamespace(nom="GL3/Z"),
    )
    base.update(extra)
    return SimpleNamespace(**base)


def _titre(**extra):
    base = dict(
        reference="04512/26", employee=_employe(), type_conge='CP',
        debit_reliquat=13, debit_annuel=0, debit_anticipe=0, nb_jours=13,
        date_depart=datetime.date(2026, 8, 10), date_retour=datetime.date(2026, 8, 23),
        adresse_conge="ALGERIE", exercice="2024/2025", date_etablissement=datetime.date(2026, 8, 9),
        signataire_nom="A.BOUSMAHA", signataire_titre="Chef de Département Administration du Personnel",
        signataire_interim=False, statut='prete',
    )
    base.update(extra)
    return SimpleNamespace(**base)


@pytest.mark.parametrize('champs,attendu', [
    (dict(type_conge='CP', debit_reliquat=13, debit_annuel=7), '- RELIQUAT -'),
    (dict(type_conge='CP', debit_reliquat=0, debit_annuel=7), '- ANNUEL -'),
    (dict(type_conge='CP', debit_reliquat=0, debit_annuel=0, debit_anticipe=5), '- ANTICIPE -'),
    (dict(type_conge='CE'), '- CONGE EXCEPTIONNEL -'),
    (dict(type_conge='CS'), '- CONGE SANS SOLDE -'),
])
def test_sous_titre_selon_le_type_et_le_compartiment(champs, attendu):
    assert sous_titre(_titre(**champs)) == attendu


def test_build_conge_pdf_renvoie_un_pdf():
    pdf = build_conge_pdf(_titre(), CongeTemplateConfig(), datetime.date(2026, 8, 9), contrat_numero="020528")
    assert pdf.startswith(b'%PDF') and len(pdf) > 1500


def test_build_conge_pdf_tolere_un_employe_incomplet():
    titre = _titre(employee=_employe(poste_id=None, poste=None, direction=None, departement=None, service=None, date_embauche=None))
    assert build_conge_pdf(titre, CongeTemplateConfig(), datetime.date(2026, 8, 9)).startswith(b'%PDF')


def test_build_conge_pdf_mode_test_et_annule_changent_le_contenu():
    cfg, jour = CongeTemplateConfig(), datetime.date(2026, 8, 9)
    normal = build_conge_pdf(_titre(), cfg, jour)
    assert build_conge_pdf(_titre(), cfg, jour, mention="(mode test)") != normal
    assert build_conge_pdf(_titre(statut='annulee'), cfg, jour) != normal  # filigrane ANNULE


def test_build_conge_pdf_interim_et_signataire_figes_changent_le_contenu():
    cfg, jour = CongeTemplateConfig(), datetime.date(2026, 8, 9)
    assert build_conge_pdf(_titre(signataire_interim=True, signataire_nom='INTERIMAIRE'), cfg, jour) != build_conge_pdf(_titre(), cfg, jour)


def test_attestation_pdf_garde_son_titre_par_defaut():
    from attestations import pdf as att_pdf
    assert inspect.signature(att_pdf._draw_title).parameters['titre'].default == "ATTESTATION DE TRAVAIL"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && pytest tests/test_conges_pdf.py -v`
Expected: FAIL (`ModuleNotFoundError: conges.pdf`).

- [ ] **Step 3: Parameterize the title in `attestations/pdf.py`**

Remplacer la signature de `_draw_title` par `def _draw_title(c, mention='', titre="ATTESTATION DE TRAVAIL"):` et supprimer la ligne `titre = "ATTESTATION DE TRAVAIL"` du corps (le reste, qui utilise `titre`, est inchangé). Compléter la docstring : « `titre` : texte du cadre, réutilisé par l'app conges ».

- [ ] **Step 4: Create `conges/pdf.py`**

```python
"""
Titre de congé (PDF ReportLab) — calé sur le modèle papier officiel (photo du
2026-10-20) : en-tête société + logo, cadre « TITRE DE CONGE » avec sous-titre
(« - RELIQUAT - »…), bloc REF/MATRICULE/CONTRAT, corps (Nom & Prénom, Fonction,
Structure + Affectation, Nombre de jour, Date de Départ + Date de Retour,
Adresse durant Congé, Exercice), « Fait à <ville>, le : », bloc signataire,
pied de page. Aucun cadre « réservé à l'administration » sur le papier.

Réutilise le gabarit d'en-tête/titre/bloc de référence de attestations.pdf.
Coordonnées en millimètres DEPUIS LE HAUT de la page (helper `_y`) : les
constantes Y_*/X_* ci-dessous sont à affiner en comparant le rendu au papier.
"""
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from attestations.pdf import (
    PAGE_W, POLICE, POLICE_GRAS, POLICE_ITAL, TAILLE_LABEL, TAILLE_PIED, TAILLE_VALEUR,
    X_COLON_LONG, X_LABEL, X_RIGHT, X_VALUE_LONG,
    _date, _draw_header, _draw_reference_block, _draw_title, _maj, _y,
)

TITRE = "TITRE DE CONGE"

# Ordonnées (mm depuis le haut) — relevées sur le papier officiel.
Y_SOUS_TITRE = 80
Y_MENTION = 86
Y_NOM = 118
Y_FONCTION = 126
Y_STRUCTURE = 134
Y_JOURS = 148
Y_DEPART = 156
Y_ADRESSE = 168
Y_EXERCICE = 178
Y_FAIT_A = 205
Y_SIGNATAIRE_TITRE = 222
Y_SIGNATAIRE_NOM = 232
X_COL2_LABEL = 118   # « Affectation : », « Date de Retour : »
X_COL2_VALEUR = 152


def sous_titre(titre) -> str:
    """Mention sous le cadre : compartiment débité pour un CP, sinon le type."""
    if titre.type_conge == 'CE':
        return "- CONGE EXCEPTIONNEL -"
    if titre.type_conge == 'CS':
        return "- CONGE SANS SOLDE -"
    if titre.debit_reliquat > 0:
        return "- RELIQUAT -"
    if titre.debit_annuel > 0:
        return "- ANNUEL -"
    if titre.debit_anticipe > 0:
        return "- ANTICIPE -"
    return ""


def _ligne(c, y_mm, label, valeur):
    y = _y(y_mm)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, y, label)
    c.drawString(X_COLON_LONG * mm, y, ':')
    c.setFont(POLICE, TAILLE_VALEUR)
    c.drawString(X_VALUE_LONG * mm, y, str(valeur or ''))


def _colonne2(c, y_mm, label, valeur):
    y = _y(y_mm)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_COL2_LABEL * mm, y, f"{label} :")
    c.setFont(POLICE, TAILLE_VALEUR)
    c.drawString(X_COL2_VALEUR * mm, y, str(valeur or ''))


def _nom_de(objet):
    return getattr(objet, 'nom', '') if objet is not None else ''


def _draw_filigrane_annule(c):
    c.saveState()
    c.setFillGray(0.82)
    c.setFont(POLICE_GRAS, 110)
    c.translate(PAGE_W / 2, _y(150))
    c.rotate(35)
    c.drawCentredString(0, 0, "ANNULE")
    c.restoreState()


def _draw_sous_titre(c, titre, mention):
    texte = sous_titre(titre)
    if texte:
        c.setFont(POLICE_GRAS, 14)
        c.drawCentredString(PAGE_W / 2, _y(Y_SOUS_TITRE), texte)
    if mention:
        c.setFillColorRGB(0.8, 0, 0)
        c.setFont(POLICE_GRAS, 8)
        c.drawCentredString(PAGE_W / 2, _y(Y_MENTION), mention)
        c.setFillColorRGB(0, 0, 0)


def _draw_corps(c, titre):
    employe = titre.employee
    _ligne(c, Y_NOM, "Nom & Prénom", _maj(f"{employe.nom}   {employe.prenom}"))
    _ligne(c, Y_FONCTION, "Fonction", _maj(employe.poste.nom if employe.poste_id else ''))
    structure = ' / '.join(p for p in (_nom_de(employe.direction), _nom_de(employe.departement)) if p)
    _ligne(c, Y_STRUCTURE, "Structure", _maj(structure))
    _colonne2(c, Y_STRUCTURE, "Affectation", _maj(_nom_de(employe.service)))
    _ligne(c, Y_JOURS, "Nombre de jour", f"{titre.nb_jours}  j")
    _ligne(c, Y_DEPART, "Date de Départ", _date(titre.date_depart))
    _colonne2(c, Y_DEPART, "Date de Retour", _date(titre.date_retour))
    _ligne(c, Y_ADRESSE, "Adresse durant Congé", _maj(titre.adresse_conge))
    _ligne(c, Y_EXERCICE, "Exercice", titre.exercice)


def _draw_signature(c, titre, config):
    """« Fait à <ville>, le : <date> » puis le bloc signataire FIGÉ sur le titre
    (« P.I » si signé par intérim). L'espace en dessous reste libre pour la
    signature et le cachet apposés à la main."""
    date_txt = _date(titre.date_etablissement)
    y = _y(Y_FAIT_A)
    c.setFont(POLICE, TAILLE_VALEUR + 1)
    c.drawRightString(X_RIGHT * mm, y, date_txt)
    x_date = X_RIGHT * mm - c.stringWidth(date_txt, POLICE, TAILLE_VALEUR + 1)
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawRightString(x_date - 4 * mm, y, f"Fait à {config.ville or ''}, le :")

    ligne = f"LE  {_maj(titre.signataire_titre)}"
    if titre.signataire_interim:
        ligne += ", P.I"
    c.setFont(POLICE_GRAS, TAILLE_LABEL)
    c.drawString(X_LABEL * mm, _y(Y_SIGNATAIRE_TITRE), ligne)
    c.drawString(X_LABEL * mm, _y(Y_SIGNATAIRE_NOM), titre.signataire_nom or '')


def _draw_pied(c, config):
    """Filet + coordonnées en bas de page (le papier ne porte pas « Édité le »)."""
    c.setLineWidth(0.5)
    c.line(X_LABEL * mm, _y(288), X_RIGHT * mm, _y(288))
    parties = [f"{config.societe_nom or ''} {config.adresse or ''}".strip()]
    if config.telephone:
        parties.append(f"Tél. {config.telephone}")
    if config.fax:
        parties.append(f"Fax {config.fax}")
    if config.telex:
        parties.append(f"Télex {config.telex}")
    c.setFont(POLICE_ITAL, TAILLE_PIED)
    c.drawCentredString(PAGE_W / 2, _y(291.5), "    ".join(parties))


def build_conge_pdf(titre, config, date_generation, contrat_numero='', mention=''):
    """PDF du titre de congé (bytes). `date_generation` est conservée pour la
    symétrie avec l'attestation ; la date imprimée est `titre.date_etablissement`.
    `mention` : « (mode test) » en rouge — vide pour un titre officiel."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setTitle(f"Titre de congé — {titre.reference}")

    if getattr(titre, 'statut', '') == 'annulee':
        _draw_filigrane_annule(c)  # dessiné en premier : sous le texte
    _draw_header(c, config)
    _draw_title(c, '', titre=TITRE)
    _draw_sous_titre(c, titre, mention)
    _draw_reference_block(c, titre, contrat_numero)
    _draw_corps(c, titre)
    _draw_signature(c, titre, config)
    _draw_pied(c, config)

    c.showPage()
    c.save()
    return buffer.getvalue()
```

- [ ] **Step 5: Run PDF tests**

Run: `cd backend && pytest tests/test_conges_pdf.py tests/test_attestations.py -v`
Expected: PASS (les tests d'attestation confirment l'absence de régression de `_draw_title`).

- [ ] **Step 6: Write the failing API tests (aperçu, configuration, statistiques)**

Ajouter à `backend/tests/test_conges_api.py` :

```python
# ─── Aperçu PDF ─────────────────────────────────────────────────────────────

def _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    solde_employe(reliquat=13, annuel=30)
    ref = _ref_via_api(demandeur_conge, employee)
    _client(traiteur_conge).post(f'/api/conges/demandes/{ref}/valider/', _corps_validation(motif_cp), format='json')
    return ref


def test_apercu_renvoie_un_pdf_et_trace_l_audit(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    resp = _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/')
    assert resp.status_code == 200 and resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')
    assert AuditLog.objects.filter(action=AuditLog.Action.APERCU_CONGE).exists()


def test_apercu_refuse_tant_que_la_demande_n_est_pas_validee(demandeur_conge, traiteur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    assert _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 400


def test_apercu_interdit_au_demandeur(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    assert _client(demandeur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 403


def test_apercu_fige_la_date_et_demande_confirmation_si_elle_change(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    client, today = _client(traiteur_conge), timezone.localdate()
    client.get(f'/api/conges/demandes/{ref}/apercu/')
    d = DemandeConge.objects.get(reference=ref.replace('-', '/', 1))
    assert d.date_document == today
    DemandeConge.objects.filter(pk=d.pk).update(date_document=today - datetime.timedelta(days=1))
    resp = client.get(f'/api/conges/demandes/{ref}/apercu/')
    assert resp.status_code == 409 and resp.data['needs_confirmation'] is True
    assert client.get(f'/api/conges/demandes/{ref}/apercu/', {'confirmer_date': 1}).status_code == 200
    d.refresh_from_db()
    assert d.date_document == today


def test_apercu_d_un_titre_annule_reste_accessible_avec_filigrane(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    ref = _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    _client(traiteur_conge).post(
        f'/api/conges/demandes/{ref}/annuler/', {'motif': 'x', 'reference_confirmation': ref.replace('-', '/', 1)}, format='json',
    )
    assert _client(traiteur_conge).get(f'/api/conges/demandes/{ref}/apercu/').status_code == 200


# ─── Configuration du modèle ────────────────────────────────────────────────

def test_config_get_put_et_defauts(traiteur_conge):
    client = _client(traiteur_conge)
    resp = client.get('/api/conges/config/')
    assert resp.status_code == 200 and resp.data['mode_test'] is True and resp.data['fax'] == '213 (0) 41.68.01.03'
    corps = {k: v for k, v in resp.data.items() if k not in ('logo', 'id')}
    put = client.put('/api/conges/config/', {**corps, 'societe_nom': 'AUTRE'}, format='json')
    assert put.status_code == 200 and put.data['societe_nom'] == 'AUTRE'


def test_config_interim_exige_un_nom(traiteur_conge):
    client = _client(traiteur_conge)
    corps = {k: v for k, v in client.get('/api/conges/config/').data.items() if k not in ('logo', 'id')}
    resp = client.put('/api/conges/config/', {**corps, 'signataire_interim': True, 'signataire_interim_nom': ''}, format='json')
    assert resp.status_code == 400 and 'signataire_interim_nom' in resp.data


def test_config_apercu_live_ne_persiste_rien(traiteur_conge):
    from conges.models import CongeTemplateConfig
    resp = _client(traiteur_conge).post('/api/conges/config/apercu/', {'societe_nom': 'TEMPORAIRE'}, format='json')
    assert resp.status_code == 200 and resp.content.startswith(b'%PDF')
    assert CongeTemplateConfig.objects.get(pk=1).societe_nom == 'SOMIZ'


def test_config_stats_et_logo_interdits_au_demandeur_et_a_l_admin_non_charge(demandeur_conge, admin_user):
    for u in (demandeur_conge, admin_user):
        client = _client(u)
        for url in ('/api/conges/config/', '/api/conges/stats/', '/api/conges/config/logo-defaut/'):
            assert client.get(url).status_code == 403


# ─── Statistiques ───────────────────────────────────────────────────────────

def test_stats_structure_et_comptes(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp):
    _titre_valide(demandeur_conge, traiteur_conge, employee, solde_employe, motif_cp)
    resp = _client(traiteur_conge).get('/api/conges/stats/')
    assert resp.status_code == 200 and resp.data['total'] == 1
    assert resp.data['par_statut'] == [{'id': 'prete', 'nom': 'Prête', 'count': 1}]
    assert resp.data['par_gestionnaire'][0]['count'] == 1 and resp.data['par_employe'][0]['count'] == 1
    assert len(resp.data['evolution_mensuelle']) == 1 and resp.data['delai_moyen_jours'] is None


def test_stats_exclut_les_demandes_supprimees_par_le_demandeur(demandeur_conge, traiteur_conge, employee):
    ref = _ref_via_api(demandeur_conge, employee)
    _client(demandeur_conge).delete(f'/api/conges/demandes/{ref}/')
    assert _client(traiteur_conge).get('/api/conges/stats/').data['total'] == 0
```

- [ ] **Step 7: Run to verify they fail**

Run: `cd backend && pytest tests/test_conges_api.py -v -k "apercu or config or stats"`
Expected: FAIL (404).

- [ ] **Step 8: Add the views**

En tête de `backend/conges/views.py`, ajouter :

```python
from datetime import date, datetime, time
from types import SimpleNamespace

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import timezone as tz

from attestations.pdf import LOGO_PAR_DEFAUT
from .models import CongeTemplateConfig
from .pdf import build_conge_pdf
from .serializers import CongeTemplateConfigSerializer
```

et ajouter en fin de fichier :

```python
# ─── Titre PDF, configuration, statistiques ─────────────────────────────────

class CongeApercuView(ReferenceLookupMixin, generics.RetrieveAPIView):
    """GET demandes/<ref>/apercu/ — PDF du titre, traiteur uniquement, une fois
    la demande validée. La date imprimée (`date_document`) est figée au premier
    aperçu ; une réouverture un autre jour renvoie 409 tant que
    `?confirmer_date=1` est absent (même principe que l'attestation)."""
    permission_classes = [IsCongeManager]

    def get(self, request, *args, **kwargs):
        from employees.models import Contrat

        demande = self.get_object()
        if demande.statut in (DemandeConge.Statut.RECUE, DemandeConge.Statut.REJETEE):
            return Response(
                {'error': "Le titre n'est généré qu'après validation de la demande."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        today = tz.localdate()
        if demande.date_document and demande.date_document != today:
            if request.query_params.get('confirmer_date') != '1':
                return Response(
                    {'needs_confirmation': True, 'date_document': demande.date_document.isoformat(),
                     'date_nouvelle': today.isoformat()},
                    status=409,
                )
            demande.date_document = today
            demande.save(update_fields=['date_document'])
        elif not demande.date_document:
            demande.date_document = today
            demande.save(update_fields=['date_document'])

        config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        if demande.contrat_id:
            contrat_numero = demande.contrat.numero_contrat
        else:
            contrat_numero = Contrat.objects.filter(employee=demande.employee).order_by(
                '-date_debut', '-id',
            ).values_list('numero_contrat', flat=True).first() or ''

        pdf = build_conge_pdf(
            demande, config, demande.date_document, contrat_numero=contrat_numero,
            mention="(mode test)" if config.mode_test else '',
        )
        AuditLog.log(
            request, AuditLog.Action.APERCU_CONGE, target=demande,
            details={'reference': demande.reference, 'date_document': demande.date_document.isoformat()},
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'inline; filename="titre_conge_{demande.reference.replace("/", "-")}.pdf"'
        )
        return response


class CongeTemplateConfigView(generics.RetrieveUpdateAPIView):
    """GET/PUT/PATCH config/ — singleton, traiteur uniquement. Le logo s'envoie
    en PATCH multipart séparé (le PUT des champs texte l'exclut côté frontend)."""
    permission_classes = [IsCongeManager]
    serializer_class = CongeTemplateConfigSerializer

    def get_object(self):
        obj, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        return obj


class CongeTemplateConfigApercuView(APIView):
    """POST config/apercu/ — PDF d'aperçu à partir des valeurs du formulaire NON
    enregistrées, avec un titre fictif. Rien n'est persisté (instance mutée en
    mémoire seulement). Traiteur uniquement."""
    permission_classes = [IsCongeManager]

    def post(self, request):
        config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
        serializer = CongeTemplateConfigSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for champ, valeur in serializer.validated_data.items():
            if champ != 'logo':
                setattr(config, champ, valeur)
        interim = config.signataire_interim and bool(config.signataire_interim_nom.strip())
        exemple = SimpleNamespace(
            reference="00000/00", statut='prete', type_conge='CP',
            debit_reliquat=13, debit_annuel=0, debit_anticipe=0, nb_jours=13,
            employee=SimpleNamespace(
                matricule="000000", nom="EXEMPLE", prenom="Ali", date_embauche=date(2015, 1, 1),
                poste_id=1, poste=SimpleNamespace(nom="Agent Administratif"),
                direction=SimpleNamespace(nom="DIRECTION"), departement=SimpleNamespace(nom="DEPT"),
                service=SimpleNamespace(nom="SERVICE"),
            ),
            date_depart=date(2026, 11, 1), date_retour=date(2026, 11, 14), adresse_conge="ALGERIE",
            exercice="2025/2026", date_etablissement=date.today(),
            signataire_nom=config.signataire_interim_nom.strip() if interim else config.signataire_nom,
            signataire_titre=config.signataire_titre, signataire_interim=interim,
        )
        pdf = build_conge_pdf(
            exemple, config, date.today(), contrat_numero="0000/00",
            mention="(mode test — données fictives, non enregistrées)",
        )
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="apercu_titre_conge.pdf"'
        return response


class DefaultCongeLogoView(APIView):
    """GET config/logo-defaut/ — logo embarqué utilisé tant qu'aucun logo n'est
    téléversé (même fichier que les attestations)."""
    permission_classes = [IsCongeManager]

    def get(self, request):
        return HttpResponse(LOGO_PAR_DEFAUT.read_bytes(), content_type='image/png')


class CongeStatsView(APIView):
    """GET stats/?date_debut=&date_fin= — traiteur uniquement. Mêmes clés que
    /api/attestations/stats/ (consommées par StatDonutChart/StatAreaChart).
    Exclut les demandes supprimées par leur demandeur."""
    permission_classes = [IsCongeManager]

    def get(self, request):
        qs = DemandeConge.objects.filter(is_active=True)
        date_debut = request.query_params.get('date_debut')
        date_fin = request.query_params.get('date_fin')
        if date_debut:
            d = datetime.strptime(date_debut, '%Y-%m-%d').date()
            qs = qs.filter(created_at__gte=tz.make_aware(datetime.combine(d, time.min)))
        if date_fin:
            d = datetime.strptime(date_fin, '%Y-%m-%d').date()
            qs = qs.filter(created_at__lte=tz.make_aware(datetime.combine(d, time.max)))

        par_gestionnaire = list(
            qs.values('demandeur_id', 'demandeur__nom', 'demandeur__prenom').annotate(count=Count('id')).order_by('-count')
        )
        for ligne in par_gestionnaire:
            ligne['id'] = ligne.pop('demandeur_id')
            ligne['nom'] = f"{ligne.pop('demandeur__prenom')} {ligne.pop('demandeur__nom')}"

        par_employe = list(
            qs.values('employee_id', 'employee__nom', 'employee__prenom', 'employee__matricule')
              .annotate(count=Count('id')).order_by('-count')
        )
        for ligne in par_employe:
            ligne['id'] = ligne.pop('employee_id')
            ligne['nom'] = f"{ligne.pop('employee__prenom')} {ligne.pop('employee__nom')}"

        comptes = dict(qs.values('statut').annotate(count=Count('id')).values_list('statut', 'count'))
        libelles = dict(DemandeConge.Statut.choices)
        par_statut = [
            {'id': code, 'nom': libelles[code], 'count': comptes[code]}
            for code in libelles if comptes.get(code, 0) > 0
        ]

        duree = qs.filter(statut=DemandeConge.Statut.RECUPEREE).annotate(
            duree=ExpressionWrapper(
                Coalesce(F('date_recuperee'), F('updated_at')) - F('created_at'), output_field=DurationField(),
            )
        ).aggregate(moyenne=Avg('duree'))['moyenne']

        recues = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.annotate(mois=TruncMonth('created_at')).values('mois').annotate(count=Count('id'))
        }
        recuperees = {
            r['mois'].strftime('%Y-%m'): r['count']
            for r in qs.filter(statut=DemandeConge.Statut.RECUPEREE)
                       .annotate(mois=TruncMonth(Coalesce(F('date_recuperee'), F('updated_at'))))
                       .values('mois').annotate(count=Count('id'))
        }
        evolution = [
            {'mois': m, 'recues': recues.get(m, 0), 'recuperees': recuperees.get(m, 0)}
            for m in sorted(set(recues) | set(recuperees))
        ]
        return Response({
            'total': qs.count(), 'par_gestionnaire': par_gestionnaire, 'par_employe': par_employe,
            'par_statut': par_statut, 'evolution_mensuelle': evolution,
            'delai_moyen_jours': round(duree.total_seconds() / 86400, 1) if duree else None,
        })
```

Dans `urls.py`, importer `CongeApercuView, CongeStatsView, CongeTemplateConfigApercuView, CongeTemplateConfigView, DefaultCongeLogoView` et ajouter à `urlpatterns` :

```python
    path('demandes/<str:ref>/apercu/', CongeApercuView.as_view()),
    path('config/', CongeTemplateConfigView.as_view()),
    path('config/apercu/', CongeTemplateConfigApercuView.as_view()),
    path('config/logo-defaut/', DefaultCongeLogoView.as_view()),
    path('stats/', CongeStatsView.as_view()),
```

- [ ] **Step 9: Run the conges suites, then the full backend suite**

Run: `cd backend && pytest tests/test_conges_flag.py tests/test_conges_models.py tests/test_conges_services.py tests/test_conges_workflow.py tests/test_conges_commands.py tests/test_conges_api.py tests/test_conges_pdf.py -v`
Expected: PASS.
Run: `cd backend && pytest`
Expected: PASS sans régression (attestations, consultations, accounts, audit).

- [ ] **Step 10: Comparer le rendu au papier**

Générer un PDF d'exemple avec les valeurs de la photo du modèle (REF `04512/26`, matricule `009890`, contrat `020528`, `NACER SID AHMED`, `PEINTRE INDUSTRIEL`, `DAT / GMO`, `GL3/Z`, 13 j, 10/08/2026 → 23/08/2026, `ALGERIE`, `2024/2025`, établi le 09/08/2026) via `POST /api/conges/config/apercu/` ou un script `python manage.py shell`, l'ouvrir et le comparer au papier : ajuster **uniquement** les constantes `Y_*`/`X_COL2_*` de `conges/pdf.py` jusqu'à un alignement fidèle (colonnes des deux-points, position des sous-titre/signataire/pied). Re-lancer `pytest tests/test_conges_pdf.py`. Signaler à l'utilisateur ce qui n'a pas pu être vérifié visuellement.

- [ ] **Step 11: Commit**

```bash
git add backend/attestations/pdf.py backend/conges backend/tests/test_conges_api.py backend/tests/test_conges_pdf.py
git commit -m "feat(conges): titre de congé PDF calé sur le modèle officiel, aperçu à date figée, configuration, statistiques"
```

---

### Task 10: Documentation et vérification finale du backend

**Files:**
- Create: `docs/fonctionnel/conges.md`
- Modify: `CLAUDE.md`, `securite.md`, `docs/fonctionnel/notifications.md`

- [ ] **Step 1: Write `docs/fonctionnel/conges.md`**

Calquer la structure de `docs/fonctionnel/attestations.md` (en-tête « À lire avant de toucher à l'app conges… »). Sections : modèles et référence ; **soldes** (compartiments, solde actuel = reliquat + annuel, anticipé jamais compté, exercice 1er juillet → 30 juin, droit annuel 30 j paramétrable) ; **règles de débit** (reliquat avant annuel, excédent en anticipé plafonné, CE neutre, CS en retrait, débit à la validation) ; `MouvementConge` immuable et invariant « solde = somme des mouvements » (`verifier_soldes_conges`) ; **bascule du 1er juillet** (commande `basculer_exercice` + rattrapage automatique sous verrou, hypothèse « le reliquat reçoit l'annuel non pris », restitution après bascule via `exercice_debit`) ; workflow des statuts (Reçue/Prête/Récupérée/Rejetée/Annulée/Interrompue) ; annulation après signature (confirmation par saisie de la référence, restitution, titre conservé) ; interruption (date de rappel, recalcul, reliquat d'abord, une seule fois, pas d'annulation d'un titre interrompu en v1) ; chevauchement et période `[départ, retour[` ; signataire figé et intérim ; droits (`charge_conge` SUPERADMIN-only, `peut_demander_conge`, ADMIN ordinaire traiteur seul) ; **titre PDF** (modèle officiel du 2026-10-20, sous-titre selon compartiment/type, pas de cadre admin, date figée + 409, mode test, filigrane « ANNULE », `_draw_title(titre=…)` partagé avec `attestations/pdf.py`, constantes `Y_*` à affiner) ; configuration (`/parametres` → « Titre de congé », fax par défaut `01.03` propre aux congés) ; motifs par type ; statistiques ; audit (liste des 13 actions, ≤ 20 caractères) ; notifications ; scan (MIME python-magic, 20 Mo) ; URL par référence ; approches écartées (voir §12 de la spec).

- [ ] **Step 2: Update `CLAUDE.md`**

- **Rôles utilisateurs** : entrée « Demandes de congé (app `conges`) » (qui demande, qui traite, drapeaux, soldes, voir `docs/fonctionnel/conges.md`).
- **Routes principales** : `/conges`, `/conges/nouvelle`, `/conges/:ref` (+ onglet « Congés » de `/employees/:id`).
- **Index de la documentation par chantier** : `docs/fonctionnel/conges.md`.
- **Règles critiques** : (1) un solde de congé ne se modifie jamais directement, uniquement via `conges.services` (transaction + verrou + `MouvementConge`) ; (2) `charge_conge` n'est attribuable que par un SUPERADMIN ; (3) l'annulation d'un titre signé restitue les jours et se confirme par saisie de la référence ; (4) `AuditLog.action` est limité à 20 caractères.
- Section Tests : mettre à jour les décomptes.

- [ ] **Step 3: Update `securite.md`**

Nouveau point (numéro suivant, date 2026-10-20) : **Demandes de congé et soldes** — drapeau `charge_conge` réservé au SUPERADMIN et tracé ; séparation demandeur/traiteur ; champs du traiteur hors `fields` du serializer de création (testé) ; opérations de solde atomiques avec verrou et mouvements immuables (ni update ni delete) ; invariant vérifiable par commande ; annulation/interruption tracées avec avant/après ; scan validé par MIME réel et taille ; titre PDF généré côté serveur, date figée avec confirmation ; soft-delete de la demande ; scoping des soldes ; tests d'intégration sur vraies routes métier (`test_admin_non_charge_est_bloque_partout`, `test_config_stats_et_logo_interdits_au_demandeur_et_a_l_admin_non_charge`).

- [ ] **Step 4: Update `docs/fonctionnel/notifications.md`**

Ajouter les cinq nouvelles sources (`CONGE_NOUVELLE`, `CONGE_PRETE`, `CONGE_REJETEE`, `CONGE_ANNULEE`, `CONGE_INTERROMPUE`) avec destinataires et lien `/conges/<ref>`.

- [ ] **Step 5: Run the full verification**

Run: `cd backend && pytest`
Expected: PASS (toute la suite).
Run: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: « No changes detected » (aucune migration oubliée).
Run: `cd backend && python manage.py verifier_soldes_conges`
Expected: « Aucun écart… ».

- [ ] **Step 6: Commit**

```bash
git add docs/fonctionnel/conges.md CLAUDE.md securite.md docs/fonctionnel/notifications.md
git commit -m "docs(conges): fiche fonctionnelle, règles critiques, journal de sécurité et notifications"
```

---

## Self-Review

**Couverture de la spec (v2)**
- §2 soldes : compartiments, solde actuel, exercice, paramètre 30 j → Tasks 2, 4 ; mouvements immuables + invariant → Tasks 2, 4, 6 ; règles de débit (reliquat→annuel→anticipé, plafond, CE, CS) → Tasks 4-5 ; bascule du 1er juillet avec rattrapage et restitution après bascule → Tasks 4-6.
- §3 données de la demande (saisies demandeur / automatiques / traiteur, référence modifiable, signataire figé) → Tasks 2, 7 (`ValiderSerializer`), 5 (`valider_demande`).
- §4 workflow : validation, rejet (y compris d'un titre prêt), récupération, annulation après signature, interruption, chevauchement avec fin effective → Task 5 ; annulation du demandeur en soft-delete → Task 8 ; confirmation par saisie de la référence → Task 7 (`AnnulerSerializer`).
- §5 modèles et drapeaux → Tasks 1-2. §6 PDF calé sur le modèle (sous-titres, structure/affectation, signataire figé/intérim, filigrane, pas de cadre admin, fax 01.03) → Tasks 2 (fax) et 9. §7 API → Tasks 8-9. §9 audit (13 actions ≤ 20 caractères) et notifications → Tasks 3, 8. §10 tests → dans chaque tâche. §11 documentation → Task 10.
- Hors de ce plan (plan frontend à venir) : §8 (pages, panneau de validation, modales, onglet profil, navbar, palette, `/users`, configuration `/parametres`, motifs).

**Placeholders** : aucun « TODO » ni test à moitié rédigé.

**Cohérence des noms** : `charge_conge`/`peut_demander_conge`/`can_manage_conges`/`can_request_conges` ; statuts, types, natures et actions d'audit conformes à la section « Noms figés » ; `valider_demande/rejeter_demande/marquer_recuperee/annuler_demande/interrompre_demande` identiques entre `workflow.py`, vues et tests ; `verrouiller_solde/appliquer_mouvement/initialiser_solde/corriger_solde/ecarts_solde` identiques entre services, commandes, workflow et tests ; `_rendre(..., jours_cs=…)` utilisé de façon cohérente par `_rendre_tout` et `interrompre_demande` ; `exercice_debit` (solde) distinct de `exercice` (imprimé) partout ; `build_conge_pdf(titre, config, date_generation, contrat_numero='', mention='')` identique entre `pdf.py`, vues et tests.

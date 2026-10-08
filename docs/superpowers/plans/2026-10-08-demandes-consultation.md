# Demandes de consultation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Permettre à un GESTIONNAIRE/CONSULTANT de demander la consultation d'un dossier, document ou information archivé ; un traiteur valide, livre un scan via l'app pour une durée limitée, après quoi l'accès est coupé côté serveur.

**Architecture :** Nouvelle app Django `consultations` (modèles, services, vues DRF) calquée sur `attestations` (compteur de référence, notifications, audit), plus un module `filigrane` qui sert au demandeur une copie filigranée générée à la volée. Frontend React : 3 pages (`/consultations`, `/consultations/nouvelle`, `/consultations/:ref`) réutilisant `SecureDocViewer` en mode restreint.

**Tech Stack :** Django 5.2, DRF 3.17, PostgreSQL, python-magic, pypdf 6.19, reportlab 5.0, Pillow 12.3, React 19, Jest/RTL, pytest.

Spec : `docs/superpowers/specs/2026-10-08-demandes-consultation-design.md` (à relire avant de commencer).

## Global Constraints

- Branche de travail : `demande`. Commits fréquents, un par tâche, format `type: description`.
- Backend testé avec `cd backend && pytest <fichier> -v` ; suite complète avant le dernier commit (PostgreSQL + Redis actifs).
- Frontend : styles inline uniquement, couleurs via les tokens de `frontend/src/styles/theme.js` (jamais d'hex en dur dans un composant), `useConfirm()`/`usePrompt()` (jamais `window.confirm`/`window.prompt`), rafraîchissement après action = `fetch*(true)` silencieux.
- Valeurs d'`AuditLog.Action` limitées à **20 caractères** (`max_length=20`) : `CREATE_CONSULTATION`, `STATUT_CONSULTATION`, `UPLOAD_CONSULTATION`, `DELETE_CONSULTATION`, `VIEW_CONSULTATION`, `DL_CONSULTATION`, `PURGE_CONSULTATION`, `PROLONG_CONSULTATION`.
- Référence : `C-NNNNN/AA` ; dans l'URL, `/` devient `-` (`C-00001-26`), décodage par `rpartition('-')`.
- Fichiers livrés : MIME dans `settings.ALLOWED_MIME_TYPES`, 20 Mo max (`settings.MAX_UPLOAD_SIZE_MB`), nom de stockage en UUID, jamais de lien direct vers `media/`.
- Throttle de lecture : scope `consultation` (30/min) déjà défini.
- Messages de notification **neutres** : référence seulement, jamais de description ni de nom d'employé.
- « Expirée » n'est **jamais stocké** : dérivé de `date_echeance`.
- Un ADMIN sans `charge_consultation` n'a aucun accès ; SUPERADMIN est traiteur d'office ; seuls GESTIONNAIRE et CONSULTANT créent des demandes.
- Tiers sur un fichier ou une demande → **404** ; demandeur légitime hors validité → **403** explicite ; fichier purgé → **410**.
- Aucune suppression automatique : la purge est une commande manuelle (liste par défaut, `--confirmer` requis, sauvegarde préalable, chemin normalisé sous `MEDIA_ROOT/consultations/`).

---

## File Structure

**Créés (backend)**
- `backend/consultations/__init__.py`, `apps.py` — app.
- `backend/consultations/models.py` — `ConsultationReferenceCounter`, `DemandeConsultation`, `ConsultationFichier`.
- `backend/consultations/reference.py` — `generate_reference()`.
- `backend/consultations/permissions.py` — `CanAccessConsultations`, `IsConsultationManager`, `CanRequestConsultation`.
- `backend/consultations/serializers.py` — lecture + création.
- `backend/consultations/services.py` — `valider`, `rejeter`, `revoquer`, `prolonger`, `fichiers_purgeables`.
- `backend/consultations/filigrane.py` — `appliquer_filigrane(contenu, mime, texte)`.
- `backend/consultations/access.py` — `controler_acces(user, demande, fichier)`.
- `backend/consultations/notifications.py` — messages neutres.
- `backend/consultations/views.py`, `urls.py`.
- `backend/consultations/alerts.py` + `management/commands/notifier_echeances_consultation.py`, `purger_consultations.py`.
- Migrations des apps `consultations`, `accounts`, `audit`, `notifications`.
- Tests : `backend/tests/test_consultations_*.py`.

**Modifiés (backend)** : `accounts/models.py`, `accounts/admin_views.py`, `accounts/views.py`, `audit/models.py`, `notifications/models.py`, `config/settings.py`, `config/urls.py`, `tests/conftest.py`.

**Créés (frontend)** : `pages/Consultations.jsx`, `pages/ConsultationNouvelle.jsx`, `pages/ConsultationDetail.jsx`, `components/consultations/StatutConsultationBadge.jsx`, `components/consultations/TraiterPanel.jsx`, `utils/consultations.js`, tests `__tests__/Consultation*.test.jsx`.
**Modifiés (frontend)** : `App.js`, `components/Navbar.jsx`, `components/SecureDocViewer.jsx`, `pages/Users.jsx`.

**Docs** : `docs/fonctionnel/consultations.md`, `CLAUDE.md` (index), `securite.md`.

---

### Task 1 : drapeau `charge_consultation` sur `User`

**Files:**
- Modify: `backend/accounts/models.py` (après `charge_attestation`, ~l.77 ; propriété après `can_manage_attestations`, ~l.215)
- Modify: `backend/accounts/admin_views.py` (l.67, l.118-125, l.133, l.167-169)
- Modify: `backend/accounts/views.py` (l.155 et l.199)
- Create: `backend/accounts/migrations/00XX_user_charge_consultation.py` (générée)
- Test: `backend/tests/test_consultations_flag.py`

**Interfaces:**
- Produces: `User.charge_consultation: bool`, `User.can_manage_consultations -> bool` (SUPERADMIN, ou ADMIN avec le drapeau) ; `can_manage_consultations` exposé par `/api/auth/me/` et par la réponse de login ; `charge_consultation` lisible/modifiable via `/api/admin-users/`.

- [ ] **Step 1 : écrire les tests qui échouent**

```python
# backend/tests/test_consultations_flag.py
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db
User = get_user_model()


def _user(username, role, **extra):
    return User.objects.create_user(
        username=username, password="Passw0rd!Long1", nom="N", prenom="P",
        role=role, consent_loi1807_accepted_at=timezone.now(), **extra,
    )


def test_superadmin_est_toujours_traiteur():
    assert _user("sa1", "SUPERADMIN").can_manage_consultations is True


def test_admin_sans_drapeau_nest_pas_traiteur():
    assert _user("ad1", "ADMIN").can_manage_consultations is False


def test_admin_avec_drapeau_est_traiteur():
    assert _user("ad2", "ADMIN", charge_consultation=True).can_manage_consultations is True


def test_gestionnaire_avec_drapeau_nest_pas_traiteur():
    user = _user("ge1", "GESTIONNAIRE", charge_consultation=True)
    assert user.can_manage_consultations is False


def test_me_expose_can_manage_consultations():
    admin = _user("ad3", "ADMIN", charge_consultation=True)
    client = APIClient()
    client.force_authenticate(admin)
    resp = client.get('/api/auth/me/')
    assert resp.status_code == 200
    assert resp.data['can_manage_consultations'] is True


def test_admin_users_patch_accepte_le_drapeau_sur_un_admin():
    acteur = _user("sa2", "SUPERADMIN")
    cible = _user("ad4", "ADMIN")
    client = APIClient()
    client.force_authenticate(acteur)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_consultation': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_consultation is True


def test_admin_users_force_le_drapeau_a_false_hors_admin():
    acteur = _user("sa3", "SUPERADMIN")
    cible = _user("co1", "CONSULTANT")
    client = APIClient()
    client.force_authenticate(acteur)
    resp = client.patch(f'/api/admin-users/{cible.id}/', {'charge_consultation': True}, format='json')
    assert resp.status_code == 200, resp.data
    cible.refresh_from_db()
    assert cible.charge_consultation is False
```

- [ ] **Step 2 : lancer et constater l'échec**

Run: `cd backend && pytest tests/test_consultations_flag.py -v`
Expected: FAIL (`TypeError: ... unexpected keyword 'charge_consultation'` ou `AttributeError: can_manage_consultations`).

- [ ] **Step 3 : implémenter le modèle**

Dans `accounts/models.py`, juste après le champ `charge_attestation` :

```python
    # Même principe que charge_attestation, pour les demandes de consultation
    # de documents archivés (app `consultations`) : un ADMIN n'y a accès que
    # s'il est explicitement coché ; un SUPERADMIN y a toujours accès.
    charge_consultation = models.BooleanField(
        default=False, verbose_name="Chargé des consultations d'archives",
        help_text="Réservé aux comptes Administrateur : reçoit et traite les "
                   "demandes de consultation de documents archivés. Un "
                   "Super-administrateur y a toujours accès, quel que soit ce champ.",
    )
```

Juste après la propriété `can_manage_attestations` :

```python
    @property
    def can_manage_consultations(self):
        """True si ce compte traite les demandes de consultation d'archives
        (valide, livre, prolonge, révoque) — SUPERADMIN toujours, ADMIN
        seulement si charge_consultation est coché. Pendant côté traiteur de
        la création de demande, réservée à GESTIONNAIRE/CONSULTANT."""
        return self.is_superadmin or (self.role == self.Role.ADMIN and self.charge_consultation)
```

- [ ] **Step 4 : implémenter l'API d'administration des comptes**

Dans `accounts/admin_views.py` : ajouter `'charge_consultation'` à la liste `fields` de `UserSerializer` (l.67) et de `UserCreateSerializer` (l.133) ; dans `UserSerializer.validate` (l.118-125) :

```python
        role = attrs.get('role', self.instance.role if self.instance else None)
        if role != 'ADMIN':
            attrs['charge_attestation'] = False
            attrs['charge_consultation'] = False
        return attrs
```

Dans `UserCreateSerializer.validate` (l.167-169) :

```python
        if attrs.get('role') != 'ADMIN':
            attrs['charge_attestation'] = False
            attrs['charge_consultation'] = False
        return attrs
```

Dans `accounts/views.py`, aux deux endroits où `'can_manage_attestations': user.can_manage_attestations,` apparaît (l.155 et l.199), ajouter juste en dessous :

```python
                'can_manage_consultations': user.can_manage_consultations,
```

- [ ] **Step 5 : générer la migration**

Run: `cd backend && python manage.py makemigrations accounts -n user_charge_consultation`
Expected: création de `accounts/migrations/00XX_user_charge_consultation.py` avec un seul `AddField`.

- [ ] **Step 6 : relancer les tests**

Run: `cd backend && pytest tests/test_consultations_flag.py tests/test_accounts_roles.py tests/test_admin_users_visibility.py -v`
Expected: PASS (les tests existants ne régressent pas).

- [ ] **Step 7 : commit**

```bash
git add backend/accounts backend/tests/test_consultations_flag.py
git commit -m "feat(consultations): drapeau charge_consultation sur User"
```

---

### Task 2 : app `consultations`, modèles, référence, enums d'audit et de notification

**Files:**
- Create: `backend/consultations/__init__.py` (vide), `apps.py`, `models.py`, `reference.py`, `migrations/__init__.py`
- Modify: `backend/config/settings.py` (`LOCAL_APPS` ~l.63 ; constantes après `MAX_UPLOAD_PAGES` ~l.234)
- Modify: `backend/config/urls.py` (après la ligne `attestations/`)
- Modify: `backend/audit/models.py` (enum `Action`, après `DELETE_ATTESTATION`)
- Modify: `backend/notifications/models.py` (enum `Type`, avant `GENERIQUE`)
- Modify: `backend/tests/conftest.py` (fixtures partagées, en fin de fichier)
- Test: `backend/tests/test_consultations_models.py`

**Interfaces:**
- Produces : `DemandeConsultation` (champs et méthodes `est_active(now=None)`, `statut_effectif`, constante `EXPIREE`), `ConsultationFichier`, `generate_reference() -> "C-00001/26"`, fixtures `traiteur`, `superadmin_user`, `media_tmp`, `pdf_bytes`, `demande_en_cours`, `demande_validee`.

- [ ] **Step 1 : enregistrer l'app et les constantes**

`config/settings.py` : ajouter `'consultations',` après `'attestations',` dans `LOCAL_APPS`, et après `MAX_UPLOAD_PAGES` :

```python
# Demandes de consultation (app `consultations`)
CONSULTATION_DUREES_HEURES = [1, 24, 72, 168]       # presets proposés au traiteur
CONSULTATION_MAX_DUREE_TOTALE_HEURES = 720          # plafond cumulé validation + prolongations (30 j)
CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES = 24   # prolongation possible jusqu'à 24 h après l'échéance
```

`config/urls.py` : après la ligne `attestations/` :

```python
        path('consultations/', include('consultations.urls')),
```

Créer aussi `backend/consultations/urls.py` avec `urlpatterns = []` pour que le projet démarre (remplacé en Task 3).

- [ ] **Step 2 : enums d'audit et de notification**

`audit/models.py`, après `DELETE_ATTESTATION` :

```python
        CREATE_CONSULTATION = 'CREATE_CONSULTATION', 'Création demande consultation'
        STATUT_CONSULTATION = 'STATUT_CONSULTATION', 'Changement statut consultation'
        UPLOAD_CONSULTATION = 'UPLOAD_CONSULTATION', 'Livraison fichier consultation'
        DELETE_CONSULTATION = 'DELETE_CONSULTATION', 'Annulation demande consultation'
        VIEW_CONSULTATION = 'VIEW_CONSULTATION', 'Consultation fichier livré'
        DL_CONSULTATION = 'DL_CONSULTATION', 'Téléchargement fichier livré'
        PROLONG_CONSULTATION = 'PROLONG_CONSULTATION', 'Prolongation consultation'
        PURGE_CONSULTATION = 'PURGE_CONSULTATION', 'Purge fichier livré'
```

`notifications/models.py`, avant `GENERIQUE` :

```python
        CONSULTATION_NOUVELLE = 'CONSULTATION_NOUVELLE', "Nouvelle demande de consultation"
        CONSULTATION_VALIDEE = 'CONSULTATION_VALIDEE', "Consultation validée"
        CONSULTATION_REJETEE = 'CONSULTATION_REJETEE', "Consultation rejetée"
        CONSULTATION_REVOQUEE = 'CONSULTATION_REVOQUEE', "Consultation révoquée"
        CONSULTATION_PROLONGEE = 'CONSULTATION_PROLONGEE', "Consultation prolongée"
        CONSULTATION_ECHEANCE = 'CONSULTATION_ECHEANCE', "Consultation bientôt expirée"
```

- [ ] **Step 3 : écrire les tests de modèle (qui échouent)**

```python
# backend/tests/test_consultations_models.py
from datetime import timedelta

import pytest
from django.utils import timezone

from consultations.models import ConsultationReferenceCounter, DemandeConsultation
from consultations.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_reference_format_et_incrementation():
    ref1, ref2 = generate_reference(), generate_reference()
    prefix1, annee1 = ref1.split('/')
    prefix2, annee2 = ref2.split('/')
    assert prefix1.startswith('C-') and len(prefix1) == 7
    assert annee1 == annee2
    assert int(prefix2[2:]) == int(prefix1[2:]) + 1


def test_compteur_unique_par_annee():
    ConsultationReferenceCounter.objects.create(annee=2026, dernier_numero=3)
    with pytest.raises(Exception):
        ConsultationReferenceCounter.objects.create(annee=2026, dernier_numero=1)


def test_statut_par_defaut_en_cours(gestionnaire_user):
    d = DemandeConsultation.objects.create(
        reference='C-00001/26', type_demande='document', description='Contrat 2019',
        demandeur=gestionnaire_user,
    )
    assert d.statut == DemandeConsultation.Statut.EN_COURS
    assert d.statut_effectif == DemandeConsultation.Statut.EN_COURS
    assert d.est_active() is False


def test_validee_active_puis_expiree(demande_validee):
    assert demande_validee.est_active() is True
    assert demande_validee.statut_effectif == DemandeConsultation.Statut.VALIDEE
    demande_validee.date_echeance = timezone.now() - timedelta(seconds=1)
    assert demande_validee.est_active() is False
    assert demande_validee.statut_effectif == DemandeConsultation.EXPIREE


def test_echeance_exacte_est_expiree(demande_validee):
    maintenant = timezone.now()
    demande_validee.date_echeance = maintenant
    assert demande_validee.est_active(now=maintenant) is False
```

- [ ] **Step 4 : fixtures partagées** (ajouter à la fin de `backend/tests/conftest.py`)

```python
# ─── Consultations ──────────────────────────────────────────────────────────

@pytest.fixture
def media_tmp(settings, tmp_path):
    """Redirige MEDIA_ROOT vers un dossier temporaire : les tests de
    consultations écrivent de vrais fichiers et ne doivent jamais polluer
    backend/media/."""
    settings.MEDIA_ROOT = tmp_path
    return tmp_path


@pytest.fixture
def traiteur(db):
    """ADMIN chargé des consultations."""
    return User.objects.create_user(
        username="traiteur_conso", password="TraitPass123!",
        nom="Traiteur", prenom="Conso", role="ADMIN", charge_consultation=True,
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def superadmin_user(db):
    return User.objects.create_user(
        username="superadmin_conso", password="SuperPass123!",
        nom="Super", prenom="Admin", role="SUPERADMIN",
        consent_loi1807_accepted_at=timezone.now(),
    )


@pytest.fixture
def pdf_bytes():
    from io import BytesIO
    from reportlab.pdfgen import canvas
    buf = BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(100, 750, "Contenu confidentiel")
    c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture
def demande_en_cours(db, gestionnaire_user):
    from consultations.models import DemandeConsultation
    return DemandeConsultation.objects.create(
        reference='C-00001/26', type_demande='document',
        description='Contrat de 2019', demandeur=gestionnaire_user,
    )


@pytest.fixture
def demande_validee(db, gestionnaire_user, traiteur):
    from datetime import timedelta
    from consultations.models import DemandeConsultation
    maintenant = timezone.now()
    return DemandeConsultation.objects.create(
        reference='C-00002/26', type_demande='document',
        description='Contrat de 2019', demandeur=gestionnaire_user,
        statut=DemandeConsultation.Statut.VALIDEE, traite_par=traiteur,
        date_validation=maintenant,
        date_echeance=maintenant + timedelta(hours=24),
        date_echeance_initiale=maintenant + timedelta(hours=24),
    )
```

- [ ] **Step 5 : lancer pour constater l'échec**

Run: `cd backend && pytest tests/test_consultations_models.py -v`
Expected: FAIL (`ModuleNotFoundError: consultations.models`).

- [ ] **Step 6 : implémenter l'app**

`consultations/apps.py` :

```python
from django.apps import AppConfig


class ConsultationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'consultations'
    verbose_name = "Demandes de consultation"
```

`consultations/models.py` :

```python
import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def consultation_fichier_upload_path(instance, filename):
    """Nom de stockage régénéré en UUID (jamais le nom d'origine → pas de
    path traversal), rangé sous consultations/<id demande>/."""
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"consultations/{instance.demande_id}/{uuid.uuid4()}{ext}"


class ConsultationReferenceCounter(models.Model):
    """Compteur annuel des références C-NNNNN/AA, incrémenté sous verrou."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'consultation_reference_counters'


class DemandeConsultation(models.Model):
    class Type(models.TextChoices):
        DOSSIER = 'dossier', 'Dossier'
        DOCUMENT = 'document', 'Document'
        INFORMATION = 'information', 'Information'

    class Statut(models.TextChoices):
        EN_COURS = 'en_cours', 'En cours de validation'
        VALIDEE = 'validee', 'Validée'
        REJETEE = 'rejetee', 'Rejetée'
        REVOQUEE = 'revoquee', 'Révoquée'

    # Statut DÉRIVÉ (jamais stocké) : une demande validée dont l'échéance est
    # passée. Aucune tâche planifiée n'est nécessaire pour couper l'accès.
    EXPIREE = 'expiree'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    type_demande = models.CharField(max_length=20, choices=Type.choices)
    description = models.TextField()
    employee = models.ForeignKey(
        'employees.Employee', null=True, blank=True, on_delete=models.PROTECT,
        related_name='demandes_consultation',
    )
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.EN_COURS)
    motif_rejet = models.TextField(blank=True)
    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='demandes_consultation_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_consultation_traitees',
    )
    date_validation = models.DateTimeField(null=True, blank=True)
    date_echeance = models.DateTimeField(null=True, blank=True)
    date_echeance_initiale = models.DateTimeField(null=True, blank=True)
    date_revocation = models.DateTimeField(null=True, blank=True)
    nb_prolongations = models.PositiveSmallIntegerField(default=0)
    telechargement_autorise = models.BooleanField(default=False)
    # Rappels d'échéance déjà envoyés (réinitialisés par une prolongation).
    rappel_24h_envoye = models.BooleanField(default=False)
    rappel_1h_envoye = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_consultation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} ({self.statut})"

    def est_active(self, now=None):
        """Consultation actuellement ouverte : validée ET échéance non atteinte."""
        now = now or timezone.now()
        return (
            self.statut == self.Statut.VALIDEE
            and self.date_echeance is not None
            and now < self.date_echeance
        )

    @property
    def statut_effectif(self):
        if self.statut == self.Statut.VALIDEE and not self.est_active():
            return self.EXPIREE
        return self.statut


class ConsultationFichier(models.Model):
    """Fichier livré avec une demande. Stocké à part des documents RH
    (jamais un EmployeeDocument : sinon complétude, OCR et recherche plein
    texte le verraient)."""

    class Origine(models.TextChoices):
        SCAN_EXTERNE = 'scan_externe', 'Scan externe'
        COPIE_ARCHIVE = 'copie_archive', "Copie d'un document archivé"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    demande = models.ForeignKey(DemandeConsultation, on_delete=models.CASCADE, related_name='fichiers')
    file = models.FileField(upload_to=consultation_fichier_upload_path)
    file_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    file_size = models.PositiveIntegerField()
    origine = models.CharField(max_length=20, choices=Origine.choices)
    source_document_file = models.ForeignKey(
        'employees.EmployeeDocumentFile', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    # Renseigné par la commande de purge : la ligne reste (historique de la
    # demande), seul le contenu disparaît.
    supprime_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'consultation_fichiers'
        ordering = ['uploaded_at']

    def __str__(self):
        return f"{self.file_name} ({self.demande_id})"
```

`consultations/reference.py` :

```python
from django.db import transaction
from django.utils import timezone

from .models import ConsultationReferenceCounter


def generate_reference():
    """Prochaine référence C-NNNNN/AA de l'année civile, sous verrou."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = ConsultationReferenceCounter.objects.select_for_update().get_or_create(
            annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"C-{numero:05d}/{annee % 100:02d}"
```

- [ ] **Step 7 : migrations**

Run: `cd backend && python manage.py makemigrations consultations audit notifications`
Expected: `consultations/migrations/0001_initial.py`, une migration `audit` (AlterField `action`) et une `notifications` (AlterField `type`). Vérifier qu'aucun autre changement parasite n'est généré.

- [ ] **Step 8 : tests**

Run: `cd backend && pytest tests/test_consultations_models.py tests/test_audit_models.py tests/test_notifications.py -v`
Expected: PASS.

- [ ] **Step 9 : commit**

```bash
git add backend/consultations backend/config backend/audit backend/notifications backend/tests
git commit -m "feat(consultations): app, modèles, référence C-NNNNN/AA, enums audit et notifications"
```

---

### Task 3 : permissions, création, liste, détail, annulation

**Files:**
- Create: `backend/consultations/permissions.py`, `serializers.py`, `notifications.py`, `views.py` ; remplacer `urls.py`
- Test: `backend/tests/test_consultations_api.py`

**Interfaces:**
- Consumes: modèles et `generate_reference()` (Task 2), `User.can_manage_consultations` (Task 1).
- Produces:
  - `reference_depuis_slug(slug: str) -> str` (`"C-00001-26"` → `"C-00001/26"`), `slug_depuis_reference(ref: str) -> str`, `queryset_pour(user)` (traiteur : tout ; autre : `demandeur=user`), `ReferenceLookupMixin` dans `consultations/views.py`.
  - `DemandeConsultationSerializer` (lecture, champs calculés `statut_effectif`, `fichiers`).
  - `notifications.traiteurs_actifs()`, `notifier_nouvelle_demande(demande)`, `notifier_validee(demande, auteur)`, `notifier_rejetee(demande, auteur)`, `notifier_revoquee(demande, auteur)`, `notifier_prolongee(demande, auteur)`, `notifier_echeance(demande, libelle_seuil)`.
  - Endpoints : `GET/POST /api/consultations/demandes/`, `GET/DELETE /api/consultations/demandes/<slug>/`.

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_api.py
import pytest
from rest_framework.test import APIClient

from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


# ─── Création ───────────────────────────────────────────────────────────────

def test_gestionnaire_cree_une_demande_sans_employe(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'information', 'description': "Date d'embauche du directeur",
    }, format='json')
    assert resp.status_code == 201, resp.data
    assert resp.data['reference'].startswith('C-')
    assert resp.data['statut'] == 'en_cours'
    demande = DemandeConsultation.objects.get(id=resp.data['id'])
    assert demande.demandeur_id == gestionnaire_user.id


def test_consultant_peut_creer(consultant_user):
    resp = _client(consultant_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'Dossier complet',
    }, format='json')
    assert resp.status_code == 201, resp.data


def test_admin_et_superadmin_ne_peuvent_pas_creer(traiteur, superadmin_user, admin_user):
    for user in (traiteur, superadmin_user, admin_user):
        resp = _client(user).post('/api/consultations/demandes/', {
            'type_demande': 'dossier', 'description': 'x',
        }, format='json')
        assert resp.status_code == 403


def test_description_obligatoire(gestionnaire_user):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': '  ',
    }, format='json')
    assert resp.status_code == 400


def test_employe_hors_perimetre_refuse(gestionnaire_user, employee):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'x', 'employee': str(employee.id),
    }, format='json')
    assert resp.status_code == 400
    assert 'employee' in resp.data


def test_employe_dans_le_perimetre_accepte(gestionnaire_user, employee, direction):
    gestionnaire_user.scope_directions.add(direction)
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
        'type_demande': 'dossier', 'description': 'x', 'employee': str(employee.id),
    }, format='json')
    assert resp.status_code == 201, resp.data


# ─── Liste / détail ─────────────────────────────────────────────────────────

def test_demandeur_ne_voit_que_ses_demandes(gestionnaire_user, other_gestionnaire, demande_en_cours):
    DemandeConsultation.objects.create(
        reference='C-00009/26', type_demande='document', description='autre',
        demandeur=other_gestionnaire,
    )
    resp = _client(gestionnaire_user).get('/api/consultations/demandes/')
    assert resp.status_code == 200
    refs = [d['reference'] for d in resp.data['results']]
    assert refs == [demande_en_cours.reference]


def test_traiteur_voit_toutes_les_demandes(traiteur, demande_en_cours, other_gestionnaire):
    DemandeConsultation.objects.create(
        reference='C-00009/26', type_demande='document', description='autre',
        demandeur=other_gestionnaire,
    )
    resp = _client(traiteur).get('/api/consultations/demandes/')
    assert resp.status_code == 200
    assert resp.data['count'] == 2


def test_admin_sans_drapeau_est_bloque(admin_user, demande_en_cours):
    resp = _client(admin_user).get('/api/consultations/demandes/')
    assert resp.status_code == 403


def test_detail_dune_demande_dun_autre_est_404(other_gestionnaire, demande_en_cours):
    slug = demande_en_cours.reference.replace('/', '-')
    resp = _client(other_gestionnaire).get(f'/api/consultations/demandes/{slug}/')
    assert resp.status_code == 404


def test_detail_par_slug(gestionnaire_user, demande_en_cours):
    resp = _client(gestionnaire_user).get('/api/consultations/demandes/C-00001-26/')
    assert resp.status_code == 200
    assert resp.data['reference'] == 'C-00001/26'
    assert resp.data['statut_effectif'] == 'en_cours'


def test_filtre_statut_expiree(traiteur, demande_validee):
    from datetime import timedelta
    from django.utils import timezone
    demande_validee.date_echeance = timezone.now() - timedelta(minutes=1)
    demande_validee.save()
    resp = _client(traiteur).get('/api/consultations/demandes/?statut=expiree')
    assert resp.data['count'] == 1
    resp = _client(traiteur).get('/api/consultations/demandes/?statut=validee')
    assert resp.data['count'] == 0


# ─── Annulation ─────────────────────────────────────────────────────────────

def test_demandeur_annule_sa_demande_en_cours(gestionnaire_user, demande_en_cours):
    resp = _client(gestionnaire_user).delete('/api/consultations/demandes/C-00001-26/')
    assert resp.status_code == 204
    assert not DemandeConsultation.objects.filter(pk=demande_en_cours.pk).exists()


def test_annulation_refusee_si_validee(gestionnaire_user, demande_validee):
    resp = _client(gestionnaire_user).delete('/api/consultations/demandes/C-00002-26/')
    assert resp.status_code == 403
    assert DemandeConsultation.objects.filter(pk=demande_validee.pk).exists()


# ─── Notifications et audit ─────────────────────────────────────────────────

def test_creation_notifie_les_traiteurs_et_trace_audit(
    gestionnaire_user, traiteur, django_capture_on_commit_callbacks,
):
    from audit.models import AuditLog
    from notifications.models import Notification
    with django_capture_on_commit_callbacks(execute=True):
        resp = _client(gestionnaire_user).post('/api/consultations/demandes/', {
            'type_demande': 'document', 'description': 'Secret défense',
        }, format='json')
    assert resp.status_code == 201
    notif = Notification.objects.get(recipient=traiteur)
    assert notif.type == Notification.Type.CONSULTATION_NOUVELLE
    assert resp.data['reference'] in notif.message
    assert 'Secret' not in notif.message  # message neutre
    assert AuditLog.objects.filter(action='CREATE_CONSULTATION').count() == 1
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_api.py -v`
Expected: FAIL (404 sur les routes).

- [ ] **Step 3 : permissions**

```python
# backend/consultations/permissions.py
from rest_framework.permissions import BasePermission


def _compte_valide(user):
    return bool(
        user and user.is_authenticated and user.is_active
        and user.consent_loi1807_accepted_at
    )


class CanAccessConsultations(BasePermission):
    """Liste/détail : traiteurs (User.can_manage_consultations) et
    demandeurs (GESTIONNAIRE/CONSULTANT, qui ne voient que leurs demandes —
    filtrées par queryset_pour). Coupe tout le reste, dont un ADMIN sans
    charge_consultation."""
    message = "Vous n'avez pas accès aux demandes de consultation."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and (
            user.can_manage_consultations or user.role in ('GESTIONNAIRE', 'CONSULTANT')
        )


class IsConsultationManager(BasePermission):
    """Traitement (valider, rejeter, révoquer, prolonger) : SUPERADMIN, ou
    ADMIN chargé des consultations."""
    message = "Seuls les comptes chargés des consultations peuvent traiter cette demande."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.can_manage_consultations


class CanRequestConsultation(BasePermission):
    """Création/annulation : GESTIONNAIRE et CONSULTANT uniquement. Un
    traiteur ne crée pas de demande (séparation demandeur/validateur)."""
    message = "Seuls les comptes Gestionnaire et Consultant peuvent demander une consultation."

    def has_permission(self, request, view):
        user = request.user
        return _compte_valide(user) and user.role in ('GESTIONNAIRE', 'CONSULTANT')
```

- [ ] **Step 4 : notifications neutres**

```python
# backend/consultations/notifications.py
"""Notifications du workflow des consultations. Textes volontairement
neutres : seule la référence C-NNNNN/AA apparaît (jamais la description ni
le nom d'un employé)."""
from django.contrib.auth import get_user_model

from notifications.models import Notification
from notifications.service import notify


def _link(demande):
    return f"/consultations/{demande.reference.replace('/', '-')}"


def traiteurs_actifs():
    return [
        u for u in get_user_model().objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN'])
        if u.can_manage_consultations
    ]


def notifier_nouvelle_demande(demande):
    notify(
        [u for u in traiteurs_actifs() if u.pk != demande.demandeur_id],
        Notification.Type.CONSULTATION_NOUVELLE,
        f"Nouvelle demande de consultation {demande.reference}", _link(demande),
    )


def _vers_demandeur(demande, auteur, type_notif, message, severity=Notification.Severity.INFO):
    if auteur is not None and auteur.pk == demande.demandeur_id:
        return
    notify([demande.demandeur_id], type_notif, message, _link(demande), severity)


def notifier_validee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_VALIDEE,
        f"Votre demande de consultation {demande.reference} est validée",
    )


def notifier_rejetee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_REJETEE,
        f"Votre demande de consultation {demande.reference} a été rejetée",
        Notification.Severity.WARNING,
    )


def notifier_revoquee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_REVOQUEE,
        f"La consultation {demande.reference} a été révoquée",
        Notification.Severity.WARNING,
    )


def notifier_prolongee(demande, auteur=None):
    _vers_demandeur(
        demande, auteur, Notification.Type.CONSULTATION_PROLONGEE,
        f"La consultation {demande.reference} a été prolongée",
    )


def notifier_echeance(demande, libelle_seuil):
    """Rappel avant échéance, au demandeur et au traiteur de la demande."""
    destinataires = [demande.demandeur_id]
    if demande.traite_par_id:
        destinataires.append(demande.traite_par_id)
    notify(
        destinataires, Notification.Type.CONSULTATION_ECHEANCE,
        f"La consultation {demande.reference} expire dans moins de {libelle_seuil}",
        _link(demande), Notification.Severity.WARNING,
    )
```

- [ ] **Step 5 : serializers**

```python
# backend/consultations/serializers.py
from django.db import transaction
from rest_framework import serializers

from .models import DemandeConsultation
from .reference import generate_reference


class DemandeConsultationSerializer(serializers.ModelSerializer):
    statut_effectif = serializers.CharField(read_only=True)
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True, default=None)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    type_demande_label = serializers.CharField(source='get_type_demande_display', read_only=True)
    fichiers = serializers.SerializerMethodField()

    class Meta:
        model = DemandeConsultation
        fields = [
            'id', 'reference', 'type_demande', 'type_demande_label', 'description',
            'employee', 'employee_nom', 'employee_matricule',
            'statut', 'statut_effectif', 'motif_rejet',
            'demandeur', 'demandeur_nom', 'traite_par', 'traite_par_nom',
            'created_at', 'date_validation', 'date_echeance', 'date_echeance_initiale',
            'nb_prolongations', 'telechargement_autorise', 'fichiers',
        ]
        read_only_fields = fields

    def get_employee_nom(self, obj):
        return f"{obj.employee.prenom} {obj.employee.nom}" if obj.employee_id else None

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None

    def get_fichiers(self, obj):
        """Métadonnées des fichiers livrés. Le demandeur ne les voit que
        tant que la consultation est ouverte ; un traiteur les voit toujours."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not (user.can_manage_consultations or obj.est_active()):
            return []
        return [
            {
                'id': str(f.id), 'file_name': f.file_name, 'mime_type': f.mime_type,
                'file_size': f.file_size, 'origine': f.origine,
                'purge': f.supprime_le is not None,
            }
            for f in obj.fichiers.all()
        ]


class DemandeConsultationCreateSerializer(serializers.ModelSerializer):
    description = serializers.CharField(max_length=2000)

    class Meta:
        model = DemandeConsultation
        fields = ['id', 'type_demande', 'description', 'employee']
        read_only_fields = ['id']
        extra_kwargs = {'employee': {'required': False, 'allow_null': True}}

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Décrivez ce que vous souhaitez consulter.")
        return value

    def validate_employee(self, value):
        user = self.context['request'].user
        if value is not None and not user.can_access_employee(value):
            raise serializers.ValidationError("Cet employé n'est pas dans votre périmètre.")
        return value

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)
```

Note : `description` est déclaré `CharField` sans `allow_blank` ; un texte de seuls espaces est rogné par DRF (`trim_whitespace=True`) puis rejeté comme vide, ce qui donne bien un 400 — `validate_description` reste un filet de sécurité.

- [ ] **Step 6 : vues et routes**

```python
# backend/consultations/views.py
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import PermissionDenied

from audit.models import AuditLog
from .models import DemandeConsultation
from .notifications import notifier_nouvelle_demande
from .permissions import CanAccessConsultations, CanRequestConsultation
from .serializers import DemandeConsultationCreateSerializer, DemandeConsultationSerializer


def reference_depuis_slug(slug):
    """'C-00001-26' (URL) → 'C-00001/26' (référence). Le '/' est illisible
    dans un segment d'URL ; l'année est ce qui suit le dernier tiret."""
    base, _, annee = slug.rpartition('-')
    return f"{base}/{annee}"


def slug_depuis_reference(reference):
    return reference.replace('/', '-')


def queryset_pour(user):
    """Un traiteur voit tout ; tout autre compte ne voit que SES demandes."""
    qs = DemandeConsultation.objects.select_related(
        'employee', 'demandeur', 'traite_par',
    ).prefetch_related('fichiers')
    return qs if user.can_manage_consultations else qs.filter(demandeur=user)


class ReferenceLookupMixin:
    lookup_url_kwarg = 'ref'

    def get_object(self):
        reference = reference_depuis_slug(self.kwargs[self.lookup_url_kwarg])
        obj = get_object_or_404(queryset_pour(self.request.user), reference=reference)
        self.check_object_permissions(self.request, obj)
        return obj


class DemandeConsultationListCreateView(generics.ListCreateAPIView):
    """GET : traiteurs = toutes les demandes, demandeurs = les leurs.
    POST : GESTIONNAIRE/CONSULTANT."""

    def get_permissions(self):
        if self.request.method == 'POST':
            return [CanRequestConsultation()]
        return [CanAccessConsultations()]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return DemandeConsultationCreateSerializer
        return DemandeConsultationSerializer

    def get_queryset(self):
        user = self.request.user
        qs = queryset_pour(user)
        params = self.request.query_params

        q = params.get('q')
        if q:
            qs = qs.filter(
                Q(reference__icontains=q) | Q(description__icontains=q)
                | Q(demandeur__nom__icontains=q) | Q(demandeur__prenom__icontains=q)
            )
        type_demande = params.get('type_demande')
        if type_demande:
            qs = qs.filter(type_demande=type_demande)

        statut = params.get('statut')
        maintenant = timezone.now()
        if statut == DemandeConsultation.EXPIREE:
            qs = qs.filter(statut=DemandeConsultation.Statut.VALIDEE, date_echeance__lte=maintenant)
        elif statut == DemandeConsultation.Statut.VALIDEE:
            qs = qs.filter(statut=DemandeConsultation.Statut.VALIDEE, date_echeance__gt=maintenant)
        elif statut:
            qs = qs.filter(statut=statut)

        if params.get('pending') and user.can_manage_consultations:
            # Badge navbar traiteur : demandes pas encore prises en charge.
            qs = qs.filter(statut=DemandeConsultation.Statut.EN_COURS)
        return qs

    def perform_create(self, serializer):
        demande = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_CONSULTATION, target=demande,
            details={'type': demande.type_demande},
        )
        notifier_nouvelle_demande(demande)

    def create(self, request, *args, **kwargs):
        # Réponse en lecture complète (référence, statut...) plutôt que
        # l'écho des seuls champs d'écriture.
        response = super().create(request, *args, **kwargs)
        demande = DemandeConsultation.objects.get(pk=response.data['id'])
        response.data = DemandeConsultationSerializer(demande, context={'request': request}).data
        return response


class DemandeConsultationDetailView(ReferenceLookupMixin, generics.RetrieveDestroyAPIView):
    """GET : traiteur ou demandeur (les autres reçoivent 404, l'existence de
    la demande n'est pas révélée). DELETE : demandeur, tant que 'En cours'."""
    serializer_class = DemandeConsultationSerializer
    permission_classes = [CanAccessConsultations]

    def perform_destroy(self, instance):
        user = self.request.user
        if instance.demandeur_id != user.id or instance.statut != DemandeConsultation.Statut.EN_COURS:
            raise PermissionDenied(
                "Une demande ne peut être annulée que par son auteur, tant qu'elle est « En cours de validation »."
            )
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_CONSULTATION, target=instance,
            details={'type': instance.type_demande},
        )
        instance.delete()
```

```python
# backend/consultations/urls.py
from django.urls import path

from .views import DemandeConsultationDetailView, DemandeConsultationListCreateView

urlpatterns = [
    path('demandes/', DemandeConsultationListCreateView.as_view()),
    path('demandes/<str:ref>/', DemandeConsultationDetailView.as_view()),
]
```

- [ ] **Step 7 : tests**

Run: `cd backend && pytest tests/test_consultations_api.py tests/test_consultations_models.py -v`
Expected: PASS.

- [ ] **Step 8 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_api.py
git commit -m "feat(consultations): permissions, création, liste, détail, annulation, notifications"
```

---

### Task 4 : traitement — valider (livraison), rejeter, révoquer

**Files:**
- Create: `backend/consultations/services.py`
- Modify: `backend/consultations/views.py` (ajout des 3 vues), `backend/consultations/urls.py`
- Test: `backend/tests/test_consultations_traitement.py`

**Interfaces:**
- Consumes: `queryset_pour`, `reference_depuis_slug`, `ReferenceLookupMixin`, `DemandeConsultationSerializer` (Task 3) ; `notifier_validee/rejetee/revoquee` (Task 3) ; fixture `employee_document_file` (déjà dans `tests/conftest.py`).
- Produces:
  - `services.valider(demande, manager, *, duree_heures, telechargement_autorise, uploads, ids_copies, now=None) -> DemandeConsultation` (pose `demande._fichiers_livres`, liste des `ConsultationFichier` créés, pour l'audit).
  - `services.rejeter(demande, manager, motif) -> DemandeConsultation`
  - `services.revoquer(demande, manager, now=None) -> DemandeConsultation`
  - Endpoints `POST /api/consultations/demandes/<slug>/valider/` (multipart : `duree_heures`, `telechargement_autorise`, `fichiers` (0..n), `copier_fichiers` (0..n ids)), `.../rejeter/` (`motif_rejet`), `.../revoquer/`.
  - Toutes les erreurs métier sont des `rest_framework.exceptions.ValidationError` (400).

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_traitement.py
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from consultations.models import ConsultationFichier, DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]

URL_VALIDER = '/api/consultations/demandes/C-00001-26/valider/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _pdf(pdf_bytes, nom='scan.pdf'):
    return SimpleUploadedFile(nom, pdf_bytes, content_type='application/pdf')


def test_traiteur_valide_avec_un_scan(traiteur, demande_en_cours, pdf_bytes):
    avant = timezone.now()
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.VALIDEE
    assert demande_en_cours.traite_par_id == traiteur.id
    assert demande_en_cours.telechargement_autorise is False
    ecart = demande_en_cours.date_echeance - (avant + timedelta(hours=24))
    assert timedelta(0) <= ecart < timedelta(seconds=10)
    assert demande_en_cours.date_echeance == demande_en_cours.date_echeance_initiale
    fichier = ConsultationFichier.objects.get(demande=demande_en_cours)
    assert fichier.origine == ConsultationFichier.Origine.SCAN_EXTERNE
    assert fichier.mime_type == 'application/pdf'
    assert fichier.file_name == 'scan.pdf'
    assert 'scan' not in fichier.file.name  # nom de stockage en UUID


def test_validation_avec_telechargement_autorise(traiteur, demande_en_cours, pdf_bytes):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 1, 'telechargement_autorise': 'true', 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.telechargement_autorise is True


def test_validation_sans_fichier_refusee(traiteur, demande_en_cours):
    resp = _client(traiteur).post(URL_VALIDER, {'duree_heures': 24}, format='multipart')
    assert resp.status_code == 400
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.EN_COURS


def test_duree_hors_presets_refusee(traiteur, demande_en_cours, pdf_bytes):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 5, 'fichiers': [_pdf(pdf_bytes)],
    }, format='multipart')
    assert resp.status_code == 400
    assert 'duree_heures' in resp.data


def test_type_mime_interdit_refuse(traiteur, demande_en_cours):
    faux = SimpleUploadedFile('note.txt', b'juste du texte', content_type='text/plain')
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'fichiers': [faux],
    }, format='multipart')
    assert resp.status_code == 400
    assert not ConsultationFichier.objects.exists()


def test_validation_par_non_traiteur_refusee(
    admin_user, gestionnaire_user, demande_en_cours, pdf_bytes,
):
    for user in (admin_user, gestionnaire_user):
        resp = _client(user).post(URL_VALIDER, {
            'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
        }, format='multipart')
        assert resp.status_code == 403
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.EN_COURS


def test_double_validation_refusee(traiteur, demande_en_cours, pdf_bytes):
    client = _client(traiteur)
    client.post(URL_VALIDER, {'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)]}, format='multipart')
    resp = client.post(URL_VALIDER, {'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)]}, format='multipart')
    assert resp.status_code == 400


def test_validation_par_copie_dun_document_archive(
    traiteur, gestionnaire_user, employee, direction, employee_document_file,
):
    demande = DemandeConsultation.objects.create(
        reference='C-00005/26', type_demande='document', description='CV',
        demandeur=gestionnaire_user, employee=employee,
    )
    resp = _client(traiteur).post('/api/consultations/demandes/C-00005-26/valider/', {
        'duree_heures': 72, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 200, resp.data
    fichier = ConsultationFichier.objects.get(demande=demande)
    assert fichier.origine == ConsultationFichier.Origine.COPIE_ARCHIVE
    assert fichier.source_document_file_id == employee_document_file.id
    # Copie réelle : le fichier livré n'est PAS le fichier archivé.
    assert fichier.file.path != employee_document_file.file.path


def test_copie_refusee_sans_employe(traiteur, demande_en_cours, employee_document_file):
    resp = _client(traiteur).post(URL_VALIDER, {
        'duree_heures': 24, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 400


def test_copie_refusee_si_fichier_dun_autre_employe(
    traiteur, gestionnaire_user, employee_document_file, direction, departement,
    service, poste, type_contrat, categorie, admin_user,
):
    from employees.models import Employee
    autre = Employee.objects.create(
        matricule="EMP-777", nom="Autre", prenom="Personne", direction=direction,
        departement=departement, service=service, poste=poste,
        type_contrat=type_contrat, categorie=categorie, created_by=admin_user,
    )
    DemandeConsultation.objects.create(
        reference='C-00006/26', type_demande='document', description='x',
        demandeur=gestionnaire_user, employee=autre,
    )
    resp = _client(traiteur).post('/api/consultations/demandes/C-00006-26/valider/', {
        'duree_heures': 24, 'copier_fichiers': [str(employee_document_file.id)],
    }, format='multipart')
    assert resp.status_code == 400


def test_validation_trace_audit_et_notifie(
    traiteur, gestionnaire_user, demande_en_cours, pdf_bytes, django_capture_on_commit_callbacks,
):
    from audit.models import AuditLog
    from notifications.models import Notification
    with django_capture_on_commit_callbacks(execute=True):
        _client(traiteur).post(URL_VALIDER, {
            'duree_heures': 24, 'fichiers': [_pdf(pdf_bytes)],
        }, format='multipart')
    assert AuditLog.objects.filter(action='STATUT_CONSULTATION').count() == 1
    assert AuditLog.objects.filter(action='UPLOAD_CONSULTATION').count() == 1
    notif = Notification.objects.get(recipient=gestionnaire_user)
    assert notif.type == Notification.Type.CONSULTATION_VALIDEE
    assert demande_en_cours.reference in notif.message


# ─── Rejet ──────────────────────────────────────────────────────────────────

def test_rejet_exige_un_motif(traiteur, demande_en_cours):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/rejeter/', {'motif_rejet': '  '}, format='json',
    )
    assert resp.status_code == 400


def test_rejet_ok(traiteur, demande_en_cours):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/rejeter/', {'motif_rejet': 'Hors périmètre'}, format='json',
    )
    assert resp.status_code == 200, resp.data
    demande_en_cours.refresh_from_db()
    assert demande_en_cours.statut == DemandeConsultation.Statut.REJETEE
    assert demande_en_cours.motif_rejet == 'Hors périmètre'


def test_rejet_impossible_si_deja_validee(traiteur, demande_validee):
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00002-26/rejeter/', {'motif_rejet': 'x'}, format='json',
    )
    assert resp.status_code == 400


# ─── Révocation ─────────────────────────────────────────────────────────────

def test_revocation_ok(traiteur, demande_validee):
    resp = _client(traiteur).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.statut == DemandeConsultation.Statut.REVOQUEE
    assert demande_validee.date_revocation is not None
    assert demande_validee.est_active() is False


def test_revocation_impossible_si_en_cours(traiteur, demande_en_cours):
    resp = _client(traiteur).post('/api/consultations/demandes/C-00001-26/revoquer/', {}, format='json')
    assert resp.status_code == 400


def test_revocation_impossible_si_deja_expiree(traiteur, demande_validee):
    demande_validee.date_echeance = timezone.now() - timedelta(minutes=1)
    demande_validee.save()
    resp = _client(traiteur).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 400


def test_revocation_par_gestionnaire_refusee(gestionnaire_user, demande_validee):
    resp = _client(gestionnaire_user).post('/api/consultations/demandes/C-00002-26/revoquer/', {}, format='json')
    assert resp.status_code == 403
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_traitement.py -v`
Expected: FAIL (404 : routes inexistantes).

- [ ] **Step 3 : services**

```python
# backend/consultations/services.py
"""Règles métier du traitement des demandes de consultation. Les vues
restent minces : toute validation et tout changement d'état passent ici,
et chaque refus est une ValidationError DRF (400)."""
import os
from datetime import timedelta

import magic
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from employees.models import EmployeeDocumentFile
from .models import ConsultationFichier, DemandeConsultation

Statut = DemandeConsultation.Statut


def _verrouiller(demande):
    return DemandeConsultation.objects.select_for_update().get(pk=demande.pk)


def _verifier_traiteur_distinct(demande, manager):
    """Séparation demandeur/validateur : jamais le même compte."""
    if demande.demandeur_id == manager.id:
        raise ValidationError("Le traiteur ne peut pas traiter sa propre demande.")


def _valider_duree(duree_heures):
    try:
        duree = int(duree_heures)
    except (TypeError, ValueError):
        raise ValidationError({'duree_heures': "Durée invalide."})
    if duree not in settings.CONSULTATION_DUREES_HEURES:
        raise ValidationError({
            'duree_heures': f"Durée non autorisée (choix : {settings.CONSULTATION_DUREES_HEURES}).",
        })
    return duree


def _lire_upload(fichier):
    """Contrôle taille + MIME réel (python-magic, pas l'extension ni le
    content-type déclaré) et renvoie (contenu, mime)."""
    if fichier.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise ValidationError({'fichiers': f"« {fichier.name} » dépasse {settings.MAX_UPLOAD_SIZE_MB} Mo."})
    contenu = fichier.read()
    mime = magic.from_buffer(contenu[:2048], mime=True)
    if mime not in settings.ALLOWED_MIME_TYPES:
        raise ValidationError({'fichiers': f"Type de fichier non autorisé : {mime}."})
    return contenu, mime


def _creer_fichier(demande, manager, *, contenu, mime, nom, origine, source=None):
    nom_affiche = os.path.basename(nom)[:255]
    fichier = ConsultationFichier(
        demande=demande, file_name=nom_affiche, mime_type=mime, file_size=len(contenu),
        origine=origine, source_document_file=source, uploaded_by=manager,
    )
    fichier.file.save(nom_affiche, ContentFile(contenu), save=False)
    fichier.save()
    return fichier


def _charger_copies(demande, ids_copies):
    """Lit le contenu des documents archivés à copier. Chaque id doit
    désigner un fichier actif de l'employé de la demande."""
    if not ids_copies:
        return []
    if demande.employee_id is None:
        raise ValidationError({'copier_fichiers': "Aucun employé n'est associé à cette demande."})
    ids = set(map(str, ids_copies))
    sources = list(
        EmployeeDocumentFile.objects.filter(
            pk__in=ids, is_active=True, document__employee_id=demande.employee_id,
        )
    )
    if len(sources) != len(ids):
        raise ValidationError({'copier_fichiers': "Fichier introuvable pour cet employé."})
    copies = []
    for source in sources:
        if not source.file or not os.path.exists(source.file.path):
            raise ValidationError({'copier_fichiers': f"Fichier source introuvable : {source.file_name}."})
        with open(source.file.path, 'rb') as fh:
            copies.append((fh.read(), source.mime_type or 'application/pdf', source.file_name or 'document', source))
    return copies


@transaction.atomic
def valider(demande, manager, *, duree_heures, telechargement_autorise, uploads, ids_copies, now=None):
    """Livre les fichiers et ouvre la consultation pour `duree_heures`."""
    demande = _verrouiller(demande)
    if demande.statut != Statut.EN_COURS:
        raise ValidationError("Seule une demande « En cours de validation » peut être validée.")
    _verifier_traiteur_distinct(demande, manager)
    duree = _valider_duree(duree_heures)
    if not uploads and not ids_copies:
        raise ValidationError({'fichiers': "Joignez au moins un fichier."})

    prepares = [(*_lire_upload(u), u.name) for u in uploads]
    copies = _charger_copies(demande, ids_copies)

    now = now or timezone.now()
    cree = []
    for contenu, mime, nom in prepares:
        cree.append(_creer_fichier(
            demande, manager, contenu=contenu, mime=mime, nom=nom,
            origine=ConsultationFichier.Origine.SCAN_EXTERNE,
        ))
    for contenu, mime, nom, source in copies:
        cree.append(_creer_fichier(
            demande, manager, contenu=contenu, mime=mime, nom=nom,
            origine=ConsultationFichier.Origine.COPIE_ARCHIVE, source=source,
        ))

    echeance = now + timedelta(hours=duree)
    demande.statut = Statut.VALIDEE
    demande.traite_par = manager
    demande.date_validation = now
    demande.date_echeance = echeance
    demande.date_echeance_initiale = echeance
    demande.telechargement_autorise = bool(telechargement_autorise)
    demande.save()
    demande._fichiers_livres = cree  # pour l'audit côté vue
    return demande


@transaction.atomic
def rejeter(demande, manager, motif):
    demande = _verrouiller(demande)
    if demande.statut != Statut.EN_COURS:
        raise ValidationError("Seule une demande « En cours de validation » peut être rejetée.")
    _verifier_traiteur_distinct(demande, manager)
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError({'motif_rejet': "Le motif du rejet est obligatoire."})
    demande.statut = Statut.REJETEE
    demande.motif_rejet = motif
    demande.traite_par = manager
    demande.save()
    return demande


@transaction.atomic
def revoquer(demande, manager, now=None):
    """Coupe l'accès avant l'échéance. Sans objet si la consultation est
    déjà expirée ou n'a jamais été ouverte."""
    demande = _verrouiller(demande)
    now = now or timezone.now()
    if not demande.est_active(now):
        raise ValidationError("Seule une consultation en cours de validité peut être révoquée.")
    demande.statut = Statut.REVOQUEE
    demande.date_revocation = now
    demande.save()
    return demande
```

Limite connue (à garder en tête, pas à corriger ici) : si l'enregistrement en base échoue après l'écriture d'un fichier sur disque, le fichier reste orphelin dans `media/consultations/<id>/`. Les orphelins ne sont jamais référencés ni servis ; ils ne doivent surtout **pas** être supprimés par un script ad hoc (voir l'incident du 2026-07-22).

- [ ] **Step 4 : vues de traitement** (ajouter à `consultations/views.py`)

Imports à ajouter en tête de fichier :

```python
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .notifications import notifier_rejetee, notifier_revoquee, notifier_validee
from .permissions import IsConsultationManager
```

Code à ajouter en fin de fichier :

```python
def _liste_form(request, cle):
    """Valeurs multiples d'un champ de formulaire multipart (liste vide si
    la requête est du JSON ou si le champ est absent)."""
    data = request.data
    if hasattr(data, 'getlist'):
        return [v for v in data.getlist(cle) if v not in ('', None)]
    valeur = data.get(cle) or []
    return valeur if isinstance(valeur, list) else [valeur]


def _vrai(valeur):
    return str(valeur).strip().lower() in ('1', 'true', 'on', 'oui')


class _TraitementView(ReferenceLookupMixin, APIView):
    permission_classes = [IsConsultationManager]

    def _reponse(self, demande):
        demande = queryset_pour(self.request.user).get(pk=demande.pk)
        return Response(DemandeConsultationSerializer(demande, context={'request': self.request}).data)


class DemandeConsultationValiderView(_TraitementView):
    """POST multipart : duree_heures, telechargement_autorise, fichiers[],
    copier_fichiers[] (ids de EmployeeDocumentFile de l'employé)."""

    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.valider(
            demande, request.user,
            duree_heures=request.data.get('duree_heures'),
            telechargement_autorise=_vrai(request.data.get('telechargement_autorise', False)),
            uploads=request.FILES.getlist('fichiers'),
            ids_copies=_liste_form(request, 'copier_fichiers'),
        )
        for fichier in demande._fichiers_livres:
            AuditLog.log(
                request, AuditLog.Action.UPLOAD_CONSULTATION, target=demande,
                details={'reference': demande.reference, 'fichier': fichier.file_name, 'origine': fichier.origine},
            )
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={
                'de': ancien, 'vers': demande.statut,
                'echeance': demande.date_echeance.isoformat(),
                'telechargement_autorise': demande.telechargement_autorise,
            },
        )
        notifier_validee(demande, request.user)
        return self._reponse(demande)


class DemandeConsultationRejeterView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.rejeter(demande, request.user, request.data.get('motif_rejet'))
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={'de': ancien, 'vers': demande.statut, 'motif_rejet': demande.motif_rejet},
        )
        notifier_rejetee(demande, request.user)
        return self._reponse(demande)


class DemandeConsultationRevoquerView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        ancien = demande.statut
        demande = services.revoquer(demande, request.user)
        AuditLog.log(
            request, AuditLog.Action.STATUT_CONSULTATION, target=demande,
            details={'de': ancien, 'vers': demande.statut},
        )
        notifier_revoquee(demande, request.user)
        return self._reponse(demande)
```

`consultations/urls.py` : importer les trois vues et ajouter :

```python
    path('demandes/<str:ref>/valider/', DemandeConsultationValiderView.as_view()),
    path('demandes/<str:ref>/rejeter/', DemandeConsultationRejeterView.as_view()),
    path('demandes/<str:ref>/revoquer/', DemandeConsultationRevoquerView.as_view()),
```

- [ ] **Step 5 : tests**

Run: `cd backend && pytest tests/test_consultations_traitement.py tests/test_consultations_api.py -v`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_traitement.py
git commit -m "feat(consultations): validation avec livraison de fichiers, rejet, révocation"
```

---

### Task 5 : filigrane incrusté (PDF et images)

**Files:**
- Create: `backend/consultations/filigrane.py`
- Test: `backend/tests/test_consultations_filigrane.py`

**Interfaces:**
- Produces: `appliquer_filigrane(contenu: bytes, mime: str, texte: str) -> tuple[bytes, str]` — renvoie `(octets_filigranés, mime_de_sortie)`. PDF → `application/pdf` ; JPEG → `image/jpeg` ; PNG et TIFF → `image/png`. Lève `ValueError` pour un MIME non géré.

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_filigrane.py
from io import BytesIO

import pytest
from PIL import Image
from pypdf import PdfReader

from consultations.filigrane import appliquer_filigrane

TEXTE = "Zoheir F. — C-00001/26 — 08/10/2026 11:00"


def _png_blanc(taille=(400, 300)):
    buf = BytesIO()
    Image.new('RGB', taille, 'white').save(buf, format='PNG')
    return buf.getvalue()


def test_pdf_filigrane_contient_le_texte(pdf_bytes):
    sortie, mime = appliquer_filigrane(pdf_bytes, 'application/pdf', TEXTE)
    assert mime == 'application/pdf'
    lecteur = PdfReader(BytesIO(sortie))
    assert len(lecteur.pages) == 1
    texte = lecteur.pages[0].extract_text()
    assert 'Contenu confidentiel' in texte      # contenu d'origine conservé
    assert 'C-00001/26' in texte                # filigrane présent


def test_pdf_multipage_filigrane_sur_chaque_page():
    from reportlab.pdfgen import canvas
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for i in range(3):
        c.drawString(100, 750, f"Page {i + 1}")
        c.showPage()
    c.save()
    sortie, _ = appliquer_filigrane(buf.getvalue(), 'application/pdf', TEXTE)
    lecteur = PdfReader(BytesIO(sortie))
    assert len(lecteur.pages) == 3
    for page in lecteur.pages:
        assert 'C-00001/26' in page.extract_text()


def test_image_png_est_modifiee_et_reste_un_png():
    original = _png_blanc()
    sortie, mime = appliquer_filigrane(original, 'image/png', TEXTE)
    assert mime == 'image/png'
    assert sortie != original
    image = Image.open(BytesIO(sortie)).convert('RGB')
    assert image.size == (400, 300)
    assert image.getcolors(maxcolors=100000) != [(400 * 300, (255, 255, 255))]  # plus unie


def test_image_jpeg_reste_un_jpeg():
    buf = BytesIO()
    Image.new('RGB', (300, 200), 'white').save(buf, format='JPEG')
    sortie, mime = appliquer_filigrane(buf.getvalue(), 'image/jpeg', TEXTE)
    assert mime == 'image/jpeg'
    assert Image.open(BytesIO(sortie)).format == 'JPEG'


def test_tiff_est_converti_en_png():
    buf = BytesIO()
    Image.new('RGB', (300, 200), 'white').save(buf, format='TIFF')
    sortie, mime = appliquer_filigrane(buf.getvalue(), 'image/tiff', TEXTE)
    assert mime == 'image/png'
    assert Image.open(BytesIO(sortie)).format == 'PNG'


def test_mime_non_gere_leve_une_erreur():
    with pytest.raises(ValueError):
        appliquer_filigrane(b'abc', 'text/plain', TEXTE)
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_filigrane.py -v`
Expected: FAIL (`ModuleNotFoundError: consultations.filigrane`).

- [ ] **Step 3 : implémentation**

```python
# backend/consultations/filigrane.py
"""Filigrane incrusté dans la copie servie au demandeur : nom + référence +
date/heure, en diagonale répétée sur toute la page. Calculé à la volée (rien
n'est stocké) — l'original livré n'est jamais servi tel quel au demandeur,
ce qui rend toute fuite attribuable même après capture ou téléchargement."""
import math
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

ANGLE_DEGRES = 35
ALPHA_PDF = 0.16
ALPHA_IMAGE = 55  # sur 255


def _filigrane_pdf(contenu, texte):
    lecteur = PdfReader(BytesIO(contenu))
    ecrivain = PdfWriter()
    for page in lecteur.pages:
        largeur = float(page.mediabox.width)
        hauteur = float(page.mediabox.height)
        calque = BytesIO()
        c = canvas.Canvas(calque, pagesize=(largeur, hauteur))
        c.setFillAlpha(ALPHA_PDF)
        c.setFillGray(0.2)
        taille = max(10, min(largeur, hauteur) / 38)
        c.setFont('Helvetica-Bold', taille)
        pas_y = taille * 7
        pas_x = c.stringWidth(texte, 'Helvetica-Bold', taille) + taille * 3
        c.saveState()
        c.translate(largeur / 2, hauteur / 2)
        c.rotate(ANGLE_DEGRES)
        diag = math.hypot(largeur, hauteur)
        y = -diag
        ligne = 0
        while y < diag:
            x = -diag + (pas_x / 2 if ligne % 2 else 0)
            while x < diag:
                c.drawString(x, y, texte)
                x += pas_x
            y += pas_y
            ligne += 1
        c.restoreState()
        c.showPage()
        c.save()
        calque.seek(0)
        page.merge_page(PdfReader(calque).pages[0])
        ecrivain.add_page(page)
    sortie = BytesIO()
    ecrivain.write(sortie)
    return sortie.getvalue()


def _police(taille):
    try:
        return ImageFont.load_default(size=taille)
    except TypeError:  # Pillow < 10.1 : pas de paramètre size
        return ImageFont.load_default()


def _filigrane_image(contenu, mime, texte):
    image = Image.open(BytesIO(contenu)).convert('RGBA')
    largeur, hauteur = image.size
    taille = max(12, min(largeur, hauteur) // 28)
    police = _police(taille)
    calque = Image.new('RGBA', (largeur, hauteur), (0, 0, 0, 0))
    dessin = ImageDraw.Draw(calque)
    boite = dessin.textbbox((0, 0), texte, font=police)
    pas_x = (boite[2] - boite[0]) + taille * 3
    pas_y = taille * 6
    diag = int(math.hypot(largeur, hauteur))
    grand = Image.new('RGBA', (diag * 2, diag * 2), (0, 0, 0, 0))
    dessin_grand = ImageDraw.Draw(grand)
    ligne = 0
    for y in range(0, diag * 2, pas_y):
        decalage = pas_x // 2 if ligne % 2 else 0
        for x in range(-pas_x, diag * 2, pas_x):
            dessin_grand.text((x + decalage, y), texte, font=police, fill=(40, 40, 40, ALPHA_IMAGE))
        ligne += 1
    grand = grand.rotate(ANGLE_DEGRES, resample=Image.BICUBIC)
    gauche = (grand.width - largeur) // 2
    haut = (grand.height - hauteur) // 2
    calque.alpha_composite(grand.crop((gauche, haut, gauche + largeur, haut + hauteur)))
    resultat = Image.alpha_composite(image, calque)
    sortie = BytesIO()
    if mime == 'image/jpeg':
        resultat.convert('RGB').save(sortie, format='JPEG', quality=88)
        return sortie.getvalue(), 'image/jpeg'
    resultat.save(sortie, format='PNG')
    return sortie.getvalue(), 'image/png'


def appliquer_filigrane(contenu, mime, texte):
    """(octets filigranés, mime de sortie). TIFF et PNG sortent en PNG (un
    navigateur n'affiche pas le TIFF)."""
    if mime == 'application/pdf':
        return _filigrane_pdf(contenu, texte), 'application/pdf'
    if mime in ('image/jpeg', 'image/png', 'image/tiff'):
        return _filigrane_image(contenu, mime, texte)
    raise ValueError(f"Type non géré pour le filigrane : {mime}")
```

- [ ] **Step 4 : tests**

Run: `cd backend && pytest tests/test_consultations_filigrane.py -v`
Expected: PASS. Si `extract_text()` ne retrouve pas le filigrane (texte pivoté), remplacer l'assertion par une vérification que le contenu d'origine reste extrait **et** que la sortie diffère de l'entrée ; noter la raison dans un commentaire du test, ne jamais assouplir sans le dire.

- [ ] **Step 5 : mesure de performance** (critère de la spec : PDF de 50 pages)

```bash
cd backend && python - <<'PY'
import time
from io import BytesIO
from reportlab.pdfgen import canvas
from consultations.filigrane import appliquer_filigrane
buf = BytesIO(); c = canvas.Canvas(buf)
for i in range(50):
    c.drawString(100, 750, f"Page {i}"); c.showPage()
c.save()
t = time.perf_counter()
sortie, _ = appliquer_filigrane(buf.getvalue(), 'application/pdf', "Zoheir F. — C-00001/26 — 08/10/2026 11:00")
print(f"50 pages : {time.perf_counter() - t:.2f}s, {len(sortie)} octets")
PY
```
Expected: noter la durée dans `docs/fonctionnel/consultations.md` (Task 12). Si elle dépasse 5 s, ajouter un cache mémoire à courte durée de vie par `(fichier.id, texte)` avant de poursuivre, et en discuter avec l'utilisateur.

- [ ] **Step 6 : commit**

```bash
git add backend/consultations/filigrane.py backend/tests/test_consultations_filigrane.py
git commit -m "feat(consultations): filigrane incrusté PDF et images"
```

---

### Task 6 : lecture sécurisée (`voir`) et téléchargement (`telecharger`)

**Files:**
- Create: `backend/consultations/access.py`
- Modify: `backend/consultations/views.py` (2 vues), `backend/consultations/urls.py`
- Test: `backend/tests/test_consultations_acces.py`

**Interfaces:**
- Consumes: `appliquer_filigrane` (Task 5), `services.valider` (Task 4), `reference_depuis_slug` (Task 3).
- Produces:
  - `access.controler_acces(user, demande, fichier, now=None) -> None` ; lève `Http404` (tiers), `PermissionDenied` (demandeur hors validité, message explicite) ou `access.Gone` (HTTP 410, fichier purgé).
  - `GET /api/consultations/demandes/<slug>/fichiers/<uuid>/voir/` (inline) et `.../telecharger/` (attachment).
  - Règle de contenu : un **traiteur** reçoit l'original en flux ; un **demandeur** reçoit **toujours** une copie filigranée générée à la volée. Si le filigrane échoue, la réponse est **422** et rien n'est servi (échec fermé).

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_acces.py
from datetime import timedelta
from io import BytesIO

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.test import APIClient

from audit.models import AuditLog
from consultations import services
from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


@pytest.fixture(autouse=True)
def _vider_throttle():
    """Le throttle 'consultation' (30/min) vit dans le cache partagé : sans
    nettoyage, les tests s'influencent entre eux."""
    cache.clear()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def livree(traiteur, demande_en_cours, pdf_bytes):
    fichier_upload = SimpleUploadedFile('scan.pdf', pdf_bytes, content_type='application/pdf')
    demande = services.valider(
        demande_en_cours, traiteur, duree_heures=24, telechargement_autorise=False,
        uploads=[fichier_upload], ids_copies=[],
    )
    return demande, demande.fichiers.get()


def _url(demande, fichier, action='voir'):
    slug = demande.reference.replace('/', '-')
    return f"/api/consultations/demandes/{slug}/fichiers/{fichier.id}/{action}/"


def _corps(resp):
    if getattr(resp, 'streaming', False):
        return b''.join(resp.streaming_content)
    return resp.content


# ─── Lecture par le demandeur ───────────────────────────────────────────────

def test_demandeur_recoit_une_copie_filigranee(gestionnaire_user, livree, pdf_bytes):
    demande, fichier = livree
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert 'no-store' in resp['Cache-Control']
    assert resp['Content-Disposition'].startswith('inline')
    corps = _corps(resp)
    assert corps != pdf_bytes                       # jamais l'original
    texte = PdfReader(BytesIO(corps)).pages[0].extract_text()
    assert demande.reference in texte               # filigrane présent
    assert 'Contenu confidentiel' in texte


def test_lecture_tracee_dans_laudit(gestionnaire_user, livree):
    demande, fichier = livree
    _client(gestionnaire_user).get(_url(demande, fichier))
    log = AuditLog.objects.get(action='VIEW_CONSULTATION')
    assert log.user_id == gestionnaire_user.id
    assert log.details['reference'] == demande.reference
    assert log.details['fichier'] == 'scan.pdf'


def test_traiteur_recoit_loriginal(traiteur, livree, pdf_bytes):
    demande, fichier = livree
    resp = _client(traiteur).get(_url(demande, fichier))
    assert resp.status_code == 200
    assert _corps(resp) == pdf_bytes


# ─── Refus ──────────────────────────────────────────────────────────────────

def test_tiers_recoit_404(other_gestionnaire, admin_user, livree):
    demande, fichier = livree
    for user in (other_gestionnaire, admin_user):
        assert _client(user).get(_url(demande, fichier)).status_code == 404
    assert not AuditLog.objects.filter(action='VIEW_CONSULTATION').exists()


def test_non_authentifie_refuse(livree):
    demande, fichier = livree
    assert APIClient().get(_url(demande, fichier)).status_code in (401, 403)


def test_consultation_expiree_donne_403_explicite(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(seconds=1),
    )
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 403
    assert 'expir' in resp.data['detail'].lower()
    assert not AuditLog.objects.filter(action='VIEW_CONSULTATION').exists()


def test_echeance_exactement_atteinte_refusee(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(date_echeance=timezone.now())
    assert _client(gestionnaire_user).get(_url(demande, fichier)).status_code == 403


def test_consultation_revoquee_donne_403(gestionnaire_user, traiteur, livree):
    demande, fichier = livree
    services.revoquer(demande, traiteur)
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 403
    assert 'révoqu' in resp.data['detail'].lower()


def test_fichier_dune_autre_demande_donne_404(gestionnaire_user, livree, traiteur, pdf_bytes):
    demande, _ = livree
    autre = DemandeConsultation.objects.create(
        reference='C-00077/26', type_demande='document', description='autre',
        demandeur=gestionnaire_user,
    )
    services.valider(
        autre, traiteur, duree_heures=24, telechargement_autorise=False,
        uploads=[SimpleUploadedFile('b.pdf', pdf_bytes, content_type='application/pdf')], ids_copies=[],
    )
    fichier_autre = autre.fichiers.get()
    # URL de la demande A avec le fichier de la demande B.
    assert _client(gestionnaire_user).get(_url(demande, fichier_autre)).status_code == 404


def test_fichier_purge_donne_410(traiteur, livree):
    demande, fichier = livree
    fichier.supprime_le = timezone.now()
    fichier.save()
    assert _client(traiteur).get(_url(demande, fichier)).status_code == 410


def test_echec_du_filigrane_ne_sert_rien(gestionnaire_user, livree, pdf_bytes):
    """Échec fermé : un fichier illisible ne doit jamais être servi tel quel."""
    demande, fichier = livree
    with open(fichier.file.path, 'wb') as fh:
        fh.write(b'%PDF-1.4 corrompu')
    resp = _client(gestionnaire_user).get(_url(demande, fichier))
    assert resp.status_code == 422
    assert b'corrompu' not in resp.content


# ─── Téléchargement ─────────────────────────────────────────────────────────

def test_telechargement_refuse_si_non_autorise(gestionnaire_user, livree):
    demande, fichier = livree
    resp = _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger'))
    assert resp.status_code == 403
    assert not AuditLog.objects.filter(action='DL_CONSULTATION').exists()


def test_telechargement_autorise_sert_une_copie_filigranee(gestionnaire_user, livree, pdf_bytes):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(telechargement_autorise=True)
    resp = _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger'))
    assert resp.status_code == 200
    assert resp['Content-Disposition'].startswith('attachment')
    assert _corps(resp) != pdf_bytes
    assert demande.reference in PdfReader(BytesIO(_corps(resp))).pages[0].extract_text()
    assert AuditLog.objects.filter(action='DL_CONSULTATION').count() == 1


def test_telechargement_expire_refuse_meme_si_autorise(gestionnaire_user, livree):
    demande, fichier = livree
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        telechargement_autorise=True, date_echeance=timezone.now() - timedelta(minutes=1),
    )
    assert _client(gestionnaire_user).get(_url(demande, fichier, 'telecharger')).status_code == 403


# ─── Métadonnées du détail ──────────────────────────────────────────────────

def test_detail_masque_les_fichiers_une_fois_expiree(gestionnaire_user, livree):
    demande, _ = livree
    slug = demande.reference.replace('/', '-')
    client = _client(gestionnaire_user)
    assert len(client.get(f'/api/consultations/demandes/{slug}/').data['fichiers']) == 1
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(minutes=1),
    )
    resp = client.get(f'/api/consultations/demandes/{slug}/')
    assert resp.data['statut_effectif'] == 'expiree'
    assert resp.data['fichiers'] == []
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_acces.py -v`
Expected: FAIL (404 : routes inexistantes).

- [ ] **Step 3 : contrôle d'accès**

```python
# backend/consultations/access.py
"""Contrôle d'accès à un fichier livré — appelé à CHAQUE lecture ou
téléchargement. Ni l'interface ni un lien déjà ouvert ne suffisent : c'est
ici que l'expiration est réellement appliquée."""
from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied

from .models import DemandeConsultation

Statut = DemandeConsultation.Statut


class Gone(APIException):
    status_code = status.HTTP_410_GONE
    default_detail = "Ce fichier a été supprimé."
    default_code = 'gone'


def controler_acces(user, demande, fichier, now=None):
    """Lève une exception si `user` ne peut pas lire `fichier`.

    - tiers (ni traiteur, ni demandeur de CETTE demande) → 404 : l'existence
      de la demande n'est pas révélée ;
    - demandeur légitime hors validité → 403 avec un message explicite ;
    - fichier purgé → 410 ;
    - traiteur → toujours autorisé (il vérifie ce qu'il a envoyé).
    """
    now = now or timezone.now()
    if not user.can_manage_consultations:
        if demande.demandeur_id != user.id:
            raise Http404
        if demande.statut == Statut.EN_COURS:
            raise PermissionDenied("Cette demande n'a pas encore été validée.")
        if demande.statut == Statut.REJETEE:
            raise PermissionDenied("Cette demande a été rejetée.")
        if demande.statut == Statut.REVOQUEE:
            raise PermissionDenied("Cette consultation a été révoquée.")
        if not demande.est_active(now):
            quand = timezone.localtime(demande.date_echeance).strftime('%d/%m/%Y à %H:%M')
            raise PermissionDenied(f"Consultation expirée le {quand}.")
    if fichier.supprime_le is not None:
        raise Gone()
```

- [ ] **Step 4 : vues** (ajouter à `consultations/views.py`)

Imports à ajouter :

```python
import logging
import os

from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.utils.encoding import smart_str
from rest_framework.throttling import ScopedRateThrottle

from .access import controler_acces
from .filigrane import appliquer_filigrane

logger = logging.getLogger(__name__)
```

Code à ajouter :

```python
class _FichierLivreView(APIView):
    """Base commune de `voir` et `telecharger`. Throttle `consultation`
    (30/min), flux authentifié, jamais de lien vers media/."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'consultation'
    disposition = 'inline'
    action_audit = AuditLog.Action.VIEW_CONSULTATION

    def _charger(self, request, ref, fichier_id):
        demande = DemandeConsultation.objects.select_related('demandeur').filter(
            reference=reference_depuis_slug(ref),
        ).first()
        if demande is None:
            raise Http404
        fichier = demande.fichiers.filter(pk=fichier_id).first()
        if fichier is None:
            raise Http404
        controler_acces(request.user, demande, fichier)
        return demande, fichier

    def _autoriser_action(self, request, demande):
        """Surcharge dans `telecharger`."""

    def get(self, request, ref, fichier_id):
        demande, fichier = self._charger(request, ref, fichier_id)
        self._autoriser_action(request, demande)
        if not fichier.file or not os.path.exists(fichier.file.path):
            return Response({'error': 'Fichier introuvable.'}, status=404)

        nom = fichier.file_name
        if request.user.can_manage_consultations:
            # Le traiteur contrôle l'original qu'il a envoyé.
            def flux(chemin, taille_bloc=8192):
                with open(chemin, 'rb') as fh:
                    while bloc := fh.read(taille_bloc):
                        yield bloc

            reponse = StreamingHttpResponse(flux(fichier.file.path), content_type=fichier.mime_type)
            reponse['Content-Length'] = os.path.getsize(fichier.file.path)
        else:
            texte = (
                f"{request.user.full_name} — {demande.reference} — "
                f"{timezone.localtime():%d/%m/%Y %H:%M}"
            )
            try:
                with open(fichier.file.path, 'rb') as fh:
                    contenu, mime = appliquer_filigrane(fh.read(), fichier.mime_type, texte)
            except Exception:
                # Échec fermé : on ne sert JAMAIS l'original non filigrané.
                logger.exception("Filigrane impossible (fichier %s)", fichier.id)
                return Response(
                    {'error': "Le fichier livré est illisible. Contactez le traiteur de votre demande."},
                    status=422,
                )
            if mime != fichier.mime_type:
                nom = os.path.splitext(nom)[0] + '.png'
            reponse = HttpResponse(contenu, content_type=mime)

        nom_sur = smart_str(nom).replace('"', '')
        reponse['Content-Disposition'] = f'{self.disposition}; filename="{nom_sur}"'
        reponse['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        reponse['Pragma'] = 'no-cache'
        reponse['X-Frame-Options'] = 'SAMEORIGIN'
        reponse['X-Content-Type-Options'] = 'nosniff'
        reponse['Content-Security-Policy'] = "default-src 'self'"
        AuditLog.log(
            request, self.action_audit, target=demande,
            details={
                'reference': demande.reference, 'fichier': fichier.file_name,
                'traiteur': bool(request.user.can_manage_consultations),
            },
        )
        return reponse


class ConsultationFichierVoirView(_FichierLivreView):
    pass


class ConsultationFichierTelechargerView(_FichierLivreView):
    disposition = 'attachment'
    action_audit = AuditLog.Action.DL_CONSULTATION

    def _autoriser_action(self, request, demande):
        if not request.user.can_manage_consultations and not demande.telechargement_autorise:
            raise PermissionDenied("Le téléchargement n'est pas autorisé pour cette consultation.")
```

Dans `consultations/urls.py`, importer les deux vues et ajouter :

```python
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/voir/', ConsultationFichierVoirView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/telecharger/', ConsultationFichierTelechargerView.as_view()),
```

- [ ] **Step 5 : tests**

Run: `cd backend && pytest tests/test_consultations_acces.py tests/test_consultations_traitement.py tests/test_consultations_api.py -v`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_acces.py
git commit -m "feat(consultations): lecture et téléchargement sécurisés, filigrane, expiration serveur"
```

---

### Task 7 : prolongation

**Files:**
- Modify: `backend/consultations/services.py` (fonction `prolonger`), `backend/consultations/views.py`, `backend/consultations/urls.py`
- Test: `backend/tests/test_consultations_prolongation.py`

**Interfaces:**
- Consumes: `_verrouiller`, `_verifier_traiteur_distinct`, `_valider_duree` (Task 4), `notifier_prolongee` (Task 3).
- Produces: `services.prolonger(demande, manager, duree_heures, now=None) -> DemandeConsultation` (pose `demande._ancienne_echeance`) ; `POST /api/consultations/demandes/<slug>/prolonger/` (`duree_heures`).

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_prolongation.py
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from consultations.models import DemandeConsultation

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]

URL = '/api/consultations/demandes/C-00002-26/prolonger/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_prolongation_dune_consultation_active(traiteur, demande_validee):
    ancienne = demande_validee.date_echeance
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.date_echeance == ancienne + timedelta(hours=24)
    assert demande_validee.date_echeance_initiale != demande_validee.date_echeance
    assert demande_validee.nb_prolongations == 1


def test_prolongation_reinitialise_les_rappels(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        rappel_24h_envoye=True, rappel_1h_envoye=True,
    )
    _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    demande_validee.refresh_from_db()
    assert demande_validee.rappel_24h_envoye is False
    assert demande_validee.rappel_1h_envoye is False


def test_prolongation_apres_echeance_dans_le_delai_de_grace(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        date_echeance=timezone.now() - timedelta(hours=2),
    )
    avant = timezone.now()
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 200, resp.data
    demande_validee.refresh_from_db()
    # Repart de maintenant, pas de l'ancienne échéance déjà passée.
    assert demande_validee.date_echeance >= avant + timedelta(hours=24)
    assert demande_validee.est_active() is True


def test_prolongation_refusee_apres_le_delai_de_grace(traiteur, demande_validee):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        date_echeance=timezone.now() - timedelta(hours=25),
    )
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    assert resp.status_code == 400


def test_plafond_de_duree_cumulee(traiteur, demande_validee, settings):
    settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES = 30
    resp = _client(traiteur).post(URL, {'duree_heures': 24}, format='json')  # 24 h + 24 h > 30 h
    assert resp.status_code == 400
    assert 'duree_heures' in resp.data
    demande_validee.refresh_from_db()
    assert demande_validee.nb_prolongations == 0


def test_prolongation_refusee_si_revoquee_ou_en_cours(traiteur, demande_validee, demande_en_cours):
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        statut=DemandeConsultation.Statut.REVOQUEE,
    )
    assert _client(traiteur).post(URL, {'duree_heures': 24}, format='json').status_code == 400
    resp = _client(traiteur).post(
        '/api/consultations/demandes/C-00001-26/prolonger/', {'duree_heures': 24}, format='json',
    )
    assert resp.status_code == 400


def test_prolongation_duree_hors_presets(traiteur, demande_validee):
    resp = _client(traiteur).post(URL, {'duree_heures': 7}, format='json')
    assert resp.status_code == 400


def test_prolongation_par_non_traiteur_refusee(gestionnaire_user, admin_user, demande_validee):
    for user in (gestionnaire_user, admin_user):
        assert _client(user).post(URL, {'duree_heures': 24}, format='json').status_code == 403


def test_prolongation_tracee_et_notifiee(
    traiteur, gestionnaire_user, demande_validee, django_capture_on_commit_callbacks,
):
    from notifications.models import Notification
    ancienne = demande_validee.date_echeance
    with django_capture_on_commit_callbacks(execute=True):
        _client(traiteur).post(URL, {'duree_heures': 24}, format='json')
    log = AuditLog.objects.get(action='PROLONG_CONSULTATION')
    assert log.details['ancienne_echeance'] == ancienne.isoformat()
    assert log.details['nouvelle_echeance'] != log.details['ancienne_echeance']
    notif = Notification.objects.get(recipient=gestionnaire_user)
    assert notif.type == Notification.Type.CONSULTATION_PROLONGEE
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_prolongation.py -v`
Expected: FAIL (404).

- [ ] **Step 3 : service** (ajouter à `consultations/services.py`)

```python
@transaction.atomic
def prolonger(demande, manager, duree_heures, now=None):
    """Prolonge une consultation validée. Autorisée jusqu'à
    CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES après l'échéance, plafonnée
    par CONSULTATION_MAX_DUREE_TOTALE_HEURES depuis la validation. Au-delà du
    délai de grâce, le demandeur doit refaire une demande."""
    demande = _verrouiller(demande)
    now = now or timezone.now()
    if demande.statut != Statut.VALIDEE:
        raise ValidationError("Seule une consultation validée peut être prolongée.")
    _verifier_traiteur_distinct(demande, manager)
    duree = _valider_duree(duree_heures)

    grace = timedelta(hours=settings.CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES)
    if now > demande.date_echeance + grace:
        raise ValidationError("Le délai de prolongation est dépassé : le demandeur doit refaire une demande.")

    ancienne = demande.date_echeance
    nouvelle = max(now, ancienne) + timedelta(hours=duree)
    plafond = timedelta(hours=settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES)
    if nouvelle - demande.date_validation > plafond:
        raise ValidationError({
            'duree_heures': f"Le plafond de {settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES} h de consultation cumulée serait dépassé.",
        })

    demande.date_echeance = nouvelle
    demande.nb_prolongations += 1
    demande.rappel_24h_envoye = False
    demande.rappel_1h_envoye = False
    demande.save()
    demande._ancienne_echeance = ancienne
    return demande
```

- [ ] **Step 4 : vue** (ajouter à `consultations/views.py` ; importer `notifier_prolongee` depuis `.notifications`)

```python
class DemandeConsultationProlongerView(_TraitementView):
    def post(self, request, ref):
        demande = self.get_object()
        demande = services.prolonger(demande, request.user, request.data.get('duree_heures'))
        AuditLog.log(
            request, AuditLog.Action.PROLONG_CONSULTATION, target=demande,
            details={
                'reference': demande.reference,
                'ancienne_echeance': demande._ancienne_echeance.isoformat(),
                'nouvelle_echeance': demande.date_echeance.isoformat(),
                'nb_prolongations': demande.nb_prolongations,
            },
        )
        notifier_prolongee(demande, request.user)
        return self._reponse(demande)
```

`urls.py` : `path('demandes/<str:ref>/prolonger/', DemandeConsultationProlongerView.as_view()),`

- [ ] **Step 5 : tests**

Run: `cd backend && pytest tests/test_consultations_prolongation.py -v`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_prolongation.py
git commit -m "feat(consultations): prolongation avec plafond et délai de grâce"
```

---

### Task 8 : rappels avant échéance

**Files:**
- Create: `backend/consultations/alerts.py`, `backend/consultations/management/__init__.py`, `management/commands/__init__.py`, `management/commands/notifier_echeances_consultation.py`
- Test: `backend/tests/test_consultations_rappels.py`

**Interfaces:**
- Consumes: `notifier_echeance(demande, libelle_seuil)` (Task 3), champs `rappel_24h_envoye` / `rappel_1h_envoye` (Task 2).
- Produces: `alerts.notifier_echeances_consultation(now=None) -> int` (nombre de rappels envoyés) ; commande `manage.py notifier_echeances_consultation`.

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_rappels.py
from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from consultations.alerts import notifier_echeances_consultation
from consultations.models import DemandeConsultation
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def _regler(demande, validation, echeance):
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_validation=validation, date_echeance=echeance,
        rappel_24h_envoye=False, rappel_1h_envoye=False,
    )
    demande.refresh_from_db()


def test_rappel_24h_envoye_une_seule_fois(
    demande_validee, gestionnaire_user, traiteur, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 1
    destinataires = set(Notification.objects.values_list('recipient_id', flat=True))
    assert destinataires == {gestionnaire_user.id, traiteur.id}
    notif = Notification.objects.filter(recipient=gestionnaire_user).get()
    assert notif.type == Notification.Type.CONSULTATION_ECHEANCE
    assert demande_validee.reference in notif.message
    assert '24 h' in notif.message
    # Idempotent
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    assert Notification.objects.count() == 2


def test_rappel_1h_apres_le_rappel_24h(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    with django_capture_on_commit_callbacks(execute=True):
        notifier_echeances_consultation(now)
    plus_tard = now + timedelta(hours=19, minutes=30)  # reste 30 min
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(plus_tard) == 1
    assert Notification.objects.filter(message__contains='1 h').exists()
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(plus_tard) == 0


def test_un_seul_rappel_si_les_deux_seuils_sont_deja_franchis(
    demande_validee, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(minutes=30))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 1
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    assert Notification.objects.filter(message__contains='1 h').exists()
    assert not Notification.objects.filter(message__contains='24 h').exists()


def test_consultation_courte_sans_rappel(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    # Durée totale d'1 h : aucun seuil n'est strictement inférieur à la durée.
    _regler(demande_validee, now - timedelta(minutes=30), now + timedelta(minutes=30))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0


def test_pas_de_rappel_hors_fenetre_ou_non_validee(
    demande_validee, demande_en_cours, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=1), now + timedelta(hours=72))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    _regler(demande_validee, now - timedelta(hours=48), now - timedelta(minutes=1))  # déjà expirée
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0


def test_commande_de_gestion(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    sortie = StringIO()
    with django_capture_on_commit_callbacks(execute=True):
        call_command('notifier_echeances_consultation', stdout=sortie)
    assert '1 rappel' in sortie.getvalue()
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_rappels.py -v`
Expected: FAIL (`ModuleNotFoundError: consultations.alerts`).

- [ ] **Step 3 : implémentation**

```python
# backend/consultations/alerts.py
from datetime import timedelta

from django.utils import timezone

from .models import DemandeConsultation
from .notifications import notifier_echeance

# Du plus proche au plus lointain : on n'envoie que le seuil le plus proche
# déjà franchi (jamais deux rappels d'un coup si la commande a du retard).
SEUILS = (
    ('1 h', timedelta(hours=1), 'rappel_1h_envoye'),
    ('24 h', timedelta(hours=24), 'rappel_24h_envoye'),
)


def notifier_echeances_consultation(now=None):
    """Rappelle l'échéance proche d'une consultation validée. Idempotent :
    chaque seuil n'est notifié qu'une fois par consultation (les drapeaux
    sont réinitialisés par une prolongation). Un seuil supérieur ou égal à
    la durée totale de la consultation est ignoré. Renvoie le nombre de
    rappels envoyés."""
    now = now or timezone.now()
    fenetre = now + max(seuil for _, seuil, _ in SEUILS)
    envoyes = 0
    demandes = DemandeConsultation.objects.filter(
        statut=DemandeConsultation.Statut.VALIDEE,
        date_echeance__gt=now, date_echeance__lte=fenetre,
    )
    for demande in demandes:
        reste = demande.date_echeance - now
        duree_totale = demande.date_echeance - demande.date_validation
        for libelle, seuil, champ in SEUILS:
            if reste <= seuil and duree_totale > seuil:
                if not getattr(demande, champ):
                    notifier_echeance(demande, libelle)
                    # Ce seuil et tous les seuils plus lointains sont soldés.
                    for _, seuil_autre, champ_autre in SEUILS:
                        if seuil_autre >= seuil:
                            setattr(demande, champ_autre, True)
                    demande.save(update_fields=[c for _, _, c in SEUILS])
                    envoyes += 1
                break
    return envoyes
```

```python
# backend/consultations/management/commands/notifier_echeances_consultation.py
from django.core.management.base import BaseCommand

from consultations.alerts import notifier_echeances_consultation


class Command(BaseCommand):
    help = ("Rappelle au demandeur et au traiteur les consultations qui expirent "
            "dans moins de 24 h / 1 h. Idempotent ; à planifier toutes les "
            "15 minutes en production (cron de l'hôte, comme les autres "
            "commandes de notifications).")

    def handle(self, *args, **options):
        n = notifier_echeances_consultation()
        self.stdout.write(f"{n} rappel(s) d'échéance envoyé(s).")
```

(Créer aussi `management/__init__.py` et `management/commands/__init__.py` vides.)

Note : le test `test_commande_de_gestion` cherche `'1 rappel'` ; le message produit est « 1 rappel(s) d'échéance envoyé(s). » — la sous-chaîne `1 rappel` y figure bien.

- [ ] **Step 4 : tests**

Run: `cd backend && pytest tests/test_consultations_rappels.py -v`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_rappels.py
git commit -m "feat(consultations): rappels d'échéance idempotents et commande de gestion"
```

---

### Task 9 : purge manuelle des scans livrés

**Files:**
- Modify: `backend/consultations/services.py` (`fichiers_purgeables`)
- Create: `backend/consultations/management/commands/purger_consultations.py`
- Test: `backend/tests/test_consultations_purge.py`

**Interfaces:**
- Produces: `services.fichiers_purgeables(jours, now=None) -> QuerySet[ConsultationFichier]` (scans **externes** uniquement, de demandes expirées ou révoquées depuis plus de `jours` jours, non encore purgés) ; commande `manage.py purger_consultations [--jours 90] [--confirmer] [--sauvegarde-dir DIR]`.
- **Garde-fous (incident du 2026-07-22)** : sans `--confirmer` la commande ne fait que **lister** ; chaque chemin est normalisé (`realpath`) et doit se trouver sous `MEDIA_ROOT/consultations/` ; une sauvegarde est écrite et vérifiée **avant** toute suppression ; chaque suppression est tracée dans `AuditLog` (snapshot texte) ; les copies d'archivés ne sont jamais concernées.

- [ ] **Step 1 : tests qui échouent**

```python
# backend/tests/test_consultations_purge.py
import os
from datetime import timedelta
from io import StringIO

import pytest
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from audit.models import AuditLog
from consultations.models import ConsultationFichier, DemandeConsultation
from consultations.services import fichiers_purgeables

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures('media_tmp')]


def _fichier(demande, origine=ConsultationFichier.Origine.SCAN_EXTERNE, nom='scan.pdf', contenu=b'%PDF-1.4 secret'):
    f = ConsultationFichier(
        demande=demande, file_name=nom, mime_type='application/pdf',
        file_size=len(contenu), origine=origine,
    )
    f.file.save(nom, ContentFile(contenu), save=False)
    f.save()
    return f


def _expirer(demande, jours):
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_echeance=timezone.now() - timedelta(days=jours),
    )
    demande.refresh_from_db()


def _lancer(*args):
    sortie = StringIO()
    call_command('purger_consultations', *args, stdout=sortie)
    return sortie.getvalue()


def test_selection_des_fichiers_purgeables(demande_validee):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    assert list(fichiers_purgeables(90)) == [f]
    assert list(fichiers_purgeables(120)) == []          # pas assez ancien


def test_copies_darchive_jamais_purgees(demande_validee):
    _fichier(demande_validee, origine=ConsultationFichier.Origine.COPIE_ARCHIVE)
    _expirer(demande_validee, 400)
    assert list(fichiers_purgeables(90)) == []


def test_consultation_encore_active_jamais_purgee(demande_validee):
    _fichier(demande_validee)
    assert list(fichiers_purgeables(0)) == []


def test_revoquee_depuis_longtemps_est_purgeable(demande_validee):
    f = _fichier(demande_validee)
    DemandeConsultation.objects.filter(pk=demande_validee.pk).update(
        statut=DemandeConsultation.Statut.REVOQUEE,
        date_revocation=timezone.now() - timedelta(days=100),
    )
    assert list(fichiers_purgeables(90)) == [f]


def test_sans_confirmer_la_commande_ne_fait_que_lister(demande_validee):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    chemin = f.file.path
    sortie = _lancer('--jours', '90')
    assert demande_validee.reference in sortie
    assert 'scan.pdf' in sortie
    assert os.path.exists(chemin)
    f.refresh_from_db()
    assert f.supprime_le is None
    assert not AuditLog.objects.filter(action='PURGE_CONSULTATION').exists()


def test_purge_confirmee_sauvegarde_puis_supprime_et_trace(demande_validee, tmp_path):
    f = _fichier(demande_validee, contenu=b'%PDF-1.4 contenu-a-sauvegarder')
    _expirer(demande_validee, 100)
    chemin = f.file.path
    sauvegarde = tmp_path / 'sauvegarde'
    _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(sauvegarde))
    assert not os.path.exists(chemin)                                     # supprimé
    f.refresh_from_db()
    assert f.supprime_le is not None                                      # ligne conservée
    copies = [p for p in sauvegarde.rglob('*') if p.is_file()]
    assert len(copies) == 1
    assert copies[0].read_bytes() == b'%PDF-1.4 contenu-a-sauvegarder'    # sauvegarde fidèle
    log = AuditLog.objects.get(action='PURGE_CONSULTATION')
    assert log.details['reference'] == demande_validee.reference
    assert log.details['fichier'] == 'scan.pdf'
    assert log.username_snapshot == 'system:purger_consultations'


def test_chemin_hors_du_dossier_consultations_refuse(demande_validee, media_tmp):
    hors = media_tmp / 'autre'
    hors.mkdir()
    (hors / 'hors.pdf').write_bytes(b'ne jamais supprimer')
    f = ConsultationFichier.objects.create(
        demande=demande_validee, file='consultations/../autre/hors.pdf', file_name='hors.pdf',
        mime_type='application/pdf', file_size=3,
        origine=ConsultationFichier.Origine.SCAN_EXTERNE,
    )
    _expirer(demande_validee, 100)
    sortie = _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(media_tmp / 'sauv'))
    assert (hors / 'hors.pdf').exists()                                   # intact
    f.refresh_from_db()
    assert f.supprime_le is None
    assert 'refus' in sortie.lower()


def test_echec_de_sauvegarde_annule_toute_suppression(demande_validee, tmp_path):
    f = _fichier(demande_validee)
    _expirer(demande_validee, 100)
    chemin = f.file.path
    bloquant = tmp_path / 'fichier_pas_dossier'
    bloquant.write_text('je suis un fichier')                              # impossible d'y créer un dossier
    with pytest.raises(CommandError):
        _lancer('--jours', '90', '--confirmer', '--sauvegarde-dir', str(bloquant / 'sous'))
    assert os.path.exists(chemin)
    f.refresh_from_db()
    assert f.supprime_le is None


def test_fichier_deja_purge_ignore(demande_validee):
    f = _fichier(demande_validee)
    f.supprime_le = timezone.now()
    f.save()
    _expirer(demande_validee, 100)
    assert list(fichiers_purgeables(90)) == []
```

- [ ] **Step 2 : constater l'échec**

Run: `cd backend && pytest tests/test_consultations_purge.py -v`
Expected: FAIL (`ImportError: fichiers_purgeables` / commande inconnue).

- [ ] **Step 3 : sélection** (ajouter à `consultations/services.py` ; ajouter `from django.db.models import Q` aux imports)

```python
def fichiers_purgeables(jours, now=None):
    """Scans externes dont la consultation est close depuis plus de `jours`
    jours (expirée ou révoquée), pas encore purgés. Les copies d'archivés
    ne sont jamais concernées : l'original reste dans le dossier de
    l'employé, et une copie n'a pas de valeur propre à détruire."""
    now = now or timezone.now()
    limite = now - timedelta(days=jours)
    return ConsultationFichier.objects.filter(
        origine=ConsultationFichier.Origine.SCAN_EXTERNE, supprime_le__isnull=True,
    ).filter(
        Q(demande__statut=Statut.VALIDEE, demande__date_echeance__lt=limite)
        | Q(demande__statut=Statut.REVOQUEE, demande__date_revocation__lt=limite)
    ).select_related('demande')
```

- [ ] **Step 4 : commande**

```python
# backend/consultations/management/commands/purger_consultations.py
"""Purge MANUELLE des scans livrés. Jamais planifiée automatiquement.

Garde-fous issus de l'incident du 2026-07-22 (docs/fonctionnel/documents.md) :
1. sans --confirmer, la commande liste seulement ;
2. chaque chemin est normalisé (realpath) et doit être sous
   MEDIA_ROOT/consultations/ — sinon refus, fichier intact ;
3. sauvegarde écrite ET vérifiée avant toute suppression ;
4. chaque suppression est tracée dans AuditLog (snapshot texte)."""
import os
import shutil
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from audit.models import AuditLog
from consultations.services import fichiers_purgeables


class Command(BaseCommand):
    help = "Liste (ou, avec --confirmer, supprime après sauvegarde) les scans livrés d'anciennes consultations."

    def add_arguments(self, parser):
        parser.add_argument('--jours', type=int, default=90,
                            help="Ancienneté minimale de la clôture de la consultation (défaut : 90).")
        parser.add_argument('--confirmer', action='store_true',
                            help="Effectue réellement la purge (sinon : liste seulement).")
        parser.add_argument('--sauvegarde-dir', default=None,
                            help="Dossier de sauvegarde (défaut : <BASE_DIR>/backups/consultations_purge_<horodatage>).")

    def handle(self, *args, **opts):
        racine = os.path.realpath(os.path.join(settings.MEDIA_ROOT, 'consultations'))
        retenus, refuses = [], []
        for fichier in fichiers_purgeables(opts['jours']):
            try:
                chemin = os.path.realpath(fichier.file.path)
            except Exception as exc:
                refuses.append((fichier, f"chemin illisible ({exc})"))
                continue
            if not chemin.startswith(racine + os.sep):
                refuses.append((fichier, f"hors de {racine}"))
            elif not os.path.isfile(chemin):
                refuses.append((fichier, "fichier absent du disque"))
            else:
                retenus.append((fichier, chemin))

        self.stdout.write(f"{len(retenus)} fichier(s) à purger (consultations closes depuis plus de {opts['jours']} jours) :")
        for fichier, chemin in retenus:
            self.stdout.write(
                f"  {fichier.demande.reference}  {fichier.file_name}  "
                f"{fichier.file_size} octets  {os.path.relpath(chemin, racine)}"
            )
        for fichier, raison in refuses:
            self.stdout.write(self.style.WARNING(f"  REFUSÉ  {fichier.demande.reference}  {fichier.file_name} : {raison}"))

        if not opts['confirmer']:
            self.stdout.write("Aucune suppression. Relisez la liste puis relancez avec --confirmer.")
            return
        if not retenus:
            self.stdout.write("Rien à purger.")
            return

        dest = opts['sauvegarde_dir'] or os.path.join(
            settings.BASE_DIR, 'backups', f"consultations_purge_{datetime.now():%Y%m%d_%H%M%S}",
        )
        copies = []
        try:
            for fichier, chemin in retenus:
                cible = os.path.join(dest, os.path.relpath(chemin, racine))
                os.makedirs(os.path.dirname(cible), exist_ok=True)
                shutil.copy2(chemin, cible)
                if os.path.getsize(cible) != os.path.getsize(chemin):
                    raise OSError(f"copie incomplète : {cible}")
                copies.append(cible)
        except OSError as exc:
            raise CommandError(f"Sauvegarde impossible, AUCUNE suppression effectuée : {exc}")

        maintenant = timezone.now()
        for fichier, chemin in retenus:
            os.remove(chemin)
            fichier.supprime_le = maintenant
            fichier.save(update_fields=['supprime_le'])
            AuditLog.objects.create(
                user=None, username_snapshot='system:purger_consultations',
                action=AuditLog.Action.PURGE_CONSULTATION,
                target_model='ConsultationFichier', target_id=str(fichier.id),
                target_label=f"{fichier.demande.reference} — {fichier.file_name}",
                details={
                    'reference': fichier.demande.reference, 'fichier': fichier.file_name,
                    'taille': fichier.file_size, 'origine': fichier.origine, 'sauvegarde': dest,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"{len(retenus)} fichier(s) purgé(s). Sauvegarde : {dest}"))
```

- [ ] **Step 5 : tests**

Run: `cd backend && pytest tests/test_consultations_purge.py -v`
Expected: PASS.

- [ ] **Step 6 : commit**

```bash
git add backend/consultations backend/tests/test_consultations_purge.py
git commit -m "feat(consultations): commande de purge manuelle avec sauvegarde et audit"
```

---

### Task 10 : frontend — utilitaires, liste, nouvelle demande, routes, navbar, drapeau dans /users

**Files:**
- Create: `frontend/src/utils/consultations.js`, `components/consultations/StatutConsultationBadge.jsx`, `pages/Consultations.jsx`, `pages/ConsultationNouvelle.jsx`
- Modify: `frontend/src/App.js` (imports lazy l.31-33, routes après `/attestations/:ref`), `components/Navbar.jsx` (état + lien + 2 badges), `pages/Users.jsx` (formulaire, bascule, bouton)
- Test: `frontend/src/__tests__/consultationsUtils.test.js`, `Consultations.test.jsx`, `ConsultationNouvelle.test.jsx`

**Interfaces:**
- Consumes: API des Tasks 3-4 ; `user.can_manage_consultations` (exposé par `/auth/me/`, Task 1) ; `Navbar`, `PageBackground`, `Breadcrumb`, `useConfirm`, tokens `theme.js` (jamais d'hex en dur — le dégradé de bandeau est `theme.directionGrad`).
- Produces: `utils/consultations.js` exporte `TYPES_DEMANDE`, `DUREES`, `slugDepuisReference(ref)`, `formatDateHeure(iso)`, `tempsRestant(iso, maintenant?)` ; `StatutConsultationBadge({ statut })` (accepte `en_cours|validee|expiree|rejetee|revoquee`).

- [ ] **Step 1 : tests des utilitaires (échouent)**

```js
// frontend/src/__tests__/consultationsUtils.test.js
import { slugDepuisReference, formatDateHeure, tempsRestant, DUREES } from "../utils/consultations";

describe("utils/consultations", () => {
  test("slugDepuisReference remplace le / de la référence", () => {
    expect(slugDepuisReference("C-00001/26")).toBe("C-00001-26");
  });

  test("formatDateHeure formate jj/mm/aaaa hh:mm et tolère le vide", () => {
    expect(formatDateHeure(null)).toBe("—");
    expect(formatDateHeure("pas une date")).toBe("—");
    expect(formatDateHeure("2026-10-08T09:05:00")).toBe("08/10/2026 09:05");
  });

  test("tempsRestant", () => {
    const now = new Date("2026-10-08T10:00:00").getTime();
    expect(tempsRestant("2026-10-08T09:59:59", now)).toBe("Expirée");
    expect(tempsRestant("2026-10-08T10:00:00", now)).toBe("Expirée");
    expect(tempsRestant("2026-10-08T10:12:00", now)).toBe("12 min");
    expect(tempsRestant("2026-10-08T15:05:00", now)).toBe("5 h 05 min");
    expect(tempsRestant("2026-10-10T13:00:00", now)).toBe("2 j 3 h");
  });

  test("les durées proposées reprennent les presets du serveur", () => {
    expect(DUREES.map((d) => d.value)).toEqual([1, 24, 72, 168]);
  });
});
```

- [ ] **Step 2 : constater l'échec**

Run: `cd frontend && npx jest src/__tests__/consultationsUtils.test.js` (ou `npm test -- --watchAll=false consultationsUtils`)
Expected: FAIL (module introuvable).

- [ ] **Step 3 : utilitaires et badge**

```js
// frontend/src/utils/consultations.js
export const TYPES_DEMANDE = [
  { value: "dossier", label: "Dossier" },
  { value: "document", label: "Document" },
  { value: "information", label: "Information" },
];

// Presets de durée — doivent rester identiques à
// settings.CONSULTATION_DUREES_HEURES côté backend.
export const DUREES = [
  { value: 1, label: "1 heure" },
  { value: 24, label: "24 heures" },
  { value: 72, label: "3 jours" },
  { value: 168, label: "7 jours" },
];

// La référence "C-00001/26" contient un "/" illisible dans une URL : encodé
// en "-" (voir reference_depuis_slug côté backend).
export const slugDepuisReference = (reference) => reference.replace("/", "-");

// Date + heure locales (formatDateFR ne gère que la date).
export function formatDateHeure(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Compte à rebours lisible. Purement indicatif : l'expiration réelle est
// toujours décidée par le serveur à chaque lecture.
export function tempsRestant(iso, maintenant = Date.now()) {
  const ms = iso ? new Date(iso).getTime() - maintenant : NaN;
  if (Number.isNaN(ms) || ms <= 0) return "Expirée";
  const minutes = Math.floor(ms / 60000);
  const j = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (j > 0) return `${j} j ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${Math.max(m, 1)} min`;
}
```

```jsx
// frontend/src/components/consultations/StatutConsultationBadge.jsx
import { useTheme } from "../../context/ThemeContext";

export default function StatutConsultationBadge({ statut }) {
  const theme = useTheme();
  const META = {
    en_cours: { label: "En cours de validation", bg: theme.accentBg, color: theme.warning, dot: theme.accent },
    validee: { label: "Validée", bg: theme.primaryBg, color: theme.primary, dot: theme.primary },
    expiree: { label: "Expirée", bg: theme.badgeBg, color: theme.textSecondary, dot: theme.textMuted },
    rejetee: { label: "Rejetée", bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
    revoquee: { label: "Révoquée", bg: theme.dangerBg, color: theme.danger, dot: theme.danger },
  };
  const meta = META[statut] || { label: statut, bg: theme.badgeBg, color: theme.badgeColor, dot: theme.textMuted };
  return (
    <span
      style={{
        background: meta.bg, color: meta.color, borderRadius: 999,
        padding: "4px 12px 4px 8px", fontSize: 11, fontWeight: 700,
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
}
```

- [ ] **Step 4 : tests de la liste et de la création (échouent)**

```jsx
// frontend/src/__tests__/Consultations.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import Consultations from "../pages/Consultations";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

const DEMANDE = {
  id: "1", reference: "C-00001/26", type_demande: "document", type_demande_label: "Document",
  description: "Contrat de 2019", statut: "validee", statut_effectif: "validee",
  demandeur_nom: "Ali Ben", created_at: "2026-10-08T09:00:00Z",
  date_echeance: "2099-01-01T00:00:00Z",
};

describe("Consultations", () => {
  beforeEach(() => jest.clearAllMocks());

  test("un GESTIONNAIRE voit ses demandes et le bouton Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockResolvedValueOnce({ data: { results: [DEMANDE] } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText("C-00001/26")).toBeInTheDocument());
    expect(screen.getByText("Contrat de 2019")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nouvelle demande/i })).toBeInTheDocument();
  });

  test("un traiteur voit le demandeur et pas le bouton Nouvelle demande", async () => {
    useAuth.mockReturnValue({ user: { role: "ADMIN", id: "u2", can_manage_consultations: true } });
    api.get.mockResolvedValueOnce({ data: { results: [DEMANDE] } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText(/Ali Ben/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Nouvelle demande/i })).not.toBeInTheDocument();
  });

  test("affiche l'erreur serveur plutôt qu'une liste vide muette", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockRejectedValueOnce({ response: { data: { detail: "Accès refusé." } } });
    render(<Consultations />);
    await waitFor(() => expect(screen.getByText("Accès refusé.")).toBeInTheDocument());
  });
});
```

```jsx
// frontend/src/__tests__/ConsultationNouvelle.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "GESTIONNAIRE", id: "u1" } }),
}));

import api from "../services/api";
import ConsultationNouvelle from "../pages/ConsultationNouvelle";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("ConsultationNouvelle", () => {
  beforeEach(() => jest.clearAllMocks());

  test("soumet une demande sans employé puis ouvre son détail", async () => {
    api.post.mockResolvedValueOnce({ data: { reference: "C-00007/26" } });
    render(<ConsultationNouvelle />);
    await userEvent.selectOptions(screen.getByLabelText(/Type de demande/i), "information");
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "Date d'embauche du directeur");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/consultations/demandes/", {
      type_demande: "information", description: "Date d'embauche du directeur",
    }));
    expect(mockNavigate).toHaveBeenCalledWith("/consultations/C-00007-26");
  });

  test("refuse d'envoyer une description vide", async () => {
    render(<ConsultationNouvelle />);
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/Décrivez ce que vous souhaitez consulter/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("affiche le texte réel de l'erreur serveur", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { employee: ["Cet employé n'est pas dans votre périmètre."] } } });
    render(<ConsultationNouvelle />);
    await userEvent.type(screen.getByLabelText(/Que souhaitez-vous consulter/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /Envoyer la demande/i }));
    expect(await screen.findByText(/n'est pas dans votre périmètre/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5 : pages**

```jsx
// frontend/src/pages/Consultations.jsx
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import { formatDateFR } from "../utils/formatDate";
import { TYPES_DEMANDE, slugDepuisReference, tempsRestant } from "../utils/consultations";

const STATUTS = [
  { value: "", label: "Tous les statuts" },
  { value: "en_cours", label: "En cours de validation" },
  { value: "validee", label: "Validée" },
  { value: "expiree", label: "Expirée" },
  { value: "rejetee", label: "Rejetée" },
  { value: "revoquee", label: "Révoquée" },
];

export default function Consultations() {
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const estTraiteur = !!user?.can_manage_consultations;
  const peutDemander = ["GESTIONNAIRE", "CONSULTANT"].includes(user?.role);
  const [demandes, setDemandes] = useState([]);
  const [statut, setStatut] = useState("");
  const [type, setType] = useState("");
  const [saisie, setSaisie] = useState("");
  const [recherche, setRecherche] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const charger = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statut) params.statut = statut;
      if (type) params.type_demande = type;
      if (recherche) params.q = recherche;
      const res = await api.get("/consultations/demandes/", { params });
      setDemandes(res.data.results || res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger les demandes.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statut, type, recherche]);

  useEffect(() => { charger(); }, [charger]);

  const champ = {
    padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.surface, color: theme.text, fontSize: 13, fontFamily: theme.fontFamily,
  };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>Consultations d'archives</h1>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginTop: 4 }}>
              {estTraiteur ? "Demandes à traiter et consultations en cours" : "Suivi de vos demandes de consultation"}
            </div>
          </div>
          {peutDemander && (
            <Link
              to="/consultations/nouvelle"
              style={{ background: "#fff", color: theme.primary, borderRadius: 9, padding: "10px 18px", fontWeight: 700, fontSize: 13, textDecoration: "none" }}
            >
              + Nouvelle demande
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 1000, margin: "0 auto" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); setRecherche(saisie.trim()); }}
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
        >
          <input
            aria-label="Rechercher"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Référence, description…"
            style={{ ...champ, flex: "1 1 200px" }}
          />
          <select aria-label="Statut" value={statut} onChange={(e) => setStatut(e.target.value)} style={champ}>
            {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} style={champ}>
            <option value="">Tous les types</option>
            {TYPES_DEMANDE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </form>

        {error && (
          <div style={{ color: theme.danger, background: theme.dangerBg, border: `1px solid ${theme.dangerBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}
        {loading && <div style={{ color: theme.textSecondary, fontSize: 13 }}>Chargement…</div>}
        {!loading && !error && demandes.length === 0 && (
          <div style={{ color: theme.textSecondary, fontSize: 13 }}>Aucune demande.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {demandes.map((d) => (
            <Link
              key={d.id}
              to={`/consultations/${slugDepuisReference(d.reference)}`}
              style={{
                display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "center",
                gap: 12, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12,
                padding: "14px 18px", textDecoration: "none", color: theme.text, boxShadow: theme.shadow,
              }}
            >
              <div style={{ minWidth: 110 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: theme.primary }}>{d.reference}</div>
                <div style={{ fontSize: 11, color: theme.textSecondary }}>{formatDateFR(d.created_at)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: theme.textSecondary }}>
                  {d.type_demande_label}
                </div>
                <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.description}
                </div>
                {estTraiteur && (
                  <div style={{ fontSize: 12, color: theme.textSecondary }}>Demandeur : {d.demandeur_nom}</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end", gap: 4 }}>
                <StatutConsultationBadge statut={d.statut_effectif} />
                {d.statut_effectif === "validee" && (
                  <span style={{ fontSize: 11, color: theme.textSecondary }}>
                    Expire dans {tempsRestant(d.date_echeance)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </PageBackground>
  );
}
```

```jsx
// frontend/src/pages/ConsultationNouvelle.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import { TYPES_DEMANDE, slugDepuisReference } from "../utils/consultations";

export default function ConsultationNouvelle() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [type, setType] = useState("document");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSearch = async (value) => {
    setQuery(value);
    setEmployee(null);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    try {
      const res = await api.get("/employees/search/", { params: { q: value } });
      setSuggestions(res.data || []);
    } catch {
      setSuggestions([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!description.trim()) { setError("Décrivez ce que vous souhaitez consulter."); return; }
    setSubmitting(true);
    try {
      const payload = { type_demande: type, description: description.trim() };
      if (employee) payload.employee = employee.id;
      const res = await api.post("/consultations/demandes/", payload);
      navigate(`/consultations/${slugDepuisReference(res.data.reference)}`);
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.detail || data?.error || data?.employee?.[0] || data?.description?.[0] ||
        data?.type_demande?.[0] || data?.non_field_errors?.[0] || "Impossible de créer la demande."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const champ = {
    width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    marginTop: 4, marginBottom: 14, fontSize: 14, background: theme.bg, color: theme.text,
    fontFamily: theme.fontFamily, boxSizing: "border-box",
  };
  const etiquette = { fontSize: 12, fontWeight: 700, color: theme.text };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Link to="/consultations" style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
            ← Retour aux demandes
          </Link>
          <h1 style={{ color: "#fff", fontSize: 24, margin: "8px 0 0", fontWeight: 800 }}>Nouvelle demande de consultation</h1>
        </div>
      </div>
      <div style={{ padding: contentPadding(isMobile), maxWidth: 560, margin: "0 auto" }}>
        <form onSubmit={handleSubmit} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, boxShadow: theme.shadowMd, padding: 24 }}>
          <label htmlFor="type-demande" style={etiquette}>Type de demande</label>
          <select id="type-demande" value={type} onChange={(e) => setType(e.target.value)} style={champ}>
            {TYPES_DEMANDE.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          <label htmlFor="description" style={etiquette}>Que souhaitez-vous consulter ?</label>
          <textarea
            id="description" rows={4} value={description} maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. : le contrat de travail signé en 2019"
            style={{ ...champ, resize: "vertical" }}
          />

          <label htmlFor="employe-search" style={etiquette}>Employé concerné (optionnel)</label>
          <div style={{ position: "relative" }}>
            <input
              id="employe-search" autoComplete="off" value={employee ? `${employee.prenom} ${employee.nom}` : query}
              onChange={(e) => handleSearch(e.target.value)} placeholder="Nom, prénom ou matricule…"
              style={{ ...champ, marginBottom: 14, borderColor: employee ? theme.primaryBorder : theme.border, background: employee ? theme.primaryBg : theme.bg }}
            />
            {suggestions.length > 0 && !employee && (
              <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", marginTop: -10, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8, boxShadow: theme.shadowLg, maxHeight: 240, overflowY: "auto" }}>
                {suggestions.map((s) => (
                  <div
                    key={s.id} role="option" aria-selected="false" tabIndex={0}
                    onClick={() => { setEmployee(s); setSuggestions([]); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { setEmployee(s); setSuggestions([]); } }}
                    style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, color: theme.text, borderBottom: `1px solid ${theme.borderLight}` }}
                  >
                    {s.prenom} {s.nom} <span style={{ color: theme.textSecondary }}>· {s.matricule}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: 11, marginTop: -8, marginBottom: 14 }}>
            Seuls les employés de votre périmètre peuvent être sélectionnés.
          </div>

          {error && (
            <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          <button
            type="submit" disabled={submitting} className="btn-lift"
            style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 9, padding: "11px 22px", fontWeight: 700, fontSize: 13, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1, width: isMobile ? "100%" : "auto" }}
          >
            {submitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      </div>
    </PageBackground>
  );
}
```

- [ ] **Step 6 : routes** — `App.js`

Après la ligne `const AttestationDetail = lazy(...)` :

```js
const Consultations = lazy(() => import("./pages/Consultations"));
const ConsultationNouvelle = lazy(() => import("./pages/ConsultationNouvelle"));
const ConsultationDetail = lazy(() => import("./pages/ConsultationDetail"));
```

Après la route `/attestations/:ref` (même niveau) :

```jsx
          <Route
            path="/consultations"
            element={
              <ProtectedRoute
                allowedRoles={["ADMIN", "SUPERADMIN", "GESTIONNAIRE", "CONSULTANT"]}
                requireFn={(u) => u?.role !== "ADMIN" || u?.can_manage_consultations}
              >
                <Consultations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultations/nouvelle"
            element={
              <ProtectedRoute allowedRoles={["GESTIONNAIRE", "CONSULTANT"]}>
                <ConsultationNouvelle />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultations/:ref"
            element={
              <ProtectedRoute
                allowedRoles={["ADMIN", "SUPERADMIN", "GESTIONNAIRE", "CONSULTANT"]}
                requireFn={(u) => u?.role !== "ADMIN" || u?.can_manage_consultations}
              >
                <ConsultationDetail />
              </ProtectedRoute>
            }
          />
```

(`ConsultationDetail` est créé en Task 11 ; en attendant, ne pas lancer `npm start`/le build entre les deux tâches, ou créer un stub `export default function ConsultationDetail() { return null; }` remplacé en Task 11.)

- [ ] **Step 7 : Navbar** — `components/Navbar.jsx`

Après `const canSeeAttestations = ...` :

```jsx
  const [pendingConsultations, setPendingConsultations] = useState(0);
  // Demandeurs (GESTIONNAIRE/CONSULTANT) et traiteurs uniquement — un ADMIN
  // non chargé des consultations n'a ni lien ni badge.
  const canSeeConsultations =
    ["GESTIONNAIRE", "CONSULTANT"].includes(user?.role) || !!user?.can_manage_consultations;

  useEffect(() => {
    // Badge « N à traiter » : traiteurs uniquement (pour un demandeur, le
    // paramètre `pending` n'a pas de sens côté serveur).
    if (!user?.can_manage_consultations) { setPendingConsultations(0); return; }
    let cancelled = false;
    api.get("/consultations/demandes/", { params: { pending: 1 } })
      .then((res) => {
        if (cancelled) return;
        setPendingConsultations(res.data?.count ?? (res.data?.results || res.data || []).length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Recharge à chaque navigation, comme le badge des attestations.
  }, [user?.can_manage_consultations, location.pathname]);
```

Dans `navLinks`, après l'entrée « Attestations » :

```jsx
    {
      path: "/consultations", label: "Consultations",
      show: canSeeConsultations,
    },
```

Aux **deux** endroits où le badge des attestations est rendu (`item.path === "/attestations" && pendingAttestations > 0 && (...)`, ~l.224 et ~l.660), ajouter juste après chaque bloc :

```jsx
                {item.path === "/consultations" && pendingConsultations > 0 && (
                  <span style={{
                    marginLeft: 6, background: theme.danger, color: "#fff",
                    borderRadius: 999, fontSize: 10, fontWeight: 700,
                    padding: "1px 6px", display: "inline-block",
                  }}>
                    {pendingConsultations}
                  </span>
                )}
```

- [ ] **Step 8 : drapeau dans `/users`** — `pages/Users.jsx`

1. État initial du formulaire (l.61) et réinitialisation (l.186) : ajouter `charge_consultation: false,` à côté de `charge_attestation`.
2. Payload de création (l.161) : ajouter
   `charge_consultation: form.role === "ADMIN" ? !!form.charge_consultation : false,`
3. Sous le bloc `form.role === "ADMIN"` de la case « Chargé des attestations de travail » (l.~410-424), ajouter :

```jsx
                {form.role === "ADMIN" && (
                  <div>
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        name="charge_consultation"
                        checked={!!form.charge_consultation}
                        onChange={handleChange}
                      />
                      Chargé des consultations d'archives
                    </label>
                    <div style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
                      Reçoit, valide et livre les demandes de consultation de documents archivés (/consultations). Un Super-administrateur y a toujours accès, quel que soit ce réglage.
                    </div>
                  </div>
                )}
```

4. Après `toggleChargeAttestation` (l.~209) :

```jsx
  const toggleChargeConsultation = async (targetUser) => {
    try {
      await api.patch(`/admin-users/${targetUser.id}/`, { charge_consultation: !targetUser.charge_consultation });
      fetchUsers(true);
    } catch (err) {
      console.error(err);
    }
  };
```

5. Juste après le bouton « Attestations ✓/✗ » (l.~752-767), même condition :

```jsx
                          {u.role === "ADMIN" && user?.role === "SUPERADMIN" && (
                            <button
                              onClick={() => toggleChargeConsultation(u)}
                              title="Reçoit, valide et livre les demandes de consultation d'archives (/consultations)"
                              style={{
                                background: u.charge_consultation ? theme.primaryBg : theme.bg,
                                border: `1px solid ${u.charge_consultation ? theme.primaryBorder : theme.border}`,
                                color: u.charge_consultation ? theme.primary : theme.textSecondary,
                                borderRadius: 8,
                                padding: "5px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              {u.charge_consultation ? "Consultations ✓" : "Consultations ✗"}
                            </button>
                          )}
```

- [ ] **Step 9 : tests**

Run: `cd frontend && npm test -- --watchAll=false consultationsUtils Consultations ConsultationNouvelle Navbar Users`
Expected: PASS. Si `Navbar.test.jsx` ou `Users.test.jsx` échouent parce que `api.get` n'est pas mocké pour la nouvelle URL, corriger le mock du test concerné (ajouter la branche `/consultations/demandes/`), jamais le composant.

- [ ] **Step 10 : commit**

```bash
git add frontend/src
git commit -m "feat(consultations): liste, nouvelle demande, routes, navbar et drapeau dans /users"
```

---

### Task 11 : frontend — détail, viewer sécurisé, panneau de traitement

**Files:**
- Create: `frontend/src/pages/ConsultationDetail.jsx`, `frontend/src/components/consultations/TraiterPanel.jsx`
- Test: `frontend/src/__tests__/ConsultationDetail.test.jsx`
- Vérifier (sans modifier sauf si le test échoue) : `frontend/src/components/SecureDocViewer.jsx`

**Interfaces:**
- Consumes: `GET /consultations/demandes/<slug>/`, `POST .../valider|rejeter|revoquer|prolonger/`, `GET .../fichiers/<id>/voir|telecharger/` (blob), `GET /employees/<employee>/documents/` (liste de documents, chacun avec `type_document_label` et `fichiers[{id,file_name,is_active}]`), `usePrompt`/`useConfirm`, `SecureDocViewer({ url, mimeType, fileName })`.
- Produces: page `/consultations/:ref` ; `TraiterPanel({ demande, onDone })` où `onDone()` rafraîchit **silencieusement** la page parente.
- Règles d'affichage : le viewer n'apparaît que si `statut_effectif === "validee"` ; à l'expiration, un message « Consultation expirée le … » le remplace ; le bouton « Télécharger » n'existe que si `demande.telechargement_autorise` (ou pour un traiteur) ; la révocation exige de **saisir la référence** (`usePrompt`).

- [ ] **Step 1 : vérifier que le viewer n'expose ni téléchargement ni impression**

Run: `cd frontend/src && grep -n -i "download\|print\|window.open\|href=" components/SecureDocViewer.jsx`
Expected: aucune ligne (le viewer n'a ni bouton de téléchargement ni d'impression ; le clic droit est déjà bloqué sur l'image). S'il en sort une, la neutraliser derrière une prop `restreint` (défaut `false`) passée à `true` par `ConsultationDetail`, et ajouter un test dans `SecureDocViewer.test.jsx`.

- [ ] **Step 2 : tests qui échouent**

```jsx
// frontend/src/__tests__/ConsultationDetail.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import { MemoryRouter, Route, Routes } from "react-router-dom";

jest.mock("../services/api", () => ({
  __esModule: true, default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);
jest.mock("../components/SecureDocViewer", () => (props) => (
  <div data-testid="viewer">{props.fileName}</div>
));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));

const mockPrompt = jest.fn();
const mockConfirm = jest.fn();
jest.mock("../components/ConfirmDialog", () => ({
  useConfirm: () => ({ confirm: mockConfirm, ConfirmDialog: null }),
  usePrompt: () => ({ prompt: mockPrompt, PromptDialog: null }),
}));

import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ConsultationDetail from "../pages/ConsultationDetail";

const render = () =>
  rtlRender(
    <MemoryRouter initialEntries={["/consultations/C-00001-26"]}>
      <Routes><Route path="/consultations/:ref" element={<ConsultationDetail />} /></Routes>
    </MemoryRouter>,
    { wrapper: ThemeProvider },
  );

const BASE = {
  id: "d1", reference: "C-00001/26", type_demande: "document", type_demande_label: "Document",
  description: "Contrat de 2019", employee: null, employee_nom: null,
  demandeur_nom: "Ali Ben", traite_par_nom: null, motif_rejet: "",
  created_at: "2026-10-08T09:00:00Z", date_validation: null, date_echeance: null,
  nb_prolongations: 0, telechargement_autorise: false, fichiers: [],
  statut: "en_cours", statut_effectif: "en_cours",
};
const VALIDEE = {
  ...BASE, statut: "validee", statut_effectif: "validee",
  date_validation: "2026-10-08T10:00:00Z", date_echeance: "2099-01-01T10:00:00Z",
  fichiers: [{ id: "f1", file_name: "scan.pdf", mime_type: "application/pdf", file_size: 1000, origine: "scan_externe", purge: false }],
};

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:test");
  global.URL.revokeObjectURL = jest.fn();
  api.get.mockImplementation((url) => {
    if (url.endsWith("/voir/")) return Promise.resolve({ data: new Blob(["x"]) });
    return Promise.resolve({ data: BASE });
  });
});

const connecte = (user, demande) => {
  useAuth.mockReturnValue({ user });
  api.get.mockImplementation((url) => {
    if (url.includes("/voir/") || url.includes("/telecharger/")) return Promise.resolve({ data: new Blob(["x"]) });
    if (url.includes("/documents/")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: demande });
  });
};

describe("ConsultationDetail", () => {
  test("le demandeur voit le viewer tant que la consultation est valide", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, VALIDEE);
    render();
    expect(await screen.findByTestId("viewer")).toHaveTextContent("scan.pdf");
  });

  test("pas de bouton Télécharger quand le traiteur ne l'a pas autorisé", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, VALIDEE);
    render();
    await screen.findByTestId("viewer");
    expect(screen.queryByRole("button", { name: /Télécharger/i })).not.toBeInTheDocument();
  });

  test("bouton Télécharger quand le téléchargement est autorisé", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, { ...VALIDEE, telechargement_autorise: true });
    render();
    await screen.findByTestId("viewer");
    expect(screen.getByRole("button", { name: /Télécharger/i })).toBeInTheDocument();
  });

  test("consultation expirée : message à la place du viewer", async () => {
    connecte(
      { role: "GESTIONNAIRE", id: "u1" },
      { ...VALIDEE, statut_effectif: "expiree", date_echeance: "2026-10-01T10:00:00Z", fichiers: [] },
    );
    render();
    expect(await screen.findByText(/Consultation expirée le/i)).toBeInTheDocument();
    expect(screen.queryByTestId("viewer")).not.toBeInTheDocument();
  });

  test("le demandeur n'a aucun bouton de traitement", async () => {
    connecte({ role: "GESTIONNAIRE", id: "u1" }, BASE);
    render();
    await screen.findByText("C-00001/26");
    expect(screen.queryByRole("button", { name: /Valider/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rejeter/i })).not.toBeInTheDocument();
  });

  test("le traiteur voit le panneau de traitement d'une demande en cours", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, BASE);
    render();
    expect(await screen.findByRole("button", { name: /Valider et envoyer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rejeter/i })).toBeInTheDocument();
  });

  test("rejet : le motif est demandé puis envoyé", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, BASE);
    mockPrompt.mockResolvedValueOnce("Hors périmètre");
    api.post.mockResolvedValueOnce({ data: { ...BASE, statut: "rejetee", statut_effectif: "rejetee" } });
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Rejeter/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/consultations/demandes/C-00001-26/rejeter/", { motif_rejet: "Hors périmètre" },
    ));
  });

  test("révocation : exige de saisir la référence", async () => {
    connecte({ role: "ADMIN", id: "u2", can_manage_consultations: true }, VALIDEE);
    mockPrompt.mockResolvedValueOnce("mauvaise-saisie");
    render();
    await userEvent.click(await screen.findByRole("button", { name: /Révoquer/i }));
    await waitFor(() => expect(mockPrompt).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();           // saisie incorrecte : rien n'est envoyé

    mockPrompt.mockResolvedValueOnce("C-00001/26");
    api.post.mockResolvedValueOnce({ data: { ...VALIDEE, statut: "revoquee", statut_effectif: "revoquee" } });
    await userEvent.click(screen.getByRole("button", { name: /Révoquer/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/consultations/demandes/C-00001-26/revoquer/", {},
    ));
  });

  test("affiche le texte réel d'une erreur serveur de chargement", async () => {
    useAuth.mockReturnValue({ user: { role: "GESTIONNAIRE", id: "u1" } });
    api.get.mockRejectedValueOnce({ response: { status: 404, data: { detail: "Introuvable." } } });
    render();
    expect(await screen.findByText(/Introuvable/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3 : constater l'échec**

Run: `cd frontend && npm test -- --watchAll=false ConsultationDetail`
Expected: FAIL (module `../pages/ConsultationDetail` introuvable).

- [ ] **Step 4 : panneau de traitement**

```jsx
// frontend/src/components/consultations/TraiterPanel.jsx
import { useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { DUREES, slugDepuisReference } from "../../utils/consultations";

const messageErreur = (err, defaut) => {
  const data = err.response?.data;
  if (!data) return defaut;
  if (typeof data === "string") return data;
  return (
    data.detail || data.error ||
    [].concat(data.fichiers || data.duree_heures || data.copier_fichiers || data.motif_rejet || data.non_field_errors || [])[0] ||
    (Array.isArray(data) ? data[0] : null) || defaut
  );
};

export default function TraiterPanel({ demande, onDone }) {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const slug = slugDepuisReference(demande.reference);
  const [duree, setDuree] = useState(24);
  const [telechargement, setTelechargement] = useState(false);
  const [fichiers, setFichiers] = useState([]);
  const [archives, setArchives] = useState([]);
  const [copies, setCopies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Documents déjà archivés de l'employé : proposés à la COPIE (l'original
  // n'est jamais exposé au demandeur).
  useEffect(() => {
    if (!demande.employee) return;
    api.get(`/employees/${demande.employee}/documents/`)
      .then((res) => {
        const liste = Array.isArray(res.data) ? res.data : res.data.results || [];
        setArchives(liste.flatMap((doc) =>
          (doc.fichiers || []).filter((f) => f.is_active !== false).map((f) => ({
            id: f.id, label: `${doc.type_document_label} — ${f.file_name}`,
          }))
        ));
      })
      .catch(() => setArchives([]));
  }, [demande.employee]);

  const basculerCopie = (id) =>
    setCopies((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const valider = async () => {
    setError("");
    if (fichiers.length === 0 && copies.length === 0) {
      setError("Joignez au moins un fichier (scan ou document archivé).");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("duree_heures", String(duree));
      form.append("telechargement_autorise", telechargement ? "true" : "false");
      fichiers.forEach((f) => form.append("fichiers", f));
      copies.forEach((id) => form.append("copier_fichiers", id));
      await api.post(`/consultations/demandes/${slug}/valider/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await onDone();
    } catch (err) {
      setError(messageErreur(err, "Impossible de valider la demande."));
    } finally {
      setBusy(false);
    }
  };

  const rejeter = async () => {
    setError("");
    const motif = await prompt("Motif du rejet (obligatoire) :", "");
    if (motif === null) return;
    if (!motif.trim()) { setError("Le motif du rejet est obligatoire."); return; }
    setBusy(true);
    try {
      await api.post(`/consultations/demandes/${slug}/rejeter/`, { motif_rejet: motif.trim() });
      await onDone();
    } catch (err) {
      setError(messageErreur(err, "Impossible de rejeter la demande."));
    } finally {
      setBusy(false);
    }
  };

  const champ = {
    padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`,
    background: theme.bg, color: theme.text, fontSize: 13, fontFamily: theme.fontFamily,
  };

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, boxShadow: theme.shadow }}>
      {PromptDialog}
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: theme.textSecondary, marginBottom: 12 }}>
        Traiter la demande
      </div>

      <label htmlFor="fichiers-scan" style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
        Scan à envoyer (PDF, JPEG, PNG, TIFF — 20 Mo max)
      </label>
      <input
        id="fichiers-scan" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff"
        onChange={(e) => setFichiers(Array.from(e.target.files || []))}
        style={{ ...champ, display: "block", width: "100%", boxSizing: "border-box", margin: "4px 0 14px" }}
      />

      {demande.employee && archives.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
            Ou copier un document archivé de {demande.employee_nom}
          </div>
          {archives.map((a) => (
            <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text, marginBottom: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={copies.includes(a.id)} onChange={() => basculerCopie(a.id)} />
              {a.label}
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: theme.text }}>
          Durée de la consultation{" "}
          <select aria-label="Durée de la consultation" value={duree} onChange={(e) => setDuree(Number(e.target.value))} style={{ ...champ, marginLeft: 6 }}>
            {DUREES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.text, cursor: "pointer" }}>
          <input type="checkbox" checked={telechargement} onChange={(e) => setTelechargement(e.target.checked)} />
          Autoriser le téléchargement
        </label>
      </div>
      {telechargement && (
        <div style={{ color: theme.warning, fontSize: 12, marginBottom: 12 }}>
          Une copie téléchargée sort de l'application : seul le filigrane (nom, référence, date) permettra d'en identifier l'origine.
        </div>
      )}

      {error && (
        <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button" onClick={valider} disabled={busy}
          style={{ background: theme.primary, color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? "Envoi…" : "Valider et envoyer"}
        </button>
        <button
          type="button" onClick={rejeter} disabled={busy}
          style={{ background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer" }}
        >
          Rejeter
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : page de détail**

```jsx
// frontend/src/pages/ConsultationDetail.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { heroPadding, contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import Breadcrumb from "../components/employees/Breadcrumb";
import SecureDocViewer from "../components/SecureDocViewer";
import StatutConsultationBadge from "../components/consultations/StatutConsultationBadge";
import TraiterPanel from "../components/consultations/TraiterPanel";
import { usePrompt } from "../components/ConfirmDialog";
import { DUREES, formatDateHeure, tempsRestant } from "../utils/consultations";

const Ligne = ({ label, children, theme }) => (
  <div style={{ display: "flex", gap: 12, padding: "6px 0", fontSize: 13 }}>
    <div style={{ width: 150, flexShrink: 0, color: theme.textSecondary, fontWeight: 600 }}>{label}</div>
    <div style={{ color: theme.text, minWidth: 0, overflowWrap: "anywhere" }}>{children || "—"}</div>
  </div>
);

const Etape = ({ titre, date, atteinte, theme }) => (
  <div style={{ flex: 1, textAlign: "center" }}>
    <div style={{
      width: 26, height: 26, margin: "0 auto 6px", borderRadius: "50%",
      background: atteinte ? theme.primary : theme.surface,
      border: `2px solid ${atteinte ? theme.primary : theme.border}`,
    }} />
    <div style={{ fontSize: 11, fontWeight: 700, color: atteinte ? theme.text : theme.textMuted }}>{titre}</div>
    <div style={{ fontSize: 11, color: theme.textSecondary }}>{date ? formatDateHeure(date) : "—"}</div>
  </div>
);

export default function ConsultationDetail() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useIsMobile();
  const { prompt, PromptDialog } = usePrompt();
  const estTraiteur = !!user?.can_manage_consultations;
  const [demande, setDemande] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [fichierId, setFichierId] = useState(null);
  const [vue, setVue] = useState(null); // { url, mime, nom }
  const [dureeProlongation, setDureeProlongation] = useState(24);
  const urlCourante = useRef(null);

  const charger = useCallback(async (silent = false) => {
    try {
      const res = await api.get(`/consultations/demandes/${ref}/`);
      setDemande(res.data);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger la demande.");
    }
  }, [ref]);

  useEffect(() => { charger(); }, [charger]);

  const consultable = demande?.statut_effectif === "validee" && (demande.fichiers || []).length > 0;

  // Sélectionne le premier fichier dès que la consultation est ouverte.
  useEffect(() => {
    if (consultable && !fichierId) setFichierId(demande.fichiers[0].id);
    if (!consultable) setFichierId(null);
  }, [consultable, demande, fichierId]);

  // Charge le fichier sélectionné en blob authentifié (jamais de lien direct).
  useEffect(() => {
    if (!consultable || !fichierId) { setVue(null); return undefined; }
    const fichier = demande.fichiers.find((f) => f.id === fichierId);
    if (!fichier) return undefined;
    let annule = false;
    api.get(`/consultations/demandes/${ref}/fichiers/${fichierId}/voir/`, { responseType: "blob" })
      .then((res) => {
        if (annule) return;
        const url = URL.createObjectURL(res.data);
        if (urlCourante.current) URL.revokeObjectURL(urlCourante.current);
        urlCourante.current = url;
        setVue({ url, mime: res.data.type || fichier.mime_type, nom: fichier.file_name });
      })
      .catch(() => { if (!annule) { setVue(null); charger(true); } }); // 403 : probablement expirée entre-temps
    return () => { annule = true; };
  }, [consultable, fichierId, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (urlCourante.current) URL.revokeObjectURL(urlCourante.current); }, []);

  const telecharger = async () => {
    setActionError("");
    try {
      const res = await api.get(`/consultations/demandes/${ref}/fichiers/${fichierId}/telecharger/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = vue?.nom || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Téléchargement impossible : la consultation a peut-être expiré.");
      charger(true);
    }
  };

  const agir = async (action, corps = {}) => {
    setActionError("");
    try {
      await api.post(`/consultations/demandes/${ref}/${action}/`, corps);
      await charger(true); // rafraîchissement silencieux : la page ne se démonte pas
    } catch (err) {
      const data = err.response?.data;
      setActionError(
        data?.detail || data?.error || [].concat(data?.duree_heures || data?.non_field_errors || [])[0] ||
        (Array.isArray(data) ? data[0] : null) || "Action impossible.",
      );
    }
  };

  const revoquer = async () => {
    const saisie = await prompt(
      `Révoquer coupe immédiatement l'accès du demandeur. Saisissez la référence ${demande.reference} pour confirmer :`, "",
    );
    if (saisie === null) return;
    if (saisie.trim() !== demande.reference) {
      setActionError("La référence saisie ne correspond pas : révocation annulée.");
      return;
    }
    await agir("revoquer");
  };

  const annuler = async () => {
    setActionError("");
    try {
      await api.delete(`/consultations/demandes/${ref}/`);
      navigate("/consultations");
    } catch (err) {
      setActionError(err.response?.data?.detail || "Impossible d'annuler la demande.");
    }
  };

  if (error) {
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: contentPadding(isMobile), maxWidth: 800, margin: "0 auto", color: theme.danger }}>{error}</div>
      </PageBackground>
    );
  }
  if (!demande) {
    return (
      <PageBackground style={{ fontFamily: theme.fontFamily }}>
        <Navbar />
        <div style={{ padding: contentPadding(isMobile), color: theme.textSecondary }}>Chargement…</div>
      </PageBackground>
    );
  }

  const peutAnnuler = !estTraiteur && demande.statut === "en_cours";
  const carte = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 20, boxShadow: theme.shadow, marginBottom: 16 };

  return (
    <PageBackground style={{ fontFamily: theme.fontFamily }}>
      <Navbar />
      {PromptDialog}
      <div style={{ background: theme.directionGrad, padding: heroPadding(isMobile) }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <Breadcrumb
            variant="hero"
            items={[{ label: "Consultations", onClick: () => navigate("/consultations") }, { label: demande.reference }]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            <h1 style={{ color: "#fff", fontSize: 24, margin: 0, fontWeight: 800 }}>{demande.reference}</h1>
            <StatutConsultationBadge statut={demande.statut_effectif} />
          </div>
        </div>
      </div>

      <div style={{ padding: contentPadding(isMobile), maxWidth: 900, margin: "0 auto" }}>
        <div style={carte}>
          <div style={{ display: "flex" }}>
            <Etape titre="Demande" date={demande.created_at} atteinte theme={theme} />
            <Etape titre="Validation" date={demande.date_validation} atteinte={!!demande.date_validation} theme={theme} />
            <Etape titre="Échéance" date={demande.date_echeance} atteinte={demande.statut_effectif === "expiree"} theme={theme} />
          </div>
          {demande.statut_effectif === "validee" && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: theme.primary, fontWeight: 700 }}>
              Expire dans {tempsRestant(demande.date_echeance)}
            </div>
          )}
          {demande.statut === "rejetee" && (
            <div style={{ marginTop: 12, color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
              Demande rejetée{demande.motif_rejet ? ` : ${demande.motif_rejet}` : "."}
            </div>
          )}
          {demande.statut === "revoquee" && (
            <div style={{ marginTop: 12, color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
              Consultation révoquée.
            </div>
          )}
        </div>

        <div style={carte}>
          <Ligne label="Type" theme={theme}>{demande.type_demande_label}</Ligne>
          <Ligne label="Description" theme={theme}>{demande.description}</Ligne>
          {demande.employee_nom && <Ligne label="Employé" theme={theme}>{demande.employee_nom} ({demande.employee_matricule})</Ligne>}
          <Ligne label="Demandeur" theme={theme}>{demande.demandeur_nom}</Ligne>
          <Ligne label="Traitée par" theme={theme}>{demande.traite_par_nom}</Ligne>
          <Ligne label="Date de validation" theme={theme}>{demande.date_validation && formatDateHeure(demande.date_validation)}</Ligne>
          <Ligne label="Échéance" theme={theme}>
            {demande.date_echeance && formatDateHeure(demande.date_echeance)}
            {demande.nb_prolongations > 0 && ` (prolongée ${demande.nb_prolongations} fois)`}
          </Ligne>
        </div>

        {actionError && (
          <div style={{ color: theme.danger, background: theme.dangerBg, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
            {actionError}
          </div>
        )}

        {peutAnnuler && (
          <button type="button" onClick={annuler} style={{ background: theme.surface, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 16 }}>
            Annuler ma demande
          </button>
        )}

        {estTraiteur && demande.statut === "en_cours" && <TraiterPanel demande={demande} onDone={() => charger(true)} />}

        {demande.statut === "validee" && estTraiteur && (
          <div style={{ ...carte, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select aria-label="Durée de prolongation" value={dureeProlongation} onChange={(e) => setDureeProlongation(Number(e.target.value))} style={{ padding: "9px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: 13 }}>
              {DUREES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button type="button" onClick={() => agir("prolonger", { duree_heures: dureeProlongation })} style={{ background: theme.primaryBg, color: theme.primary, border: `1px solid ${theme.primaryBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Prolonger
            </button>
            {demande.statut_effectif === "validee" && (
              <button type="button" onClick={revoquer} style={{ background: theme.dangerBg, color: theme.danger, border: `1px solid ${theme.dangerBorder}`, borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Révoquer
              </button>
            )}
          </div>
        )}

        {demande.statut_effectif === "expiree" && !estTraiteur && (
          <div style={{ ...carte, color: theme.textSecondary, textAlign: "center" }}>
            Consultation expirée le {formatDateHeure(demande.date_echeance)}. Le document n'est plus consultable.
          </div>
        )}

        {consultable && (
          <div style={{ ...carte, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", borderBottom: `1px solid ${theme.border}` }}>
              {demande.fichiers.map((f) => (
                <button
                  key={f.id} type="button" onClick={() => setFichierId(f.id)}
                  style={{ background: f.id === fichierId ? theme.primaryBg : theme.surface, color: f.id === fichierId ? theme.primary : theme.textSecondary, border: `1px solid ${f.id === fichierId ? theme.primaryBorder : theme.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {f.file_name}
                </button>
              ))}
              {(demande.telechargement_autorise || estTraiteur) && (
                <button type="button" onClick={telecharger} style={{ marginLeft: "auto", background: theme.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Télécharger
                </button>
              )}
            </div>
            <div style={{ height: isMobile ? 480 : 640, display: "flex" }}>
              {vue ? (
                <SecureDocViewer url={vue.url} mimeType={vue.mime} fileName={vue.nom} />
              ) : (
                <div style={{ margin: "auto", color: theme.textSecondary, fontSize: 13 }}>Chargement du document…</div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageBackground>
  );
}
```

- [ ] **Step 6 : tests**

Run: `cd frontend && npm test -- --watchAll=false ConsultationDetail Consultation SecureDocViewer Navbar Users`
Expected: PASS. En cas d'échec sur « bouton Télécharger », vérifier que `telecharger` est bien conditionné par `demande.telechargement_autorise || estTraiteur` (jamais par l'UI seule : le serveur refuse de toute façon sans l'autorisation).

- [ ] **Step 7 : vérification dans un vrai navigateur** (la règle « tester l'UI avant de conclure »)

Run (3 terminaux) : backend `python manage.py runserver`, frontend `npm start`, puis dérouler à la main : (1) compte GESTIONNAIRE → créer une demande ; (2) compte ADMIN coché « Consultations » → badge « 1 » dans la navbar, ouvrir la demande, envoyer un PDF avec durée 1 h et sans téléchargement ; (3) revenir en GESTIONNAIRE → le PDF s'affiche avec le filigrane, aucun bouton de téléchargement ; (4) en base, mettre `date_echeance` dans le passé et recharger → message « Consultation expirée » et l'appel `/voir/` répond 403 (onglet Réseau) ; (5) tester la révocation avec une mauvaise puis la bonne saisie de référence. Noter tout écart dans le PR plutôt que de le masquer.

- [ ] **Step 8 : commit**

```bash
git add frontend/src
git commit -m "feat(consultations): page de détail, viewer sécurisé, traitement, prolongation, révocation"
```

---

### Task 12 : documentation, journal de sécurité et vérification finale

**Files:**
- Create: `docs/fonctionnel/consultations.md`
- Modify: `CLAUDE.md` (index des chantiers + routes + rôle du drapeau), `securite.md` (nouveau point), `docs/fonctionnel/notifications.md` (tableau des sources + tâches planifiées)
- Test: suites complètes backend et frontend

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: documentation à jour ; aucun code applicatif.

- [ ] **Step 1 : `docs/fonctionnel/consultations.md`**

Créer le fichier avec : l'en-tête « À lire avant de toucher à l'app consultations (workflow, livraison de fichiers, filigrane, expiration, purge) » ; puis des sections reprenant, avec les dates du jour, **sans copier le code** : modèle (`DemandeConsultation`, `ConsultationFichier`, compteur), workflow et statut dérivé « Expirée », contrôle d'accès à chaque lecture (ordre des 3 vérifications, 404/403/410), filigrane incrusté et sa limite (capture d'écran), mesure de performance relevée à la Task 5 Step 5 (durée réelle pour 50 pages), rappels (cron à créer : `manage.py notifier_echeances_consultation` toutes les 15 minutes), prolongation (plafond, délai de grâce), purge (commande manuelle, garde-fous, lien vers l'incident du 2026-07-22), permissions (`charge_consultation`, qui crée / qui traite), audit (liste des 8 actions), notifications (messages neutres), **approches écartées** (généraliser `attestations`, stocker en `EmployeeDocument`) avec la raison, et « limite connue : fichier orphelin si la base échoue après l'écriture disque ».

- [ ] **Step 2 : `CLAUDE.md`**

Dans « Index de la documentation par chantier », ajouter :

```markdown
- [`docs/fonctionnel/consultations.md`](docs/fonctionnel/consultations.md) — À lire avant de toucher à l'app consultations (demandes de consultation d'archives : workflow, livraison de fichiers par l'app, filigrane, expiration serveur, prolongation, purge manuelle).
```

Dans « Rôles utilisateurs », sous `GESTIONNAIRE`, ajouter une ligne : `CONSULTANT` et `GESTIONNAIRE` peuvent aussi créer des demandes de consultation d'archives (`/consultations`) ; seul un SUPERADMIN, ou un ADMIN avec `charge_consultation`, les traite. Dans le tableau des routes, ajouter `/consultations`, `/consultations/nouvelle`, `/consultations/:ref`. Dans « Règles critiques », ajouter : « Un fichier livré par `consultations` ne se sert jamais sans `controler_acces()` (expiration vérifiée serveur à chaque lecture) et jamais non filigrané à un demandeur — voir `consultations.md`. »

- [ ] **Step 3 : `securite.md`**

Lire la fin du fichier pour reprendre son format et son numéro (dernier point actuel + 1), puis ajouter un point « Consultations d'archives » : contrôle d'accès à chaque lecture, 404 pour les tiers, expiration non contournable (statut dérivé), filigrane attribuant toute fuite, échec fermé du filigrane, téléchargement décidé par le traiteur et audité, audit de chaque consultation, purge sous garde-fous, séparation demandeur/traiteur, tests d'intégration sur de vraies routes. Y consigner la **limite assumée** (capture/photo d'écran) et la **dette** : pas de rappel de planification en production tant que le cron n'est pas créé.

- [ ] **Step 4 : `docs/fonctionnel/notifications.md`**

Ajouter au tableau « Sources d'événements branchées » les lignes Consultations (nouvelle demande → traiteurs ; validée/rejetée/révoquée/prolongée → demandeur ; échéance proche → demandeur + traiteur) et, dans « Tâches planifiées à créer en production », la commande `notifier_echeances_consultation` (toutes les 15 minutes).

- [ ] **Step 5 : suite backend complète**

Run: `cd backend && pytest -q`
Expected: tout passe (les ~188 tests existants + les nouveaux). Toute régression sur `accounts`/`employees`/`audit`/`notifications` est à corriger avant de continuer ; ne jamais désactiver un test existant.

- [ ] **Step 6 : suite frontend complète**

Run: `cd frontend && npm test -- --watchAll=false`
Expected: PASS. Si des échecs existaient **avant** ce chantier (voir la note de `documents.md` sur la baseline de tests en échec), comparer avec `git stash`/`main` avant de conclure que les nouveaux tests en sont la cause, et le dire explicitement dans le compte rendu.

- [ ] **Step 7 : revue de code et de sécurité**

Lancer les agents `ecc:code-reviewer`, `ecc:django-reviewer`, `ecc:python-reviewer` et `ecc:security-reviewer` sur `git diff main...HEAD` (le chantier touche authentification, permissions, fichiers et données personnelles : la revue de sécurité est obligatoire). Corriger tout point CRITICAL/HIGH ; consigner les MEDIUM restants dans `securite.md`.

- [ ] **Step 8 : commit final**

```bash
git add CLAUDE.md securite.md docs
git commit -m "docs(consultations): documentation fonctionnelle, journal de sécurité, notifications"
```

---

## Auto-revue du plan (couverture de la spec)

| Exigence de la spec | Tâche |
|---|---|
| Demandeur = GESTIONNAIRE/CONSULTANT, pas de nouveau rôle | 1, 3 |
| Traiteur = SUPERADMIN ou ADMIN avec `charge_consultation` | 1, 3, 10 (UI `/users`) |
| Employé optionnel + description libre, scoping si employé | 3 |
| Référence `C-NNNNN/AA`, date, type, statut, validation, échéance | 2, 3, 11 |
| Workflow En cours / Validée / Rejetée / Révoquée ; « Expirée » dérivée | 2, 4 |
| Séparation demandeur/traiteur | 4 (`_verifier_traiteur_distinct`), 3 (permissions) |
| Livraison par scan externe **ou** copie d'un archivé, jamais l'original | 4 |
| Lecture seule par défaut, téléchargement au choix par demande | 4, 6, 11 |
| Accès vérifié à chaque requête (demandeur/statut/échéance), 404 / 403 / 410 | 6 |
| Throttle `consultation` | 6 |
| Filigrane incrusté, original jamais servi au demandeur, échec fermé | 5, 6 |
| Audit de chaque création, statut, livraison, lecture, téléchargement, prolongation, purge | 3, 4, 6, 7, 9 |
| Notifications neutres (nouvelle, validée, rejetée, révoquée, prolongée, échéance) | 3, 4, 7, 8 |
| Rappels avant échéance (24 h / 1 h, idempotents) | 8 |
| Prolongation (plafond cumulé, délai de grâce) | 7 |
| Purge manuelle avec liste, chemin normalisé, sauvegarde, audit | 9 |
| UI : liste, nouvelle demande, détail, stepper, panneau de traitement, badge navbar, confirmation renforcée de la révocation | 10, 11 |
| Documentation (`consultations.md`, `CLAUDE.md`, `securite.md`) | 12 |

Points à garder à l'œil à l'exécution :
- **Task 5** : si `extract_text()` ne voit pas le texte pivoté, adapter l'assertion en le disant, et relever le temps pour 50 pages (critère de la spec).
- **Task 10** : un stub de `ConsultationDetail` peut être nécessaire entre les Tasks 10 et 11 pour que `App.js` compile.
- **Task 12** : le cron `notifier_echeances_consultation` n'est pas créé par ce chantier — c'est une action d'exploitation à faire en production.

---

# Registres de mouvement et de réception — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à SOMIZ un registre de mouvement des dossiers (consultations numériques + sorties papier saisies à la main) et un registre de réception/classement des documents, imprimables (PDF) et exportables (Excel).

**Architecture:** Nouvelle app Django `registres` à côté de `consultations`. Deux modèles (`MouvementArchive`, `ReceptionDocument`) + un compteur annuel. Le registre 01 est une **vue calculée** (`services.registre_mouvements`) qui fusionne les lignes manuelles et les `DemandeConsultation` validées/révoquées, sans copie ni synchronisation. Frontend : une page `/registres` à deux onglets.

**Tech Stack:** Django 5.2 / DRF 3.17, PostgreSQL, pytest ; openpyxl (Excel) et ReportLab (PDF) déjà présents ; React 19, Jest + RTL, styles inline + `theme.js`.

Spec : `docs/superpowers/specs/2026-10-10-registres-design.md`.

## Global Constraints

- Accès : SUPERADMIN, ou ADMIN avec `charge_consultation` (`user.can_manage_consultations`). Aucun nouveau drapeau.
- Un compte non autorisé reçoit **403** sur les routes de liste/création/export (comme `CanAccessConsultations`) ; **404** sur une référence introuvable.
- **Aucun DELETE** sur les registres. Annulation = soft-delete (`is_active=False`) avec motif obligatoire ; la ligne reste visible, barrée.
- `AuditLog.Action` : valeur ≤ **20 caractères** (`max_length=20`).
- Références : `M-NNNNN/AA` (mouvement manuel), `R-NNNNN/AA` (réception), compteur annuel sous `select_for_update()`. Slug d'URL : `/` → `-` (`M-00001-26`).
- Scoping : toute ligne liée à un employé applique `can_access_employee()` ; toute requête sur des consultations applique `employee_scope_q('employee__')`.
- Aucune colonne sensible (NIN, sécu, RIB) dans l'export. Export/impression réservés aux mêmes rôles et **tracés** dans l'audit.
- Dates affichées en `DD/MM/YYYY` : `formatDateFR` (écran), `number_format = 'DD/MM/YYYY'` (Excel), `strftime('%d/%m/%Y')` (PDF).
- Frontend : jamais de hex codé en dur (tokens `theme.js`) ; jamais `window.confirm`/`window.prompt` (`useConfirm()`/`usePrompt()`) ; refresh après mutation = `fetch*(true)` silencieux ; styles inline uniquement.
- Une permission transversale se vérifie par un test d'intégration sur une **vraie route** métier.
- Dans le registre 01, « Nom prénom » de la note manuscrite = le **bénéficiaire** (qui prend le dossier ; le demandeur pour une consultation) ; « Fonction / Service / N° contrat » = ceux de l'**employé concerné**. Colonnes distinctes.

## File Structure

| Fichier | Responsabilité |
|---|---|
| `backend/registres/models.py` | `RegistreReferenceCounter`, `MouvementArchive`, `ReceptionDocument` |
| `backend/registres/reference.py` | `generate_reference(prefix)` |
| `backend/registres/permissions.py` | `CanManageRegistres` |
| `backend/registres/services.py` | Vue unifiée du registre 01, annulation |
| `backend/registres/serializers.py` | Serializers des deux modèles |
| `backend/registres/exports.py` | Génération xlsx et pdf (générique : titre, entêtes, lignes) |
| `backend/registres/views.py` | Vues API |
| `backend/registres/urls.py` | Routes `/api/registres/…` |
| `backend/audit/models.py` | +10 actions d'audit |
| `backend/tests/test_registres_*.py` | Tests backend |
| `frontend/src/utils/registres.js` | Helpers (téléchargement blob, années) |
| `frontend/src/components/registres/RegistreModal.jsx` | Modale de saisie générique |
| `frontend/src/components/registres/MouvementsPanel.jsx` | Registre 01 |
| `frontend/src/components/registres/ReceptionsPanel.jsx` | Registre 02 |
| `frontend/src/pages/Registres.jsx` | Page à deux onglets |
| `frontend/src/__tests__/Registre*.test.jsx` | Tests Jest |
| `docs/fonctionnel/registres.md`, `securite.md`, `CLAUDE.md` | Documentation vivante |

---

### Task 1: Squelette de l'app, modèles, compteur de références

**Files:**
- Create: `backend/registres/__init__.py`, `backend/registres/apps.py`, `backend/registres/models.py`, `backend/registres/reference.py`
- Modify: `backend/config/settings.py:64` (INSTALLED_APPS)
- Test: `backend/tests/test_registres_models.py`

**Interfaces:**
- Produces: `registres.models.MouvementArchive`, `registres.models.ReceptionDocument`, `registres.reference.generate_reference(prefix: str) -> str` (`'M'` ou `'R'`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_models.py
import pytest
from django.db import IntegrityError
from django.utils import timezone

from registres.models import MouvementArchive, ReceptionDocument, RegistreReferenceCounter
from registres.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_reference_incrementale_par_type_et_par_annee():
    annee = timezone.localdate().year % 100
    assert generate_reference('M') == f"M-00001/{annee:02d}"
    assert generate_reference('M') == f"M-00002/{annee:02d}"
    # Chaque registre a son propre compteur.
    assert generate_reference('R') == f"R-00001/{annee:02d}"


def test_compteur_unique_par_type_et_annee():
    RegistreReferenceCounter.objects.create(type_registre='M', annee=2026, dernier_numero=1)
    with pytest.raises(IntegrityError):
        RegistreReferenceCounter.objects.create(type_registre='M', annee=2026, dernier_numero=5)


def test_mouvement_str_est_la_reference(admin_user):
    m = MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=3, date_depart=timezone.localdate(), saisi_par=admin_user,
    )
    assert str(m) == 'M-00001/26'
    assert m.is_active is True and m.date_retour is None


def test_reception_str_est_la_reference(admin_user):
    r = ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='Courrier', nombre=2, expediteur='DRH',
        date_reception=timezone.localdate(), saisi_par=admin_user,
    )
    assert str(r) == 'R-00001/26'
    assert r.date_classement is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_models.py -v`
Expected: ERROR with `ModuleNotFoundError: No module named 'registres'`

- [ ] **Step 3: Write minimal implementation**

`backend/registres/__init__.py` : fichier vide.

```python
# backend/registres/apps.py
from django.apps import AppConfig


class RegistresConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'registres'
    verbose_name = "Registres d'archives"
```

```python
# backend/registres/models.py
import uuid

from django.conf import settings
from django.db import models


class RegistreReferenceCounter(models.Model):
    """Compteur annuel par registre (M = mouvement, R = réception),
    incrémenté sous verrou — même mécanisme que ConsultationReferenceCounter."""
    type_registre = models.CharField(max_length=1)
    annee = models.PositiveSmallIntegerField()
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'registre_reference_counters'
        constraints = [
            models.UniqueConstraint(fields=['type_registre', 'annee'], name='uniq_registre_counter'),
        ]


class MouvementArchive(models.Model):
    """Ligne MANUELLE du registre 01 (dossier papier sorti/rendu). Les
    consultations numériques n'y sont jamais copiées : elles sont fusionnées
    à la lecture par services.registre_mouvements."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    employee = models.ForeignKey(
        'employees.Employee', null=True, blank=True, on_delete=models.PROTECT,
        related_name='mouvements_archive',
    )
    nom_libre = models.CharField(max_length=200, blank=True)
    beneficiaire = models.CharField(max_length=200, blank=True)
    fonction = models.CharField(max_length=200, blank=True)
    service = models.CharField(max_length=200, blank=True)
    numero_contrat = models.CharField(max_length=100, blank=True)
    type_documents = models.CharField(max_length=200)
    nombre_documents = models.PositiveIntegerField(default=1)
    date_depart = models.DateField()
    date_retour = models.DateField(null=True, blank=True)
    observation = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    motif_annulation = models.TextField(blank=True)
    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'registre_mouvements'
        ordering = ['date_depart', 'reference']

    def __str__(self):
        return self.reference


class ReceptionDocument(models.Model):
    """Ligne du registre 02 : document reçu, puis classé."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    type_document = models.CharField(max_length=200)
    nombre = models.PositiveIntegerField(default=1)
    expediteur = models.CharField(max_length=200)
    date_reception = models.DateField()
    date_classement = models.DateField(null=True, blank=True)
    observation = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    motif_annulation = models.TextField(blank=True)
    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name='+',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'registre_receptions'
        ordering = ['date_reception', 'reference']

    def __str__(self):
        return self.reference
```

```python
# backend/registres/reference.py
from django.db import transaction
from django.utils import timezone

from .models import RegistreReferenceCounter


def generate_reference(prefix):
    """Prochaine référence <prefix>-NNNNN/AA de l'année civile, sous verrou."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = RegistreReferenceCounter.objects.select_for_update().get_or_create(
            type_registre=prefix, annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"{prefix}-{numero:05d}/{annee % 100:02d}"
```

Dans `backend/config/settings.py`, ajouter `'registres',` juste après `'consultations',` (ligne 64).

- [ ] **Step 4: Create migration and run tests**

Run: `cd backend && python manage.py makemigrations registres && pytest tests/test_registres_models.py -v`
Expected: migration `registres/migrations/0001_initial.py` créée ; 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/registres backend/config/settings.py backend/tests/test_registres_models.py
git commit -m "feat(registres): app, modèles MouvementArchive/ReceptionDocument et compteur de références"
```

---

### Task 2: Actions d'audit

**Files:**
- Modify: `backend/audit/models.py:47-50` (enum `Action`)
- Create: migration `backend/audit/migrations/0011_*.py` (générée)
- Test: `backend/tests/test_registres_audit.py`

**Interfaces:**
- Produces: `AuditLog.Action.CREATE_MOUVEMENT`, `MODIFY_MOUVEMENT`, `CANCEL_MOUVEMENT`, `RETOUR_MOUVEMENT`, `CREATE_RECEPTION`, `MODIFY_RECEPTION`, `CANCEL_RECEPTION`, `CLASSER_RECEPTION`, `EXPORT_REGISTRE`, `PRINT_REGISTRE`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_audit.py
from audit.models import AuditLog

ACTIONS_REGISTRES = [
    'CREATE_MOUVEMENT', 'MODIFY_MOUVEMENT', 'CANCEL_MOUVEMENT', 'RETOUR_MOUVEMENT',
    'CREATE_RECEPTION', 'MODIFY_RECEPTION', 'CANCEL_RECEPTION', 'CLASSER_RECEPTION',
    'EXPORT_REGISTRE', 'PRINT_REGISTRE',
]


def test_actions_registres_existent_et_tiennent_dans_max_length():
    max_length = AuditLog._meta.get_field('action').max_length
    for nom in ACTIONS_REGISTRES:
        valeur = getattr(AuditLog.Action, nom).value
        assert valeur == nom
        assert len(valeur) <= max_length, f"{nom} dépasse {max_length} caractères"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_audit.py -v`
Expected: FAIL with `AttributeError: CREATE_MOUVEMENT`

- [ ] **Step 3: Write minimal implementation**

Dans `backend/audit/models.py`, après la ligne `PURGE_CONSULTATION = ...` :

```python
        CREATE_MOUVEMENT = 'CREATE_MOUVEMENT', 'Création mouvement registre'
        MODIFY_MOUVEMENT = 'MODIFY_MOUVEMENT', 'Modification mouvement registre'
        CANCEL_MOUVEMENT = 'CANCEL_MOUVEMENT', 'Annulation mouvement registre'
        RETOUR_MOUVEMENT = 'RETOUR_MOUVEMENT', 'Retour de dossier (registre)'
        CREATE_RECEPTION = 'CREATE_RECEPTION', 'Création réception registre'
        MODIFY_RECEPTION = 'MODIFY_RECEPTION', 'Modification réception registre'
        CANCEL_RECEPTION = 'CANCEL_RECEPTION', 'Annulation réception registre'
        CLASSER_RECEPTION = 'CLASSER_RECEPTION', 'Classement réception registre'
        EXPORT_REGISTRE = 'EXPORT_REGISTRE', 'Export Excel du registre'
        PRINT_REGISTRE = 'PRINT_REGISTRE', 'Impression PDF du registre'
```

- [ ] **Step 4: Create migration and run test**

Run: `cd backend && python manage.py makemigrations audit && pytest tests/test_registres_audit.py -v`
Expected: migration `audit/migrations/0011_alter_auditlog_action.py` ; 1 passed

- [ ] **Step 5: Commit**

```bash
git add backend/audit backend/tests/test_registres_audit.py
git commit -m "feat(registres): actions d'audit des registres"
```

---

### Task 3: Permission et vue unifiée du registre 01

**Files:**
- Create: `backend/registres/permissions.py`, `backend/registres/services.py`
- Test: `backend/tests/test_registres_vue.py`

**Interfaces:**
- Produces:
  - `registres.permissions.CanManageRegistres` (BasePermission)
  - `registres.services.LigneRegistre` (dataclass gelée : `reference, origine, date_depart, date_retour, beneficiaire, employe, matricule, fonction, service, numero_contrat, type_documents, nombre_documents, observation, annulee, motif_annulation`)
  - `registres.services.registre_mouvements(user, annee: int, q: str = '', statut: str = '') -> list[LigneRegistre]` — `statut` ∈ `''`, `'en_cours'` (non rendu, hors annulées).
  - `registres.services.annuler(obj, motif: str) -> None` (lève `ValueError` si motif vide ou déjà annulé).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_vue.py
from datetime import date, timedelta

import pytest
from django.utils import timezone

from consultations.models import ConsultationFichier, DemandeConsultation
from registres.models import MouvementArchive
from registres.services import annuler, registre_mouvements

pytestmark = pytest.mark.django_db


def _manuel(admin_user, **kw):
    valeurs = dict(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=2, date_depart=date(2026, 3, 1), saisi_par=admin_user,
    )
    valeurs.update(kw)
    return MouvementArchive.objects.create(**valeurs)


def test_fusionne_lignes_manuelles_et_consultations_validees(
    superadmin_user, admin_user, demande_validee, employee, contrat,
):
    demande_validee.employee = employee
    demande_validee.save()
    for nom in ('a.pdf', 'b.pdf'):
        ConsultationFichier.objects.create(
            demande=demande_validee, file=nom, file_name=nom, mime_type='application/pdf',
            file_size=1, origine='scan_externe',
        )
    _manuel(admin_user, date_depart=timezone.localdate())
    lignes = registre_mouvements(superadmin_user, timezone.localdate().year)
    assert {ligne.origine for ligne in lignes} == {'manuel', 'consultation'}
    conso = next(ligne for ligne in lignes if ligne.origine == 'consultation')
    assert conso.reference == 'C-00002/26'
    assert conso.nombre_documents == 2
    assert conso.numero_contrat == 'CTR-2024-001'
    assert conso.matricule == 'EMP-001'
    assert conso.fonction == 'Ingénieur'
    assert conso.date_retour is None  # échéance dans 24 h : pas encore rendu


def test_consultation_revoquee_a_pour_retour_la_date_de_revocation(superadmin_user, demande_validee):
    revocation = timezone.now()
    demande_validee.statut = DemandeConsultation.Statut.REVOQUEE
    demande_validee.date_revocation = revocation
    demande_validee.save()
    ligne = registre_mouvements(superadmin_user, revocation.year)[0]
    assert ligne.date_retour == timezone.localtime(revocation).date()
    assert ligne.observation == 'Révoquée'


def test_consultation_expiree_a_pour_retour_lecheance(superadmin_user, demande_validee):
    passe = timezone.now() - timedelta(days=2)
    demande_validee.date_validation = passe - timedelta(hours=24)
    demande_validee.date_echeance = passe
    demande_validee.save()
    ligne = registre_mouvements(superadmin_user, demande_validee.date_validation.year)[0]
    assert ligne.date_retour == timezone.localtime(passe).date()
    assert ligne.observation == 'Expirée'


def test_consultation_non_validee_exclue(superadmin_user, demande_en_cours):
    assert registre_mouvements(superadmin_user, timezone.localdate().year) == []


def test_filtre_annee_en_cours_et_recherche(superadmin_user, admin_user):
    _manuel(admin_user, reference='M-00001/26', date_depart=date(2026, 3, 1), date_retour=date(2026, 3, 9))
    _manuel(admin_user, reference='M-00002/26', nom_libre='Zoe Karim', date_depart=date(2026, 4, 1))
    _manuel(admin_user, reference='M-00001/25', date_depart=date(2025, 12, 31))
    assert len(registre_mouvements(superadmin_user, 2026)) == 2
    en_cours = registre_mouvements(superadmin_user, 2026, statut='en_cours')
    assert [ligne.reference for ligne in en_cours] == ['M-00002/26']
    trouvees = registre_mouvements(superadmin_user, 2026, q='karim')
    assert [ligne.reference for ligne in trouvees] == ['M-00002/26']


def test_ligne_annulee_reste_visible_et_marquee(superadmin_user, admin_user):
    annuler(_manuel(admin_user), "Saisie en double")
    ligne = registre_mouvements(superadmin_user, 2026)[0]
    assert ligne.annulee is True and ligne.motif_annulation == "Saisie en double"


def test_ligne_annulee_exclue_du_filtre_en_cours(superadmin_user, admin_user):
    annuler(_manuel(admin_user), "Saisie en double")
    assert registre_mouvements(superadmin_user, 2026, statut='en_cours') == []


def test_annuler_exige_un_motif_et_refuse_le_double_appel(admin_user):
    m = _manuel(admin_user)
    with pytest.raises(ValueError):
        annuler(m, "   ")
    annuler(m, "Erreur")
    with pytest.raises(ValueError):
        annuler(m, "Encore")


def test_tri_chronologique_croissant(superadmin_user, admin_user):
    _manuel(admin_user, reference='M-00002/26', date_depart=date(2026, 5, 1))
    _manuel(admin_user, reference='M-00001/26', date_depart=date(2026, 2, 1))
    refs = [ligne.reference for ligne in registre_mouvements(superadmin_user, 2026)]
    assert refs == ['M-00001/26', 'M-00002/26']
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_vue.py -v`
Expected: ERROR with `ModuleNotFoundError: No module named 'registres.services'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registres/permissions.py
from rest_framework.permissions import BasePermission


class CanManageRegistres(BasePermission):
    """Registres de mouvement et de réception : SUPERADMIN, ou ADMIN chargé
    des consultations (User.can_manage_consultations). Tout autre compte —
    dont un ADMIN sans le drapeau — est refusé."""
    message = "Vous n'avez pas accès aux registres."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active
            and user.consent_loi1807_accepted_at
            and user.can_manage_consultations
        )
```

```python
# backend/registres/services.py
from dataclasses import dataclass
from datetime import date

from django.db.models import Count, Q
from django.utils import timezone

from consultations.models import DemandeConsultation
from employees.models import Contrat

from .models import MouvementArchive

ORIGINE_MANUEL = 'manuel'
ORIGINE_CONSULTATION = 'consultation'


@dataclass(frozen=True)
class LigneRegistre:
    reference: str
    origine: str
    date_depart: date
    date_retour: date | None
    beneficiaire: str
    employe: str
    matricule: str
    fonction: str
    service: str
    numero_contrat: str
    type_documents: str
    nombre_documents: int
    observation: str
    annulee: bool
    motif_annulation: str


def _numeros_contrat(employee_ids):
    """Numéro du contrat le plus récent (par date de début) de chaque employé,
    en une seule requête."""
    numeros = {}
    contrats = (
        Contrat.objects.filter(employee_id__in=employee_ids)
        .order_by('employee_id', '-date_debut')
        .values_list('employee_id', 'numero_contrat')
    )
    for employee_id, numero in contrats:
        numeros.setdefault(employee_id, numero)
    return numeros


def _nom_complet(personne):
    return f"{personne.nom} {personne.prenom}".strip()


def _lignes_manuelles(annee):
    qs = MouvementArchive.objects.select_related('employee').filter(date_depart__year=annee)
    lignes = []
    for m in qs:
        employe = _nom_complet(m.employee) if m.employee_id else m.nom_libre
        lignes.append(LigneRegistre(
            reference=m.reference, origine=ORIGINE_MANUEL,
            date_depart=m.date_depart, date_retour=m.date_retour,
            beneficiaire=m.beneficiaire, employe=employe,
            matricule=m.employee.matricule if m.employee_id else '',
            fonction=m.fonction, service=m.service, numero_contrat=m.numero_contrat,
            type_documents=m.type_documents, nombre_documents=m.nombre_documents,
            observation=m.observation, annulee=not m.is_active,
            motif_annulation=m.motif_annulation,
        ))
    return lignes


def _retour_consultation(demande, maintenant):
    if demande.statut == DemandeConsultation.Statut.REVOQUEE and demande.date_revocation:
        return timezone.localtime(demande.date_revocation).date()
    if demande.date_echeance and demande.date_echeance <= maintenant:
        return timezone.localtime(demande.date_echeance).date()
    return None


def _observation_consultation(demande):
    if demande.statut_effectif == DemandeConsultation.EXPIREE:
        return 'Expirée'
    return demande.get_statut_display()


def _lignes_consultations(user, annee):
    qs = (
        DemandeConsultation.objects
        .select_related('employee', 'employee__poste', 'employee__service', 'demandeur')
        .filter(
            statut__in=[DemandeConsultation.Statut.VALIDEE, DemandeConsultation.Statut.REVOQUEE],
            date_validation__year=annee,
        )
        .annotate(nb_fichiers=Count('fichiers'))
    )
    # Q() vide (ADMIN/SUPERADMIN) = aucune restriction ; `Q(a) | Q()` vaudrait
    # Q(a) et exclurait à tort les consultations sans employé : on ne combine
    # que si le périmètre est non vide.
    scope = user.employee_scope_q('employee__')
    if scope:
        qs = qs.filter(Q(employee__isnull=True) | scope)
    demandes = list(qs)
    contrats = _numeros_contrat({d.employee_id for d in demandes if d.employee_id})
    maintenant = timezone.now()
    lignes = []
    for d in demandes:
        e = d.employee
        lignes.append(LigneRegistre(
            reference=d.reference, origine=ORIGINE_CONSULTATION,
            date_depart=timezone.localtime(d.date_validation).date(),
            date_retour=_retour_consultation(d, maintenant),
            beneficiaire=_nom_complet(d.demandeur),
            employe=_nom_complet(e) if e else '',
            matricule=e.matricule if e else '',
            fonction=e.poste.nom if e and e.poste_id else '',
            service=e.service.nom if e and e.service_id else '',
            numero_contrat=contrats.get(d.employee_id, ''),
            type_documents=d.get_type_demande_display(),
            nombre_documents=d.nb_fichiers,
            observation=_observation_consultation(d),
            annulee=False, motif_annulation='',
        ))
    return lignes


def _correspond(ligne, q):
    if not q:
        return True
    cible = ' '.join([
        ligne.reference, ligne.beneficiaire, ligne.employe, ligne.matricule,
        ligne.fonction, ligne.service, ligne.numero_contrat, ligne.type_documents,
        ligne.observation,
    ]).lower()
    return q.lower() in cible


def registre_mouvements(user, annee, q='', statut=''):
    """Registre 01 d'une année : lignes manuelles + consultations validées ou
    révoquées, triées par date de départ croissante. `statut='en_cours'` ne
    garde que les dossiers non rendus (hors lignes annulées)."""
    lignes = _lignes_manuelles(annee) + _lignes_consultations(user, annee)
    lignes = [ligne for ligne in lignes if _correspond(ligne, q)]
    if statut == 'en_cours':
        lignes = [ligne for ligne in lignes if ligne.date_retour is None and not ligne.annulee]
    return sorted(lignes, key=lambda ligne: (ligne.date_depart, ligne.reference))


def annuler(obj, motif):
    """Soft-delete d'une ligne de registre (jamais de suppression physique :
    un registre est une pièce probante)."""
    motif = (motif or '').strip()
    if not motif:
        raise ValueError("Le motif d'annulation est obligatoire.")
    if not obj.is_active:
        raise ValueError("Cette ligne est déjà annulée.")
    obj.is_active = False
    obj.motif_annulation = motif
    obj.save(update_fields=['is_active', 'motif_annulation', 'updated_at'])
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_registres_vue.py -v`
Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add backend/registres/permissions.py backend/registres/services.py backend/tests/test_registres_vue.py
git commit -m "feat(registres): permission et vue unifiée du registre de mouvement"
```

---

### Task 4: Serializers et API du registre 01 (mouvements manuels)

**Files:**
- Create: `backend/registres/serializers.py`, `backend/registres/views.py`, `backend/registres/urls.py`
- Modify: `backend/config/urls.py:17` (route `registres/`)
- Test: `backend/tests/test_registres_api_mouvements.py`

**Interfaces:**
- Consumes: `generate_reference`, `registre_mouvements`, `annuler`, `CanManageRegistres`, `AuditLog.log(request, action, target=, details=)`, `consultations.views.reference_depuis_slug`.
- Produces: routes
  - `GET /api/registres/mouvements/?annee=&q=&statut=` → `{"annee": int, "results": [LigneRegistre dict]}`
  - `POST /api/registres/mouvements/` → 201 (MouvementArchive sérialisé, avec `slug`)
  - `GET|PATCH /api/registres/mouvements/<slug>/`
  - `POST /api/registres/mouvements/<slug>/retour/` (corps optionnel `{"date_retour": "YYYY-MM-DD"}`)
  - `POST /api/registres/mouvements/<slug>/annuler/` (corps `{"motif": "..."}`)
  - Helpers de `views.py` réutilisés par la Task 5 : `annee_depuis(request)`, `instantane(obj, champs)`, `RegistreObjetMixin`, `annuler_ligne(request, obj, action)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_api_mouvements.py
from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.models import MouvementArchive

pytestmark = pytest.mark.django_db

URL = '/api/registres/mouvements/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _payload(**kw):
    base = {
        'nom_libre': 'Ali Ben', 'beneficiaire': 'M. Directeur', 'type_documents': 'Dossier',
        'nombre_documents': 3, 'date_depart': '2026-03-01',
    }
    base.update(kw)
    return base


def _slug(mouvement):
    return mouvement.reference.replace('/', '-')


# ── Permissions : sur de vraies routes métier, pas seulement le défaut DRF ──

@pytest.mark.parametrize('fixture', ['consultant_user', 'gestionnaire_user', 'admin_user'])
def test_comptes_non_autorises_refuses_sur_liste_et_creation(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 403
    assert client.post(URL, _payload(), format='json').status_code == 403


def test_anonyme_refuse():
    assert APIClient().get(URL).status_code in (401, 403)


@pytest.mark.parametrize('fixture', ['superadmin_user', 'traiteur'])
def test_superadmin_et_traiteur_autorises(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 200


def test_admin_sans_drapeau_refuse_sur_detail_retour_annuler(admin_user):
    m = MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='X', type_documents='D', date_depart=date(2026, 3, 1),
    )
    client = _client(admin_user)
    for suffixe, methode in [('', 'get'), ('retour/', 'post'), ('annuler/', 'post')]:
        reponse = getattr(client, methode)(f"{URL}{_slug(m)}/{suffixe}", {'motif': 'x'}, format='json')
        assert reponse.status_code == 403


# ── Création ──

def test_creation_attribue_reference_saisi_par_et_audit(traiteur):
    reponse = _client(traiteur).post(URL, _payload(), format='json')
    assert reponse.status_code == 201
    annee = timezone.localdate().year % 100
    assert reponse.data['reference'] == f"M-00001/{annee:02d}"
    m = MouvementArchive.objects.get()
    assert m.saisi_par == traiteur
    assert AuditLog.objects.filter(action='CREATE_MOUVEMENT', target_id=str(m.pk)).exists()


def test_creation_exige_un_employe_ou_un_nom_libre(traiteur):
    reponse = _client(traiteur).post(URL, _payload(nom_libre=''), format='json')
    assert reponse.status_code == 400


def test_creation_avec_employe_copie_fonction_service_contrat(traiteur, employee, contrat):
    reponse = _client(traiteur).post(
        URL, _payload(nom_libre='', employee=str(employee.pk)), format='json',
    )
    assert reponse.status_code == 201
    assert reponse.data['fonction'] == 'Ingénieur'
    assert reponse.data['service'] == 'Paie'
    assert reponse.data['numero_contrat'] == 'CTR-2024-001'


def test_retour_avant_depart_refuse(traiteur):
    reponse = _client(traiteur).post(URL, _payload(date_retour='2026-02-01'), format='json')
    assert reponse.status_code == 400


def test_nombre_documents_doit_etre_positif(traiteur):
    reponse = _client(traiteur).post(URL, _payload(nombre_documents=0), format='json')
    assert reponse.status_code == 400


def test_champs_serveur_ignores_a_la_creation(traiteur):
    reponse = _client(traiteur).post(
        URL, _payload(reference='M-99999/26', is_active=False), format='json',
    )
    assert reponse.status_code == 201
    assert reponse.data['reference'] != 'M-99999/26'
    assert reponse.data['is_active'] is True


# ── Liste (vue unifiée) ──

def test_liste_renvoie_annee_et_lignes(traiteur):
    _client(traiteur).post(URL, _payload(date_depart='2026-03-01'), format='json')
    reponse = _client(traiteur).get(URL, {'annee': 2026})
    assert reponse.status_code == 200
    assert reponse.data['annee'] == 2026
    assert reponse.data['results'][0]['origine'] == 'manuel'


def test_liste_annee_invalide_refusee(traiteur):
    assert _client(traiteur).get(URL, {'annee': 'abc'}).status_code == 400
    assert _client(traiteur).get(URL, {'annee': 1800}).status_code == 400


# ── Modification, retour, annulation ──

def test_modification_auditee_avec_ancienne_valeur(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    reponse = _client(traiteur).patch(f"{URL}{_slug(m)}/", {'nombre_documents': 5}, format='json')
    assert reponse.status_code == 200
    log = AuditLog.objects.get(action='MODIFY_MOUVEMENT')
    assert log.details['changes']['nombre_documents'] == {'avant': 3, 'apres': 5}


def test_modification_ne_change_pas_la_reference(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    _client(traiteur).patch(f"{URL}{_slug(m)}/", {'reference': 'M-77777/26'}, format='json')
    m.refresh_from_db()
    assert m.reference != 'M-77777/26'


def test_retour_en_un_clic_met_la_date_du_jour(traiteur):
    _client(traiteur).post(URL, _payload(date_depart='2026-01-01'), format='json')
    m = MouvementArchive.objects.get()
    reponse = _client(traiteur).post(f"{URL}{_slug(m)}/retour/")
    assert reponse.status_code == 200
    m.refresh_from_db()
    assert m.date_retour == timezone.localdate()
    assert AuditLog.objects.filter(action='RETOUR_MOUVEMENT').exists()


def test_retour_deja_enregistre_refuse(traiteur):
    _client(traiteur).post(URL, _payload(date_depart='2026-01-01', date_retour='2026-01-05'), format='json')
    m = MouvementArchive.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(m)}/retour/").status_code == 400


def test_annulation_exige_un_motif_et_ne_supprime_pas(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(m)}/annuler/", {'motif': ''}, format='json').status_code == 400
    assert _client(traiteur).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Doublon'}, format='json').status_code == 200
    m.refresh_from_db()
    assert m.is_active is False and m.motif_annulation == 'Doublon'
    assert MouvementArchive.objects.count() == 1
    assert AuditLog.objects.filter(action='CANCEL_MOUVEMENT').exists()


def test_ligne_annulee_non_modifiable(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    _client(traiteur).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Doublon'}, format='json')
    assert _client(traiteur).patch(f"{URL}{_slug(m)}/", {'observation': 'x'}, format='json').status_code == 400


def test_pas_de_delete(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    assert _client(traiteur).delete(f"{URL}{_slug(m)}/").status_code == 405


def test_reference_inconnue_404(traiteur):
    assert _client(traiteur).get(f"{URL}M-99999-26/").status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_api_mouvements.py -v`
Expected: FAIL — les routes répondent 404 (app non routée)

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registres/serializers.py
from rest_framework import serializers

from employees.models import Contrat

from .models import MouvementArchive, ReceptionDocument


def _verifier_ordre_dates(debut, fin, message):
    if debut and fin and fin < debut:
        raise serializers.ValidationError(message)


def _nom_saisisseur(obj):
    return f"{obj.saisi_par.nom} {obj.saisi_par.prenom}".strip() if obj.saisi_par_id else ''


class MouvementArchiveSerializer(serializers.ModelSerializer):
    slug = serializers.SerializerMethodField()
    saisi_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = MouvementArchive
        fields = [
            'id', 'slug', 'reference', 'employee', 'nom_libre', 'beneficiaire', 'fonction',
            'service', 'numero_contrat', 'type_documents', 'nombre_documents',
            'date_depart', 'date_retour', 'observation', 'is_active', 'motif_annulation',
            'saisi_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'is_active', 'motif_annulation', 'created_at', 'updated_at',
        ]

    def get_slug(self, obj):
        return obj.reference.replace('/', '-')

    def get_saisi_par_nom(self, obj):
        return _nom_saisisseur(obj)

    def validate_nombre_documents(self, valeur):
        if valeur < 1:
            raise serializers.ValidationError("Le nombre de documents doit être au moins 1.")
        return valeur

    def validate_employee(self, employee):
        if employee is not None and not self.context['request'].user.can_access_employee(employee):
            raise serializers.ValidationError("Employé hors de votre périmètre.")
        return employee

    def validate(self, data):
        instance = self.instance
        employee = data.get('employee', getattr(instance, 'employee', None))
        nom_libre = data.get('nom_libre', getattr(instance, 'nom_libre', ''))
        if employee is None and not (nom_libre or '').strip():
            raise serializers.ValidationError("Indiquez un employé ou un nom.")
        _verifier_ordre_dates(
            data.get('date_depart', getattr(instance, 'date_depart', None)),
            data.get('date_retour', getattr(instance, 'date_retour', None)),
            "La date de retour ne peut pas précéder la date de départ.",
        )
        # Copie des informations de l'employé lié si le client ne les fournit pas.
        if employee is not None and 'employee' in data:
            contrat = Contrat.objects.filter(employee=employee).order_by('-date_debut').first()
            data.setdefault('fonction', employee.poste.nom if employee.poste_id else '')
            data.setdefault('service', employee.service.nom if employee.service_id else '')
            data.setdefault('numero_contrat', contrat.numero_contrat if contrat else '')
        return data


class ReceptionDocumentSerializer(serializers.ModelSerializer):
    slug = serializers.SerializerMethodField()
    saisi_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = ReceptionDocument
        fields = [
            'id', 'slug', 'reference', 'type_document', 'nombre', 'expediteur',
            'date_reception', 'date_classement', 'observation', 'is_active',
            'motif_annulation', 'saisi_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'is_active', 'motif_annulation', 'created_at', 'updated_at',
        ]

    def get_slug(self, obj):
        return obj.reference.replace('/', '-')

    def get_saisi_par_nom(self, obj):
        return _nom_saisisseur(obj)

    def validate_nombre(self, valeur):
        if valeur < 1:
            raise serializers.ValidationError("Le nombre de documents doit être au moins 1.")
        return valeur

    def validate(self, data):
        instance = self.instance
        _verifier_ordre_dates(
            data.get('date_reception', getattr(instance, 'date_reception', None)),
            data.get('date_classement', getattr(instance, 'date_classement', None)),
            "La date de classement ne peut pas précéder la date de réception.",
        )
        return data
```

```python
# backend/registres/views.py
import dataclasses

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.models import AuditLog
from consultations.views import reference_depuis_slug

from . import services
from .models import MouvementArchive
from .permissions import CanManageRegistres
from .reference import generate_reference
from .serializers import MouvementArchiveSerializer

ANNEE_MIN, ANNEE_MAX = 2000, 2100
MSG_LIGNE_ANNULEE = "Une ligne annulée n'est plus modifiable."

CHAMPS_MOUVEMENT = [
    'employee_id', 'nom_libre', 'beneficiaire', 'fonction', 'service', 'numero_contrat',
    'type_documents', 'nombre_documents', 'date_depart', 'date_retour', 'observation',
]


def annee_depuis(request):
    """Année demandée (défaut : année courante), bornée pour éviter une
    requête absurde."""
    brut = request.query_params.get('annee')
    if brut in (None, ''):
        return timezone.localdate().year
    try:
        annee = int(brut)
    except ValueError:
        raise ValidationError({'annee': "Année invalide."})
    if not ANNEE_MIN <= annee <= ANNEE_MAX:
        raise ValidationError({'annee': "Année invalide."})
    return annee


def _jsonable(valeur):
    if hasattr(valeur, 'isoformat'):
        return valeur.isoformat()
    return str(valeur) if valeur is not None and not isinstance(valeur, (str, int, bool)) else valeur


def instantane(obj, champs):
    """Valeurs sérialisables JSON des champs suivis, pour le diff d'audit."""
    return {c: _jsonable(getattr(obj, c)) for c in champs}


def diff(avant, apres):
    """{champ: {'avant', 'apres'}} pour les seuls champs modifiés."""
    return {c: {'avant': avant[c], 'apres': apres[c]} for c in avant if avant[c] != apres[c]}


class RegistreObjetMixin:
    """Résolution par slug de référence (M-00001-26) ; 404 si inconnu."""
    permission_classes = [CanManageRegistres]
    modele = None
    lookup_url_kwarg = 'ref'

    def get_object(self):
        reference = reference_depuis_slug(self.kwargs[self.lookup_url_kwarg])
        return get_object_or_404(self.modele.objects.select_related('saisi_par'), reference=reference)


def annuler_ligne(request, obj, action):
    """Annulation commune aux deux registres : motif obligatoire, auditée."""
    try:
        services.annuler(obj, request.data.get('motif'))
    except ValueError as exc:
        raise ValidationError(str(exc))
    AuditLog.log(request, action, target=obj, details={'motif': obj.motif_annulation})


class MouvementsView(APIView):
    """GET : registre 01 d'une année (lignes manuelles + consultations).
    POST : nouvelle ligne manuelle."""
    permission_classes = [CanManageRegistres]

    def get(self, request):
        annee = annee_depuis(request)
        lignes = services.registre_mouvements(
            request.user, annee,
            q=request.query_params.get('q', '').strip(),
            statut=request.query_params.get('statut', ''),
        )
        return Response({'annee': annee, 'results': [dataclasses.asdict(ligne) for ligne in lignes]})

    @transaction.atomic
    def post(self, request):
        serializer = MouvementArchiveSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        mouvement = serializer.save(reference=generate_reference('M'), saisi_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.CREATE_MOUVEMENT, target=mouvement,
            details={'nombre_documents': mouvement.nombre_documents},
        )
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data, status=201)


class MouvementDetailView(RegistreObjetMixin, generics.RetrieveUpdateAPIView):
    modele = MouvementArchive
    serializer_class = MouvementArchiveSerializer
    http_method_names = ['get', 'patch', 'head', 'options']  # jamais de DELETE

    def perform_update(self, serializer):
        if not serializer.instance.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        avant = instantane(serializer.instance, CHAMPS_MOUVEMENT)
        mouvement = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_MOUVEMENT, target=mouvement,
            details={'changes': diff(avant, instantane(mouvement, CHAMPS_MOUVEMENT))},
        )


class MouvementRetourView(RegistreObjetMixin, APIView):
    modele = MouvementArchive

    def post(self, request, ref):
        mouvement = self.get_object()
        if not mouvement.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        if mouvement.date_retour:
            raise ValidationError("Le retour est déjà enregistré.")
        brut = request.data.get('date_retour')
        if brut:
            serializer = MouvementArchiveSerializer(
                mouvement, data={'date_retour': brut}, partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            date_retour = serializer.validated_data['date_retour']
        else:
            date_retour = timezone.localdate()
            if date_retour < mouvement.date_depart:
                raise ValidationError("La date de retour ne peut pas précéder la date de départ.")
        mouvement.date_retour = date_retour
        mouvement.save(update_fields=['date_retour', 'updated_at'])
        AuditLog.log(
            request, AuditLog.Action.RETOUR_MOUVEMENT, target=mouvement,
            details={'date_retour': date_retour.isoformat()},
        )
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data)


class MouvementAnnulerView(RegistreObjetMixin, APIView):
    modele = MouvementArchive

    def post(self, request, ref):
        mouvement = self.get_object()
        annuler_ligne(request, mouvement, AuditLog.Action.CANCEL_MOUVEMENT)
        return Response(MouvementArchiveSerializer(mouvement, context={'request': request}).data)
```

```python
# backend/registres/urls.py
from django.urls import path

from .views import (
    MouvementAnnulerView, MouvementDetailView, MouvementRetourView, MouvementsView,
)

urlpatterns = [
    path('mouvements/', MouvementsView.as_view()),
    path('mouvements/<str:ref>/', MouvementDetailView.as_view()),
    path('mouvements/<str:ref>/retour/', MouvementRetourView.as_view()),
    path('mouvements/<str:ref>/annuler/', MouvementAnnulerView.as_view()),
]
```

Dans `backend/config/urls.py`, après la ligne `consultations/` :

```python
        path('registres/', include('registres.urls')),
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_registres_api_mouvements.py -v`
Expected: tous passent. Si `test_comptes_non_autorises…[admin_user]` renvoie 200, la fixture `admin_user` porte le drapeau `charge_consultation` : vérifier `conftest.py` (elle ne l'a pas).

- [ ] **Step 5: Commit**

```bash
git add backend/registres backend/config/urls.py backend/tests/test_registres_api_mouvements.py
git commit -m "feat(registres): API du registre de mouvement (création, modification, retour, annulation)"
```

---

### Task 5: API du registre 02 (réceptions)

**Files:**
- Modify: `backend/registres/views.py` (ajouts), `backend/registres/urls.py`
- Test: `backend/tests/test_registres_api_receptions.py`

**Interfaces:**
- Consumes: `ReceptionDocumentSerializer`, `RegistreObjetMixin`, `annuler_ligne`, `annee_depuis`, `instantane`, `diff`, `MSG_LIGNE_ANNULEE`.
- Produces: routes
  - `GET /api/registres/receptions/?annee=&q=&statut=` → `{"annee", "results": [ReceptionDocumentSerializer]}` ; `statut=a_classer` ne garde que les non classées actives.
  - `POST /api/registres/receptions/`
  - `GET|PATCH /api/registres/receptions/<slug>/`
  - `POST /api/registres/receptions/<slug>/classer/` (corps optionnel `{"date_classement"}`)
  - `POST /api/registres/receptions/<slug>/annuler/`
  - `registres.views.receptions_filtrees(request, annee) -> QuerySet` (réutilisé par l'export, Task 7).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_api_receptions.py
from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.models import ReceptionDocument

pytestmark = pytest.mark.django_db

URL = '/api/registres/receptions/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _payload(**kw):
    base = {
        'type_document': 'Courrier', 'nombre': 2, 'expediteur': 'DRH', 'date_reception': '2026-03-01',
    }
    base.update(kw)
    return base


def _slug(reception):
    return reception.reference.replace('/', '-')


@pytest.mark.parametrize('fixture', ['consultant_user', 'gestionnaire_user', 'admin_user'])
def test_comptes_non_autorises_refuses(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 403
    assert client.post(URL, _payload(), format='json').status_code == 403


def test_creation_reference_R_et_audit(traiteur):
    reponse = _client(traiteur).post(URL, _payload(), format='json')
    assert reponse.status_code == 201
    annee = timezone.localdate().year % 100
    assert reponse.data['reference'] == f"R-00001/{annee:02d}"
    assert AuditLog.objects.filter(action='CREATE_RECEPTION').exists()


def test_expediteur_et_type_obligatoires(traiteur):
    assert _client(traiteur).post(URL, _payload(expediteur=''), format='json').status_code == 400
    assert _client(traiteur).post(URL, _payload(type_document=''), format='json').status_code == 400


def test_classement_avant_reception_refuse(traiteur):
    reponse = _client(traiteur).post(URL, _payload(date_classement='2026-02-01'), format='json')
    assert reponse.status_code == 400


def test_liste_filtre_annee_a_classer_et_recherche(traiteur, superadmin_user):
    ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='A', nombre=1, expediteur='X',
        date_reception=date(2026, 1, 5), date_classement=date(2026, 1, 9),
    )
    ReceptionDocument.objects.create(
        reference='R-00002/26', type_document='B', nombre=1, expediteur='Y', date_reception=date(2026, 2, 5),
    )
    ReceptionDocument.objects.create(
        reference='R-00001/25', type_document='C', nombre=1, expediteur='Z', date_reception=date(2025, 2, 5),
    )
    reponse = _client(superadmin_user).get(URL, {'annee': 2026})
    assert [r['reference'] for r in reponse.data['results']] == ['R-00001/26', 'R-00002/26']
    a_classer = _client(traiteur).get(URL, {'annee': 2026, 'statut': 'a_classer'})
    assert [r['reference'] for r in a_classer.data['results']] == ['R-00002/26']
    cherche = _client(traiteur).get(URL, {'annee': 2026, 'q': 'y'})
    assert [r['reference'] for r in cherche.data['results']] == ['R-00002/26']


def test_classer_en_un_clic(traiteur):
    _client(traiteur).post(URL, _payload(date_reception='2026-01-01'), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/classer/").status_code == 200
    r.refresh_from_db()
    assert r.date_classement == timezone.localdate()
    assert AuditLog.objects.filter(action='CLASSER_RECEPTION').exists()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/classer/").status_code == 400  # déjà classé


def test_modification_auditee(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).patch(f"{URL}{_slug(r)}/", {'nombre': 7}, format='json').status_code == 200
    log = AuditLog.objects.get(action='MODIFY_RECEPTION')
    assert log.details['changes']['nombre'] == {'avant': 2, 'apres': 7}


def test_annulation_motif_obligatoire_sans_suppression_ni_delete(traiteur):
    _client(traiteur).post(URL, _payload(), format='json')
    r = ReceptionDocument.objects.get()
    assert _client(traiteur).post(f"{URL}{_slug(r)}/annuler/", {}, format='json').status_code == 400
    assert _client(traiteur).post(f"{URL}{_slug(r)}/annuler/", {'motif': 'Erreur'}, format='json').status_code == 200
    r.refresh_from_db()
    assert r.is_active is False
    assert _client(traiteur).delete(f"{URL}{_slug(r)}/").status_code == 405
    assert AuditLog.objects.filter(action='CANCEL_RECEPTION').exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_api_receptions.py -v`
Expected: FAIL — 404 sur `/api/registres/receptions/`

- [ ] **Step 3: Write minimal implementation**

Dans `backend/registres/views.py`, compléter les imports :

```python
from django.db.models import Q
```

```python
from .models import MouvementArchive, ReceptionDocument
from .serializers import MouvementArchiveSerializer, ReceptionDocumentSerializer
```

(en remplaçant les deux lignes d'import correspondantes de la Task 4), puis ajouter en fin de fichier :

```python
CHAMPS_RECEPTION = [
    'type_document', 'nombre', 'expediteur', 'date_reception', 'date_classement', 'observation',
]


def receptions_filtrees(request, annee):
    """Registre 02 d'une année, avec les filtres `q` et `statut=a_classer`
    de la query string (partagé par la liste et l'export)."""
    qs = ReceptionDocument.objects.select_related('saisi_par').filter(date_reception__year=annee)
    q = request.query_params.get('q', '').strip()
    if q:
        qs = qs.filter(
            Q(reference__icontains=q) | Q(type_document__icontains=q)
            | Q(expediteur__icontains=q) | Q(observation__icontains=q)
        )
    if request.query_params.get('statut') == 'a_classer':
        qs = qs.filter(is_active=True, date_classement__isnull=True)
    return qs


class ReceptionsView(APIView):
    """GET : registre 02 d'une année. POST : nouvelle réception."""
    permission_classes = [CanManageRegistres]

    def get(self, request):
        annee = annee_depuis(request)
        data = ReceptionDocumentSerializer(
            receptions_filtrees(request, annee), many=True, context={'request': request},
        ).data
        return Response({'annee': annee, 'results': data})

    @transaction.atomic
    def post(self, request):
        serializer = ReceptionDocumentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        reception = serializer.save(reference=generate_reference('R'), saisi_par=request.user)
        AuditLog.log(
            request, AuditLog.Action.CREATE_RECEPTION, target=reception,
            details={'expediteur': reception.expediteur, 'nombre': reception.nombre},
        )
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data, status=201)


class ReceptionDetailView(RegistreObjetMixin, generics.RetrieveUpdateAPIView):
    modele = ReceptionDocument
    serializer_class = ReceptionDocumentSerializer
    http_method_names = ['get', 'patch', 'head', 'options']  # jamais de DELETE

    def perform_update(self, serializer):
        if not serializer.instance.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        avant = instantane(serializer.instance, CHAMPS_RECEPTION)
        reception = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_RECEPTION, target=reception,
            details={'changes': diff(avant, instantane(reception, CHAMPS_RECEPTION))},
        )


class ReceptionClasserView(RegistreObjetMixin, APIView):
    modele = ReceptionDocument

    def post(self, request, ref):
        reception = self.get_object()
        if not reception.is_active:
            raise ValidationError(MSG_LIGNE_ANNULEE)
        if reception.date_classement:
            raise ValidationError("Le classement est déjà enregistré.")
        brut = request.data.get('date_classement')
        if brut:
            serializer = ReceptionDocumentSerializer(
                reception, data={'date_classement': brut}, partial=True, context={'request': request},
            )
            serializer.is_valid(raise_exception=True)
            date_classement = serializer.validated_data['date_classement']
        else:
            date_classement = timezone.localdate()
            if date_classement < reception.date_reception:
                raise ValidationError("La date de classement ne peut pas précéder la date de réception.")
        reception.date_classement = date_classement
        reception.save(update_fields=['date_classement', 'updated_at'])
        AuditLog.log(
            request, AuditLog.Action.CLASSER_RECEPTION, target=reception,
            details={'date_classement': date_classement.isoformat()},
        )
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data)


class ReceptionAnnulerView(RegistreObjetMixin, APIView):
    modele = ReceptionDocument

    def post(self, request, ref):
        reception = self.get_object()
        annuler_ligne(request, reception, AuditLog.Action.CANCEL_RECEPTION)
        return Response(ReceptionDocumentSerializer(reception, context={'request': request}).data)
```

Dans `backend/registres/urls.py`, remplacer l'import par :

```python
from .views import (
    MouvementAnnulerView, MouvementDetailView, MouvementRetourView, MouvementsView,
    ReceptionAnnulerView, ReceptionClasserView, ReceptionDetailView, ReceptionsView,
)
```

et ajouter à la liste `urlpatterns` :

```python
    path('receptions/', ReceptionsView.as_view()),
    path('receptions/<str:ref>/', ReceptionDetailView.as_view()),
    path('receptions/<str:ref>/classer/', ReceptionClasserView.as_view()),
    path('receptions/<str:ref>/annuler/', ReceptionAnnulerView.as_view()),
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_registres_api_receptions.py tests/test_registres_api_mouvements.py -v`
Expected: tous passent

- [ ] **Step 5: Commit**

```bash
git add backend/registres backend/tests/test_registres_api_receptions.py
git commit -m "feat(registres): API du registre de réception et de classement"
```

---

### Task 6: Scoping des consultations et des employés liés

**Files:**
- Test: `backend/tests/test_registres_scoping.py`
- Modify: `backend/registres/services.py` (seulement si un test échoue)

**Interfaces:**
- Consumes: `registre_mouvements(user, annee)`, `MouvementArchiveSerializer.validate_employee`.

Contexte : les traiteurs sont ADMIN/SUPERADMIN, donc `employee_scope_q()` est vide en pratique. Ces tests verrouillent le comportement si la permission s'élargit un jour, et le piège `Q(a) | Q()`.

- [ ] **Step 1: Write the test**

```python
# backend/tests/test_registres_scoping.py
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from consultations.models import DemandeConsultation
from registres.services import registre_mouvements

pytestmark = pytest.mark.django_db


def _consultation(reference, demandeur, traiteur, employee):
    maintenant = timezone.now()
    return DemandeConsultation.objects.create(
        reference=reference, type_demande='document', description='x', demandeur=demandeur,
        employee=employee, statut='validee', traite_par=traiteur, date_validation=maintenant,
        date_echeance=maintenant + timedelta(hours=24),
    )


def test_traiteur_voit_consultations_avec_et_sans_employe(traiteur, gestionnaire_user, employee):
    _consultation('C-00010/26', gestionnaire_user, traiteur, employee)
    _consultation('C-00011/26', gestionnaire_user, traiteur, None)
    refs = {ligne.reference for ligne in registre_mouvements(traiteur, timezone.now().year)}
    assert refs == {'C-00010/26', 'C-00011/26'}


def test_compte_restreint_ne_voit_pas_les_employes_hors_perimetre(
    consultant_user, gestionnaire_user, traiteur, employee,
):
    """Un compte à périmètre (jamais traiteur aujourd'hui) ne doit pas voir
    une consultation portant sur un employé hors de son périmètre."""
    _consultation('C-00020/26', gestionnaire_user, traiteur, employee)
    assert registre_mouvements(consultant_user, timezone.now().year) == []


def test_creation_manuelle_refusee_pour_employe_hors_perimetre(traiteur, employee, monkeypatch):
    monkeypatch.setattr(type(traiteur), 'can_access_employee', lambda self, e: False)
    client = APIClient()
    client.force_authenticate(traiteur)
    reponse = client.post('/api/registres/mouvements/', {
        'employee': str(employee.pk), 'type_documents': 'Dossier', 'nombre_documents': 1,
        'date_depart': '2026-03-01',
    }, format='json')
    assert reponse.status_code == 400
```

- [ ] **Step 2: Run tests**

Run: `cd backend && pytest tests/test_registres_scoping.py -v`
Expected: 3 passed (le service de la Task 3 applique déjà le scoping). Si le deuxième test échoue, corriger `_lignes_consultations` : le bloc `scope = user.employee_scope_q('employee__')` doit filtrer `Q(employee__isnull=True) | scope` quand `scope` est non vide.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_registres_scoping.py backend/registres/services.py
git commit -m "test(registres): scoping des consultations et des employés liés"
```

---

### Task 7: Export Excel et impression PDF

**Files:**
- Create: `backend/registres/exports.py`
- Modify: `backend/registres/views.py` (+`RegistreExportView`), `backend/registres/urls.py`, `backend/config/settings.py:192-197` (taux `registre_export`)
- Test: `backend/tests/test_registres_export.py`

**Interfaces:**
- Consumes: `registre_mouvements`, `receptions_filtrees`, `annee_depuis`, `CanManageRegistres`.
- Produces:
  - `exports.neutraliser(valeur)` — préfixe `'` si la valeur commence par `= + - @` (injection de formule Excel).
  - `exports.construire_xlsx(titre, entetes, lignes, colonnes_date=()) -> bytes`
  - `exports.construire_pdf(titre, entetes, lignes) -> bytes`
  - `GET /api/registres/<mouvements|receptions>/export/?annee=&q=&statut=&format=xlsx|pdf` ; audit `EXPORT_REGISTRE` (xlsx) ou `PRINT_REGISTRE` (pdf) avec `{'registre', 'annee', 'format', 'filtres', 'nb_lignes'}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_registres_export.py
from datetime import date
from io import BytesIO

import openpyxl
import pytest
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.exports import construire_pdf, construire_xlsx, neutraliser
from registres.models import MouvementArchive, ReceptionDocument

pytestmark = pytest.mark.django_db


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_neutraliser_bloque_les_formules():
    assert neutraliser('=HYPERLINK("http://x")') == '\'=HYPERLINK("http://x")'
    assert neutraliser('+1') == "'+1"
    assert neutraliser('-1') == "'-1"
    assert neutraliser('@SUM(A1)') == "'@SUM(A1)"
    assert neutraliser('Dossier normal') == 'Dossier normal'
    assert neutraliser(3) == 3


def test_construire_xlsx_dates_en_ddmmyyyy_et_formules_neutralisees():
    contenu = construire_xlsx(
        'Registre', ['Réf', 'Date', 'Obs'],
        [['M-1', date(2026, 3, 1), '=1+1']], colonnes_date=(1,),
    )
    ws = openpyxl.load_workbook(BytesIO(contenu)).active
    assert ws['B2'].number_format == 'DD/MM/YYYY'
    assert ws['C2'].value == "'=1+1"


def test_construire_pdf_est_un_pdf_et_echappe_le_balisage():
    contenu = construire_pdf('Registre', ['A', 'B'], [['<b>gras</b>', '2']])
    assert contenu.startswith(b'%PDF')


def test_export_mouvements_xlsx_trace_et_sans_colonne_sensible(traiteur):
    MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=2, date_depart=date(2026, 3, 1),
    )
    reponse = _client(traiteur).get('/api/registres/mouvements/export/', {'annee': 2026, 'format': 'xlsx'})
    assert reponse.status_code == 200
    assert 'spreadsheetml' in reponse['Content-Type']
    assert reponse['Cache-Control'] == 'no-store'
    ws = openpyxl.load_workbook(BytesIO(reponse.content)).active
    entetes = [c.value for c in ws[1]]
    assert entetes[0] == 'Référence'
    for interdit in ('nin', 'rib', 'sécurité'):
        assert not any(interdit in str(e).lower() for e in entetes)
    log = AuditLog.objects.get(action='EXPORT_REGISTRE')
    assert log.details['registre'] == 'mouvements' and log.details['nb_lignes'] == 1


def test_export_pdf_trace_comme_impression(traiteur):
    ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='Courrier', nombre=1, expediteur='DRH',
        date_reception=date(2026, 3, 1),
    )
    reponse = _client(traiteur).get('/api/registres/receptions/export/', {'annee': 2026, 'format': 'pdf'})
    assert reponse.status_code == 200 and reponse.content.startswith(b'%PDF')
    assert AuditLog.objects.filter(action='PRINT_REGISTRE').exists()


def test_export_refuse_aux_comptes_non_autorises(admin_user, consultant_user):
    for user in (admin_user, consultant_user):
        reponse = _client(user).get('/api/registres/mouvements/export/', {'format': 'xlsx'})
        assert reponse.status_code == 403
    assert not AuditLog.objects.filter(action__in=['EXPORT_REGISTRE', 'PRINT_REGISTRE']).exists()


def test_export_format_ou_registre_invalide(traiteur):
    assert _client(traiteur).get('/api/registres/mouvements/export/', {'format': 'exe'}).status_code == 400
    assert _client(traiteur).get('/api/registres/inconnu/export/', {'format': 'xlsx'}).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_registres_export.py -v`
Expected: ERROR — `ModuleNotFoundError: No module named 'registres.exports'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/registres/exports.py
"""Génération des fichiers d'export des registres : fonctions pures (titre,
entêtes, lignes) → octets, pour que Excel et PDF restent testables sans HTTP."""
from datetime import date, datetime
from io import BytesIO

import openpyxl
from openpyxl.styles import Font
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FORMULE_DEBUTS = ('=', '+', '-', '@')


def neutraliser(valeur):
    """Les champs libres (observation, nom) viennent d'utilisateurs : une
    cellule commençant par = + - @ serait interprétée comme une formule par
    Excel (injection). On la préfixe d'une apostrophe."""
    if isinstance(valeur, str) and valeur.startswith(FORMULE_DEBUTS):
        return "'" + valeur
    return valeur


def construire_xlsx(titre, entetes, lignes, colonnes_date=()):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = titre[:31]
    ws.append(entetes)
    for col, entete in enumerate(entetes, start=1):
        cellule = ws.cell(row=1, column=col)
        cellule.font = Font(bold=True)
        ws.column_dimensions[cellule.column_letter].width = max(len(str(entete)) + 2, 14)
    for ligne in lignes:
        ws.append([neutraliser(v) for v in ligne])
    for row in ws.iter_rows(min_row=2):
        for idx in colonnes_date:
            if isinstance(row[idx].value, (date, datetime)):
                row[idx].number_format = 'DD/MM/YYYY'
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _texte_pdf(valeur):
    """Texte d'une cellule PDF. Paragraph interprète du balisage : les champs
    libres sont échappés."""
    if isinstance(valeur, (date, datetime)):
        return valeur.strftime('%d/%m/%Y')
    texte = '' if valeur is None else str(valeur)
    return texte.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def construire_pdf(titre, entetes, lignes):
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24,
        title=titre,
    )
    styles = getSampleStyleSheet()
    cellule = styles['BodyText']
    cellule.fontSize = 7
    cellule.leading = 8.5
    donnees = [[Paragraph(f"<b>{_texte_pdf(e)}</b>", cellule) for e in entetes]]
    for ligne in lignes:
        donnees.append([Paragraph(_texte_pdf(v), cellule) for v in ligne])
    table = Table(donnees, repeatRows=1)
    table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    doc.build([Paragraph(_texte_pdf(titre), styles['Title']), Spacer(1, 8), table])
    return buf.getvalue()
```

Dans `backend/registres/views.py`, ajouter aux imports :

```python
from django.http import Http404, HttpResponse
from rest_framework.throttling import ScopedRateThrottle

from . import exports
```

puis en fin de fichier :

```python
ENTETES_MOUVEMENTS = [
    'Référence', 'Origine', 'Date de départ', 'Bénéficiaire', 'Employé concerné', 'Matricule',
    'Fonction', 'Service', 'N° contrat', 'Type de documents', 'Nombre de documents',
    'Date de retour', 'Observation',
]
ENTETES_RECEPTIONS = [
    'Référence', 'Type de document', 'Nombre', 'Expéditeur', 'Date de réception',
    'Date de classement', 'Observation',
]
COLONNES_DATE_MOUVEMENTS = (2, 11)
COLONNES_DATE_RECEPTIONS = (4, 5)
FORMATS_EXPORT = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pdf': 'application/pdf',
}


def _reference_export(reference, annulee):
    return f"{reference} (annulée)" if annulee else reference


def _lignes_export_mouvements(request, annee):
    lignes = services.registre_mouvements(
        request.user, annee, q=request.query_params.get('q', '').strip(),
        statut=request.query_params.get('statut', ''),
    )
    return [[
        _reference_export(l.reference, l.annulee), l.origine, l.date_depart, l.beneficiaire,
        l.employe, l.matricule, l.fonction, l.service, l.numero_contrat, l.type_documents,
        l.nombre_documents, l.date_retour, l.observation,
    ] for l in lignes]


def _lignes_export_receptions(request, annee):
    return [[
        _reference_export(r.reference, not r.is_active), r.type_document, r.nombre,
        r.expediteur, r.date_reception, r.date_classement, r.observation,
    ] for r in receptions_filtrees(request, annee)]


REGISTRES_EXPORTABLES = {
    'mouvements': (
        "Registre de mouvement des dossiers", ENTETES_MOUVEMENTS,
        _lignes_export_mouvements, COLONNES_DATE_MOUVEMENTS,
    ),
    'receptions': (
        "Registre de réception et de classement", ENTETES_RECEPTIONS,
        _lignes_export_receptions, COLONNES_DATE_RECEPTIONS,
    ),
}


class RegistreExportView(APIView):
    """GET /api/registres/<registre>/export/?format=xlsx|pdf — réservé aux
    gestionnaires des registres ; chaque export/impression est tracé."""
    permission_classes = [CanManageRegistres]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'registre_export'

    def get(self, request, registre):
        if registre not in REGISTRES_EXPORTABLES:
            raise Http404
        format_demande = request.query_params.get('format', '')
        if format_demande not in FORMATS_EXPORT:
            raise ValidationError({'format': "Format invalide (xlsx ou pdf)."})
        annee = annee_depuis(request)
        titre, entetes, fabrique, colonnes_date = REGISTRES_EXPORTABLES[registre]
        rows = fabrique(request, annee)
        titre_annee = f"{titre} — {annee}"
        if format_demande == 'xlsx':
            contenu = exports.construire_xlsx(titre_annee, entetes, rows, colonnes_date=colonnes_date)
            action = AuditLog.Action.EXPORT_REGISTRE
        else:
            contenu = exports.construire_pdf(titre_annee, entetes, rows)
            action = AuditLog.Action.PRINT_REGISTRE
        AuditLog.log(request, action, details={
            'registre': registre, 'annee': annee, 'format': format_demande,
            'filtres': dict(request.query_params), 'nb_lignes': len(rows),
        })
        reponse = HttpResponse(contenu, content_type=FORMATS_EXPORT[format_demande])
        reponse['Content-Disposition'] = f'attachment; filename="registre-{registre}-{annee}.{format_demande}"'
        reponse['Cache-Control'] = 'no-store'
        reponse['X-Content-Type-Options'] = 'nosniff'
        return reponse
```

Dans `backend/registres/urls.py`, importer `RegistreExportView` et placer cette route **en premier** dans `urlpatterns` (sinon `export` serait capturé comme une référence par `<str:ref>/`) :

```python
    path('<str:registre>/export/', RegistreExportView.as_view()),
```

Dans `backend/config/settings.py`, dans `DEFAULT_THROTTLE_RATES`, ajouter :

```python
        'registre_export': '10/min',  # Export/impression des registres — contient des données RH
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_registres_export.py tests/test_registres_api_mouvements.py tests/test_registres_api_receptions.py -v`
Expected: tous passent

- [ ] **Step 5: Commit**

```bash
git add backend/registres backend/config/settings.py backend/tests/test_registres_export.py
git commit -m "feat(registres): export Excel et impression PDF tracés, avec neutralisation des formules"
```

---

### Task 8: Frontend — helpers et modale de saisie

**Files:**
- Create: `frontend/src/utils/registres.js`, `frontend/src/components/registres/RegistreModal.jsx`
- Test: `frontend/src/__tests__/RegistreModal.test.jsx`

**Interfaces:**
- Produces:
  - `anneesDisponibles(annee = new Date().getFullYear()) -> number[]` (année donnée et 5 précédentes, décroissant).
  - `telechargerRegistre(registre, params) -> Promise<void>` : GET blob sur `/registres/<registre>/export/`, déclenche le téléchargement ; `params` = `{annee, q, statut, format}`.
  - `<RegistreModal titre champs valeursInitiales onSubmit onClose erreur enCours />` ; `champs` = `[{ name, label, type: "text"|"number"|"date"|"textarea", required }]` ; `onSubmit(valeurs)`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/RegistreModal.test.jsx
import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";
import RegistreModal from "../components/registres/RegistreModal";
import { anneesDisponibles } from "../utils/registres";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn() } }));

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const CHAMPS = [
  { name: "type_documents", label: "Type de documents", type: "text", required: true },
  { name: "nombre_documents", label: "Nombre de documents", type: "number", required: true },
  { name: "date_depart", label: "Date de départ", type: "date", required: true },
  { name: "observation", label: "Observation", type: "textarea" },
];

describe("RegistreModal", () => {
  test("soumet les valeurs saisies", async () => {
    const onSubmit = jest.fn();
    render(<RegistreModal titre="Nouveau mouvement" champs={CHAMPS} valeursInitiales={{ nombre_documents: 1 }} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Type de documents/), "Dossier");
    await userEvent.type(screen.getByLabelText(/Date de départ/), "2026-03-01");
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      type_documents: "Dossier", nombre_documents: 1, date_depart: "2026-03-01",
    }));
  });

  test("n'appelle pas onSubmit si un champ obligatoire est vide", async () => {
    const onSubmit = jest.fn();
    render(<RegistreModal titre="Nouveau" champs={CHAMPS} valeursInitiales={{}} onSubmit={onSubmit} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/Type de documents : champ obligatoire/)).toBeInTheDocument();
  });

  test("affiche l'erreur serveur et ferme avec Annuler", async () => {
    const onClose = jest.fn();
    render(<RegistreModal titre="Nouveau" champs={CHAMPS} valeursInitiales={{}} onSubmit={() => {}} onClose={onClose} erreur="Indiquez un employé ou un nom." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Indiquez un employé ou un nom.");
    await userEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("anneesDisponibles", () => {
  test("renvoie 6 années décroissantes depuis l'année donnée", () => {
    expect(anneesDisponibles(2026)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --watchAll=false RegistreModal`
Expected: FAIL — `Cannot find module '../components/registres/RegistreModal'`

- [ ] **Step 3: Write minimal implementation**

D'abord ouvrir `frontend/src/styles/theme.js` et noter les clés réellement disponibles pour : texte principal, texte secondaire, texte sur fond primaire, overlay de modale, ombre. Utiliser **ces noms exacts** dans le code ci-dessous à la place de `textPrimary`, `textOnPrimary` et `overlay` si ils diffèrent ; ne jamais écrire un hex ni un `rgba(...)` en dur dans un composant. Pour l'overlay, reprendre la valeur déjà utilisée par `frontend/src/components/ConfirmDialog.jsx`.

```js
// frontend/src/utils/registres.js
import api from "../services/api";

export const anneesDisponibles = (annee = new Date().getFullYear()) =>
  Array.from({ length: 6 }, (_, i) => annee - i);

// Téléchargement authentifié (cookie httpOnly) : on passe par un blob, jamais
// par un lien direct vers l'API.
export async function telechargerRegistre(registre, params) {
  const res = await api.get(`/registres/${registre}/export/`, { params, responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `registre-${registre}-${params.annee}.${params.format}`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}
```

```jsx
// frontend/src/components/registres/RegistreModal.jsx
import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";

// Modale de saisie générique des deux registres. La validation de présence
// côté client n'est là que pour l'ergonomie : le serveur reste la référence.
export default function RegistreModal({ titre, champs, valeursInitiales, onSubmit, onClose, erreur, enCours }) {
  const theme = useTheme();
  const [valeurs, setValeurs] = useState(valeursInitiales || {});
  const [manquants, setManquants] = useState([]);

  const maj = (name, valeur) => setValeurs((v) => ({ ...v, [name]: valeur }));

  const soumettre = (e) => {
    e.preventDefault();
    const vides = champs.filter((c) => c.required && (valeurs[c.name] === undefined || valeurs[c.name] === ""));
    setManquants(vides);
    if (vides.length === 0) onSubmit(valeurs);
  };

  const styleChamp = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13,
    border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.bg,
    color: theme.textPrimary, fontFamily: theme.fontFamily,
  };

  return (
    <div
      role="dialog" aria-modal="true" aria-label={titre}
      style={{ position: "fixed", inset: 0, background: theme.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
    >
      <form onSubmit={soumettre} style={{ background: theme.surface, borderRadius: 14, padding: 24, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: theme.shadow }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 17, color: theme.textPrimary }}>{titre}</h2>
        {champs.map((c) => (
          <div key={c.name} style={{ marginBottom: 12 }}>
            <label htmlFor={`reg-${c.name}`} style={{ display: "block", fontSize: 12, fontWeight: 700, color: theme.textSecondary, marginBottom: 4 }}>
              {c.label}{c.required ? " *" : ""}
            </label>
            {c.type === "textarea" ? (
              <textarea id={`reg-${c.name}`} rows={3} style={styleChamp} value={valeurs[c.name] ?? ""} onChange={(e) => maj(c.name, e.target.value)} />
            ) : (
              <input
                id={`reg-${c.name}`} type={c.type} style={styleChamp}
                min={c.type === "number" ? 1 : undefined}
                value={valeurs[c.name] ?? ""}
                onChange={(e) => maj(c.name, c.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
              />
            )}
          </div>
        ))}
        {manquants.length > 0 && (
          <p style={{ color: theme.danger, fontSize: 12 }}>
            {manquants.map((c) => `${c.label} : champ obligatoire`).join(" — ")}
          </p>
        )}
        {erreur && <p role="alert" style={{ color: theme.danger, fontSize: 13, fontWeight: 600 }}>{erreur}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "transparent", color: theme.textSecondary, fontWeight: 700, cursor: "pointer", fontFamily: theme.fontFamily }}>
            Annuler
          </button>
          <button type="submit" disabled={enCours} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: theme.primary, color: theme.textOnPrimary, fontWeight: 700, cursor: enCours ? "wait" : "pointer", fontFamily: theme.fontFamily }}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- --watchAll=false RegistreModal`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/registres.js frontend/src/components/registres/RegistreModal.jsx frontend/src/__tests__/RegistreModal.test.jsx
git commit -m "feat(registres): helpers et modale de saisie du frontend"
```

---

### Task 9: Frontend — panneaux Mouvements et Réceptions

**Files:**
- Create: `frontend/src/components/registres/MouvementsPanel.jsx`, `frontend/src/components/registres/ReceptionsPanel.jsx`
- Test: `frontend/src/__tests__/RegistresPanels.test.jsx`

**Interfaces:**
- Consumes: `api`, `RegistreModal`, `anneesDisponibles`, `telechargerRegistre`, `formatDateFR` (`utils/formatDate.js`), `usePrompt` (`components/ConfirmDialog`, retourne `{ prompt, PromptDialog }` ; `prompt(message, defaut)` → `string | null`).
- Produces: `<MouvementsPanel />`, `<ReceptionsPanel />` (sans props ; autonomes).

Comportement `MouvementsPanel` : tableau des colonnes de la note ; pastille « Consultation » / « Manuel » ; ligne annulée barrée avec son motif ; « Enregistrer le retour » en un clic sur les lignes **manuelles** non rendues, suivi de `fetchLignes(true)` ; « Annuler » avec motif via `usePrompt()` ; « Imprimer » (pdf) et « Télécharger » (xlsx). Les lignes `origine === "consultation"` n'ont **aucune** action. `ReceptionsPanel` est symétrique (« Classer » au lieu du retour).

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/RegistresPanels.test.jsx
import React from "react";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../utils/registres", () => ({
  ...jest.requireActual("../utils/registres"),
  telechargerRegistre: jest.fn().mockResolvedValue(undefined),
}));

import api from "../services/api";
import { telechargerRegistre } from "../utils/registres";
import MouvementsPanel from "../components/registres/MouvementsPanel";
import ReceptionsPanel from "../components/registres/ReceptionsPanel";

const render = (ui) => rtlRender(ui, { wrapper: ThemeProvider });

const MANUEL = {
  reference: "M-00001/26", origine: "manuel", date_depart: "2026-03-01", date_retour: null,
  beneficiaire: "M. Directeur", employe: "Dupont Jean", matricule: "EMP-001", fonction: "Ingénieur",
  service: "Paie", numero_contrat: "CTR-1", type_documents: "Dossier", nombre_documents: 3,
  observation: "", annulee: false, motif_annulation: "",
};
const CONSULTATION = { ...MANUEL, reference: "C-00002/26", origine: "consultation", date_retour: "2026-03-04" };
const ANNULEE = { ...MANUEL, reference: "M-00003/26", annulee: true, motif_annulation: "Doublon" };

describe("MouvementsPanel", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    telechargerRegistre.mockResolvedValue(undefined);
  });

  test("affiche manuel et consultation, sans action de modification sur la consultation", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL, CONSULTATION] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText("M-00001/26")).toBeInTheDocument();
    expect(screen.getByText("C-00002/26")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Enregistrer le retour/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Annuler la ligne" })).toHaveLength(1);
  });

  test("le retour en un clic rafraîchit sans démonter la liste", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    api.post.mockResolvedValue({ data: {} });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Enregistrer le retour/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/registres/mouvements/M-00001-26/retour/"));
    // Rafraîchissement silencieux : la ligne reste affichée, pas de « Chargement… ».
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
    expect(screen.getByText("M-00001/26")).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  test("la ligne annulée porte son motif et n'a plus d'action", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [ANNULEE] } });
    render(<MouvementsPanel />);
    expect(await screen.findByText(/Annulée : Doublon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Enregistrer le retour/ })).not.toBeInTheDocument();
  });

  test("Imprimer et Télécharger passent par telechargerRegistre avec le bon format", async () => {
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    render(<MouvementsPanel />);
    await screen.findByText("M-00001/26");
    await userEvent.click(screen.getByRole("button", { name: "Imprimer" }));
    expect(telechargerRegistre).toHaveBeenCalledWith("mouvements", expect.objectContaining({ format: "pdf" }));
    await userEvent.click(screen.getByRole("button", { name: "Télécharger" }));
    expect(telechargerRegistre).toHaveBeenCalledWith("mouvements", expect.objectContaining({ format: "xlsx" }));
  });

  test("window.prompt et window.confirm ne sont jamais utilisés", async () => {
    const prompt = jest.spyOn(window, "prompt").mockImplementation(() => null);
    const confirm = jest.spyOn(window, "confirm").mockImplementation(() => false);
    api.get.mockResolvedValue({ data: { annee: 2026, results: [MANUEL] } });
    render(<MouvementsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "Annuler la ligne" }));
    expect(prompt).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("ReceptionsPanel", () => {
  beforeEach(() => jest.resetAllMocks());

  test("classer en un clic", async () => {
    const reception = {
      slug: "R-00001-26", reference: "R-00001/26", type_document: "Courrier", nombre: 2, expediteur: "DRH",
      date_reception: "2026-03-01", date_classement: null, observation: "", is_active: true, motif_annulation: "",
    };
    api.get.mockResolvedValue({ data: { annee: 2026, results: [reception] } });
    api.post.mockResolvedValue({ data: {} });
    render(<ReceptionsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: /Classer/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/registres/receptions/R-00001-26/classer/"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --watchAll=false RegistresPanels`
Expected: FAIL — modules introuvables

- [ ] **Step 3: Write minimal implementation**

Pour les noms de tokens (`textPrimary`, etc.), appliquer la même règle qu'à la Task 8 : utiliser les clés réelles de `theme.js`.

```jsx
// frontend/src/components/registres/MouvementsPanel.jsx
import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { formatDateFR } from "../../utils/formatDate";
import { anneesDisponibles, telechargerRegistre } from "../../utils/registres";
import RegistreModal from "./RegistreModal";

const CHAMPS = [
  { name: "nom_libre", label: "Nom et prénom (si pas d'employé)", type: "text" },
  { name: "beneficiaire", label: "Bénéficiaire (qui prend le dossier)", type: "text" },
  { name: "fonction", label: "Fonction", type: "text" },
  { name: "service", label: "Service / Département", type: "text" },
  { name: "numero_contrat", label: "N° de contrat", type: "text" },
  { name: "type_documents", label: "Type de documents", type: "text", required: true },
  { name: "nombre_documents", label: "Nombre de documents", type: "number", required: true },
  { name: "date_depart", label: "Date de départ", type: "date", required: true },
  { name: "date_retour", label: "Date de retour", type: "date" },
  { name: "observation", label: "Observation", type: "textarea" },
];

const slugDe = (reference) => reference.replace("/", "-");

export default function MouvementsPanel() {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modale, setModale] = useState(false);
  const [erreurModale, setErreurModale] = useState("");

  const fetchLignes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/registres/mouvements/", { params: { annee, q, statut } });
      setLignes(res.data?.results || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger le registre.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [annee, q, statut]);

  useEffect(() => { fetchLignes(); }, [fetchLignes]);

  const action = async (url, corps) => {
    try {
      await api.post(url, corps);
      setError("");
      await fetchLignes(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Action impossible.");
    }
  };

  const annuler = async (ligne) => {
    const motif = await prompt(`Motif de l'annulation de ${ligne.reference} :`, "");
    if (motif === null) return;
    await action(`/registres/mouvements/${slugDe(ligne.reference)}/annuler/`, { motif: motif.trim() });
  };

  const creer = async (valeurs) => {
    const corps = Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== "" && v !== undefined));
    try {
      await api.post("/registres/mouvements/", corps);
      setModale(false);
      setErreurModale("");
      await fetchLignes(true);
    } catch (err) {
      const data = err.response?.data;
      setErreurModale(data?.non_field_errors?.[0] || data?.detail || "Enregistrement impossible.");
    }
  };

  const exporter = (format) => telechargerRegistre("mouvements", { annee, q, statut, format })
    .catch(() => setError("Export impossible."));

  const cellule = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${theme.border}`, color: theme.textPrimary, verticalAlign: "top" };
  const entete = { ...cellule, fontWeight: 700, color: theme.textSecondary, textAlign: "left", background: theme.bg };
  const bouton = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: theme.fontFamily };

  return (
    <div>
      {PromptDialog}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select aria-label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={bouton}>
          {anneesDisponibles().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input aria-label="Rechercher" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...bouton, fontWeight: 400, minWidth: 180 }} />
        <select aria-label="Filtre" value={statut} onChange={(e) => setStatut(e.target.value)} style={bouton}>
          <option value="">Tous</option>
          <option value="en_cours">Non rendus</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" style={bouton} onClick={() => setModale(true)}>Nouveau mouvement</button>
        <button type="button" style={bouton} onClick={() => exporter("pdf")}>Imprimer</button>
        <button type="button" style={bouton} onClick={() => exporter("xlsx")}>Télécharger</button>
      </div>
      {error && <p role="alert" style={{ color: theme.danger, fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: theme.textMuted }}>Chargement…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: theme.surface }}>
            <thead>
              <tr>
                {["Réf.", "Origine", "Départ", "Bénéficiaire", "Employé", "Fonction / Service", "N° contrat", "Documents", "Retour", "Observation", ""].map((h, i) => <th key={i} style={entete}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.reference} style={{ opacity: l.annulee ? 0.55 : 1, textDecoration: l.annulee ? "line-through" : "none" }}>
                  <td style={cellule}>{l.reference}</td>
                  <td style={cellule}>{l.origine === "consultation" ? "Consultation" : "Manuel"}</td>
                  <td style={cellule}>{formatDateFR(l.date_depart)}</td>
                  <td style={cellule}>{l.beneficiaire}</td>
                  <td style={cellule}>{l.employe}{l.matricule ? ` (${l.matricule})` : ""}</td>
                  <td style={cellule}>{[l.fonction, l.service].filter(Boolean).join(" — ")}</td>
                  <td style={cellule}>{l.numero_contrat}</td>
                  <td style={cellule}>{l.type_documents} ({l.nombre_documents})</td>
                  <td style={cellule}>{l.date_retour ? formatDateFR(l.date_retour) : "En cours"}</td>
                  <td style={cellule}>{l.annulee ? `Annulée : ${l.motif_annulation}` : l.observation}</td>
                  <td style={cellule}>
                    {l.origine === "manuel" && !l.annulee && (
                      <>
                        {!l.date_retour && (
                          <button type="button" style={bouton} onClick={() => action(`/registres/mouvements/${slugDe(l.reference)}/retour/`)}>
                            Enregistrer le retour
                          </button>
                        )}{" "}
                        <button type="button" style={{ ...bouton, color: theme.danger }} aria-label="Annuler la ligne" onClick={() => annuler(l)}>
                          Annuler
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && <tr><td style={cellule} colSpan={11}>Aucun mouvement pour cette année.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {modale && (
        <RegistreModal
          titre="Nouveau mouvement" champs={CHAMPS}
          valeursInitiales={{ nombre_documents: 1 }}
          onSubmit={creer} onClose={() => { setModale(false); setErreurModale(""); }} erreur={erreurModale}
        />
      )}
    </div>
  );
}
```

```jsx
// frontend/src/components/registres/ReceptionsPanel.jsx
import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { usePrompt } from "../ConfirmDialog";
import { formatDateFR } from "../../utils/formatDate";
import { anneesDisponibles, telechargerRegistre } from "../../utils/registres";
import RegistreModal from "./RegistreModal";

const CHAMPS = [
  { name: "type_document", label: "Type de document", type: "text", required: true },
  { name: "nombre", label: "Nombre", type: "number", required: true },
  { name: "expediteur", label: "Expéditeur", type: "text", required: true },
  { name: "date_reception", label: "Date de réception", type: "date", required: true },
  { name: "date_classement", label: "Date de classement", type: "date" },
  { name: "observation", label: "Observation", type: "textarea" },
];

export default function ReceptionsPanel() {
  const theme = useTheme();
  const { prompt, PromptDialog } = usePrompt();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [lignes, setLignes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modale, setModale] = useState(false);
  const [erreurModale, setErreurModale] = useState("");

  const fetchLignes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/registres/receptions/", { params: { annee, q, statut } });
      setLignes(res.data?.results || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || "Impossible de charger le registre.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [annee, q, statut]);

  useEffect(() => { fetchLignes(); }, [fetchLignes]);

  const action = async (url, corps) => {
    try {
      await api.post(url, corps);
      setError("");
      await fetchLignes(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Action impossible.");
    }
  };

  const annuler = async (ligne) => {
    const motif = await prompt(`Motif de l'annulation de ${ligne.reference} :`, "");
    if (motif === null) return;
    await action(`/registres/receptions/${ligne.slug}/annuler/`, { motif: motif.trim() });
  };

  const creer = async (valeurs) => {
    const corps = Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v !== "" && v !== undefined));
    try {
      await api.post("/registres/receptions/", corps);
      setModale(false);
      setErreurModale("");
      await fetchLignes(true);
    } catch (err) {
      const data = err.response?.data;
      setErreurModale(data?.non_field_errors?.[0] || data?.detail || "Enregistrement impossible.");
    }
  };

  const exporter = (format) => telechargerRegistre("receptions", { annee, q, statut, format })
    .catch(() => setError("Export impossible."));

  const cellule = { padding: "8px 10px", fontSize: 12, borderBottom: `1px solid ${theme.border}`, color: theme.textPrimary, verticalAlign: "top" };
  const entete = { ...cellule, fontWeight: 700, color: theme.textSecondary, textAlign: "left", background: theme.bg };
  const bouton = { padding: "6px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textSecondary, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: theme.fontFamily };

  return (
    <div>
      {PromptDialog}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select aria-label="Année" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} style={bouton}>
          {anneesDisponibles().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input aria-label="Rechercher" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...bouton, fontWeight: 400, minWidth: 180 }} />
        <select aria-label="Filtre" value={statut} onChange={(e) => setStatut(e.target.value)} style={bouton}>
          <option value="">Tous</option>
          <option value="a_classer">À classer</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" style={bouton} onClick={() => setModale(true)}>Nouvelle réception</button>
        <button type="button" style={bouton} onClick={() => exporter("pdf")}>Imprimer</button>
        <button type="button" style={bouton} onClick={() => exporter("xlsx")}>Télécharger</button>
      </div>
      {error && <p role="alert" style={{ color: theme.danger, fontSize: 13 }}>{error}</p>}
      {loading ? <p style={{ color: theme.textMuted }}>Chargement…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: theme.surface }}>
            <thead>
              <tr>
                {["Réf.", "Type", "Nombre", "Expéditeur", "Réception", "Classement", "Observation", ""].map((h, i) => <th key={i} style={entete}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.reference} style={{ opacity: l.is_active ? 1 : 0.55, textDecoration: l.is_active ? "none" : "line-through" }}>
                  <td style={cellule}>{l.reference}</td>
                  <td style={cellule}>{l.type_document}</td>
                  <td style={cellule}>{l.nombre}</td>
                  <td style={cellule}>{l.expediteur}</td>
                  <td style={cellule}>{formatDateFR(l.date_reception)}</td>
                  <td style={cellule}>{l.date_classement ? formatDateFR(l.date_classement) : "À classer"}</td>
                  <td style={cellule}>{l.is_active ? l.observation : `Annulée : ${l.motif_annulation}`}</td>
                  <td style={cellule}>
                    {l.is_active && (
                      <>
                        {!l.date_classement && (
                          <button type="button" style={bouton} onClick={() => action(`/registres/receptions/${l.slug}/classer/`)}>
                            Classer
                          </button>
                        )}{" "}
                        <button type="button" style={{ ...bouton, color: theme.danger }} aria-label="Annuler la ligne" onClick={() => annuler(l)}>
                          Annuler
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && <tr><td style={cellule} colSpan={8}>Aucune réception pour cette année.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {modale && (
        <RegistreModal
          titre="Nouvelle réception" champs={CHAMPS}
          valeursInitiales={{ nombre: 1 }}
          onSubmit={creer} onClose={() => { setModale(false); setErreurModale(""); }} erreur={erreurModale}
        />
      )}
    </div>
  );
}
```

Duplication assumée entre les deux panneaux (filtres, tableau, annulation) : les colonnes et actions diffèrent, et les extraire dans un composant commun est prématuré pour deux usages. À factoriser si un troisième registre apparaît.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- --watchAll=false RegistresPanels RegistreModal`
Expected: tous passent

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/registres frontend/src/__tests__/RegistresPanels.test.jsx
git commit -m "feat(registres): panneaux Mouvements et Réceptions du frontend"
```

---

### Task 10: Frontend — page, route, navbar

**Files:**
- Create: `frontend/src/pages/Registres.jsx`
- Modify: `frontend/src/App.js` (lazy import + route), `frontend/src/components/Navbar.jsx:144-158` (entrée « Registres »)
- Test: `frontend/src/__tests__/Registres.test.jsx`

**Interfaces:**
- Consumes: `MouvementsPanel`, `ReceptionsPanel`, `Navbar`, `PageBackground`.
- Produces: route `/registres` ; entrée navbar « Registres » visible si `user.can_manage_consultations`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/Registres.test.jsx
import React from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../context/ThemeContext";

jest.mock("../services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../components/Navbar", () => () => <nav data-testid="navbar" />);

import api from "../services/api";
import Registres from "../pages/Registres";

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: ThemeProvider });

describe("Registres (page)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    api.get.mockResolvedValue({ data: { annee: 2026, results: [] } });
  });

  test("affiche l'onglet Mouvements par défaut puis Réceptions", async () => {
    render(<Registres />);
    expect(await screen.findByText("Aucun mouvement pour cette année.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Réceptions" }));
    expect(await screen.findByText("Aucune réception pour cette année.")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/registres/receptions/", expect.anything());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- --watchAll=false "Registres.test"`
Expected: FAIL — `Cannot find module '../pages/Registres'`

- [ ] **Step 3: Write minimal implementation**

D'abord lire l'enveloppe de page de `frontend/src/pages/Consultations.jsx` (autour de la ligne 200 : `PageBackground`, `Navbar`, usage de `contentPadding`/`heroPadding`) et reproduire exactement le même usage dans `Registres.jsx`.

```jsx
// frontend/src/pages/Registres.jsx
import { useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { contentPadding } from "../styles/theme";
import useIsMobile from "../hooks/useIsMobile";
import Navbar from "../components/Navbar";
import PageBackground from "../components/PageBackground";
import MouvementsPanel from "../components/registres/MouvementsPanel";
import ReceptionsPanel from "../components/registres/ReceptionsPanel";

const ONGLETS = [
  { id: "mouvements", label: "Mouvements" },
  { id: "receptions", label: "Réceptions" },
];

export default function Registres() {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const [onglet, setOnglet] = useState("mouvements");

  return (
    <PageBackground>
      <Navbar />
      <div style={{ padding: contentPadding(isMobile) }}>
        <h1 style={{ fontSize: 20, color: theme.textPrimary, margin: "0 0 12px" }}>Registres d'archives</h1>
        <div role="tablist" aria-label="Registre" style={{ display: "inline-flex", gap: 4, padding: 4, marginBottom: 16, background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 10 }}>
          {ONGLETS.map((o) => {
            const actif = onglet === o.id;
            return (
              <button
                key={o.id} type="button" role="tab" aria-selected={actif}
                onClick={() => setOnglet(o.id)}
                style={{
                  border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 13, fontWeight: 700,
                  cursor: actif ? "default" : "pointer", fontFamily: theme.fontFamily,
                  background: actif ? theme.surface : "transparent",
                  color: actif ? theme.primary : theme.textSecondary,
                  boxShadow: actif ? theme.shadow : "none",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {onglet === "mouvements" ? <MouvementsPanel /> : <ReceptionsPanel />}
      </div>
    </PageBackground>
  );
}
```

Si `contentPadding` n'est pas une fonction de `isMobile` (voir `styles/theme.js` et son usage dans `Consultations.jsx`), l'employer exactement comme `Consultations.jsx` le fait.

Dans `frontend/src/App.js`, après la ligne `const Consultations = lazy(...)` :

```js
const Registres = lazy(() => import("./pages/Registres"));
```

et, après la route `/consultations/:ref` :

```jsx
          <Route
            path="/registres"
            element={
              <ProtectedRoute
                allowedRoles={["ADMIN", "SUPERADMIN"]}
                requireFn={(u) => !!u?.can_manage_consultations}
              >
                <Registres />
              </ProtectedRoute>
            }
          />
```

Dans `frontend/src/components/Navbar.jsx`, dans le tableau `navLinks`, juste après l'entrée « Demandes » :

```js
    {
      path: "/registres", label: "Registres",
      show: !!user?.can_manage_consultations,
    },
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npm test -- --watchAll=false Registre`
Expected: tous les tests `Registre*` passent. Puis la suite complète : `cd frontend && npm test -- --watchAll=false` (261+ tests existants, aucune régression).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Registres.jsx frontend/src/App.js frontend/src/components/Navbar.jsx frontend/src/__tests__/Registres.test.jsx
git commit -m "feat(registres): page /registres, route protégée et entrée de navbar"
```

---

### Task 11: Documentation vivante et vérification finale

**Files:**
- Create: `docs/fonctionnel/registres.md`
- Modify: `securite.md` (nouveau point), `CLAUDE.md` (index, routes, règle critique), `docs/superpowers/specs/2026-10-10-registres-design.md` (correction 404 → 403)

- [ ] **Step 1: Relever le numéro du prochain point de `securite.md`**

Run: `grep -n "^## \|^### " securite.md | tail -5`
Expected: dernier point = 45 (export Excel des employés) ; le nouveau sera 46. Si le dernier est différent, utiliser le suivant et corriger les renvois « point 46 » ci-dessous.

- [ ] **Step 2: Écrire `docs/fonctionnel/registres.md`**

```markdown
# Registres de mouvement et de réception (2026-10-11)

> À lire avant de toucher à l'app `registres` (registre 01 mouvement, registre 02 réception/classement, export, impression).
> Spec : `docs/superpowers/specs/2026-10-10-registres-design.md` — plan : `docs/superpowers/plans/2026-10-11-registres.md`.
> Journal de sécurité : `securite.md` point 46.

## Besoin
Tenir les deux registres d'un service d'archives, à partir de la note manuscrite du propriétaire :
registre 01 (sortie et retour des dossiers) et registre 02 (documents reçus, puis classés).

## Qui fait quoi
SUPERADMIN, ou ADMIN avec `charge_consultation` (`User.can_manage_consultations`). Tout autre compte : 403 sur les routes de liste, création, modification et export.

## Modèle
`MouvementArchive` (`M-NNNNN/AA`), `ReceptionDocument` (`R-NNNNN/AA`), `RegistreReferenceCounter` (compteur par type et par année).
Le registre 01 = `services.registre_mouvements` : lignes manuelles + consultations validées ou révoquées de l'année, jamais copiées.

## Pièges et choix
- `Q(a) | Q()` vaut `Q(a)` : ne combiner le scoping qu'avec un `Q` non vide (`_lignes_consultations`).
- Aucun DELETE ; annulation = soft-delete avec motif ; chaque modification trace l'ancienne valeur dans l'audit.
- Export Excel : cellules commençant par `= + - @` préfixées d'une apostrophe (injection de formule). Dates en `DD/MM/YYYY`. PDF : champs libres échappés (ReportLab interprète du balisage).
- `<registre>/export/` doit rester **avant** `<registre>/<ref>/` dans `registres/urls.py`.
- Les lignes issues d'une consultation n'ont aucune action de modification dans le registre : on les gère dans /consultations.
- « Nom prénom » de la note = bénéficiaire (qui prend le dossier) ; fonction/service/contrat = ceux de l'employé concerné.

## Approches écartées
- Copier chaque consultation validée dans `MouvementArchive` : synchronisation à chaque prolongation, révocation ou purge ; un oubli rend le registre faux.
- Étendre l'app `consultations` : mélange deux métiers, déjà écarté pour les attestations.
- Nouveau drapeau « archiviste » : rôle supplémentaire à gérer pour un gain faible.
- « Envoyer » par e-mail : SMTP à configurer et données personnelles hors de SOMIZ.

## Tests
`backend/tests/test_registres_*.py` (modèles, audit, vue, API mouvements, API réceptions, scoping, export) et
`frontend/src/__tests__/Registre*.test.jsx` (modale, panneaux, page). Indiquer ici les nombres réels après exécution.

## Après un `git pull` de cette branche
`python manage.py migrate` (tables `registre_*` + nouvelles actions d'audit). Aucune tâche planifiée à créer.
```

- [ ] **Step 3: Ajouter le point 46 à `securite.md`**

Reprendre le format des points existants (date, constat, décision, test). À couvrir : accès limité aux traiteurs (permission testée sur vraies routes), absence de DELETE (pièce probante), audit de chaque création/modification/annulation/retour/classement/export/impression, neutralisation des formules Excel, échappement du balisage PDF, throttle `registre_export` à 10/min, export sans colonnes sensibles NIN/sécu/RIB, `Cache-Control: no-store` sur les fichiers exportés.

- [ ] **Step 4: Mettre à jour `CLAUDE.md`**

Ajouter dans l'index par chantier :

```markdown
- [`docs/fonctionnel/registres.md`](docs/fonctionnel/registres.md) — À lire avant de toucher à l'app registres (registre de mouvement des dossiers, registre de réception/classement, export Excel/PDF).
```

Ajouter au tableau des routes : `/registres` — Registres d'archives (mouvement + réception) — SUPERADMIN, ADMIN `charge_consultation`. Ajouter dans « Règles critiques » : « Les registres (`registres`) n'ont jamais de DELETE ; toute modification est tracée avec l'ancienne valeur ; export et impression sont tracés et sans colonnes sensibles — voir `registres.md`. »

- [ ] **Step 5: Corriger la spec (403, pas 404)**

Dans `docs/superpowers/specs/2026-10-10-registres-design.md` : remplacer « Autres : 404 » par « Autres : 403 (comme `CanAccessConsultations`) » dans le tableau des décisions, et « CONSULTANT/GESTIONNAIRE → 404 » par « CONSULTANT/GESTIONNAIRE/ADMIN sans drapeau → 403 » dans « Tests prévus ».

- [ ] **Step 6: Vérification finale**

Run: `cd backend && pytest -q`
Expected: toute la suite passe (188+ tests existants et les nouveaux tests registres).

Run: `cd frontend && npm test -- --watchAll=false`
Expected: toute la suite passe (261+ tests existants et les nouveaux).

Run: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

Run: `grep -rn "window.confirm\|window.prompt" frontend/src/components/registres frontend/src/pages/Registres.jsx`
Expected: aucune sortie.

Run: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" frontend/src/components/registres frontend/src/pages/Registres.jsx`
Expected: aucune sortie (aucune couleur codée en dur).

- [ ] **Step 7: Commit**

```bash
git add docs securite.md CLAUDE.md
git commit -m "docs(registres): fiche fonctionnelle, journal de sécurité (point 46) et index CLAUDE.md"
```

---

## Self-Review (spec ↔ plan)

| Exigence de la spec | Tâche |
|---|---|
| Modèles `MouvementArchive`, `ReceptionDocument`, compteur | 1 |
| Références `M-`/`R-NNNNN/AA`, jamais réutilisées | 1, 4, 5 |
| Vue calculée : consultations validées/révoquées, retour dérivé, nombre de documents | 3 |
| Accès SUPERADMIN + ADMIN traiteur, 403 sinon, testé sur vraies routes | 3 (permission), 4, 5, 7 |
| Scoping employé / consultations | 3, 6 |
| Pas de DELETE, annulation avec motif, ligne visible barrée | 3, 4, 5, 9 |
| Audit (création, modification avec ancienne valeur, annulation, retour, classement, export, impression) | 2, 4, 5, 7 |
| Export Excel sans colonnes sensibles, impression PDF, tracés, throttle | 7 |
| Pas d'« Envoyer » par e-mail | volontairement absent |
| Navbar « Registres », onglets Mouvements/Réceptions, filtres, saisie, retour et classement en un clic, refresh silencieux | 9, 10 |
| Modale de saisie, pas de `window.confirm/prompt`, tokens | 8, 9, 11 (greps) |
| Documentation (`securite.md`, `CLAUDE.md`, fiche fonctionnelle) | 11 |

Écart connu avec la spec, corrigé à la Task 11 : la spec disait « 404 » pour les comptes non autorisés ; le plan applique 403 sur les routes de liste, comme `CanAccessConsultations`.

Hypothèse à faire confirmer avant exécution : « Nom prénom » de la note = bénéficiaire (qui prend le dossier) ; fonction, service et n° de contrat = ceux de l'employé concerné.

"""
apps/accounts/models.py
Modèle utilisateur custom SOMIZ avec rôles et sécurité login
"""

import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.conf import settings


class UserManager(BaseUserManager):
    """Manager custom — pas d'auto-inscription possible."""

    def create_user(self, username, password, role='CONSULTANT', **extra_fields):
        if not username:
            raise ValueError("Le nom d'utilisateur est obligatoire.")
        user = self.model(username=username, role=role, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password, **extra_fields):
        extra_fields.setdefault('role', 'ADMIN')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(username, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Utilisateur SOMIZ.
    Deux rôles : ADMIN (écriture) et CONSULTANT (lecture seule).
    Création uniquement par un ADMIN — pas d'auto-inscription.
    """

    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrateur'
        CONSULTANT = 'CONSULTANT', 'Consultant (lecture seule)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=50, unique=True, verbose_name="Identifiant")
    nom = models.CharField(max_length=100, verbose_name="Nom")
    prenom = models.CharField(max_length=100, verbose_name="Prénom")
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CONSULTANT,
        verbose_name="Rôle"
    )

    # Sécurité : blocage après N tentatives
    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    # Traçabilité
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    created_by = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='created_users',
        verbose_name="Créé par"
    )

    is_active = models.BooleanField(default=True, verbose_name="Compte actif")
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    # Loi 18-07 (Algérie) — consentement au traitement des données
    # personnelles, requis avant tout accès. null = jamais consenti.
    # Un seul consentement à vie par compte (pas de versionnage du texte).
    consent_loi1807_accepted_at = models.DateTimeField(
        null=True, blank=True, verbose_name="Consentement Loi 18-07 accepté le"
    )

    # Périmètre d'accès (CONSULTANT uniquement — ADMIN garde toujours l'accès
    # complet). Plusieurs directions/départements/services peuvent être
    # sélectionnés simultanément (union — un employé est visible dès qu'il
    # correspond à AU MOINS un des éléments choisis, à n'importe quel niveau).
    # Aucun des trois non-vide = accès non restreint (comportement historique
    # préservé pour les comptes existants).
    scope_directions = models.ManyToManyField(
        'employees.Direction', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Directions"
    )
    scope_poles = models.ManyToManyField(
        'employees.Pole', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Pôles"
    )
    scope_departements = models.ManyToManyField(
        'employees.Departement', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Départements"
    )
    scope_services = models.ManyToManyField(
        'employees.Service', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Services"
    )
    scope_cellules = models.ManyToManyField(
        'employees.Cellule', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Cellules"
    )
    # Périmètre indépendant : restreint les TYPES de documents visibles,
    # combiné en ET avec le périmètre organisationnel ci-dessus (un
    # CONSULTANT restreint aux deux ne voit que les documents des types
    # autorisés, pour les employés de son périmètre organisationnel).
    # Vide = accès non restreint (même règle que les 3 champs ci-dessus).
    scope_types_documents = models.ManyToManyField(
        'employees.TypeDocument', blank=True, related_name='scoped_users',
        verbose_name="Périmètre — Types de documents"
    )

    objects = UserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['nom', 'prenom']

    class Meta:
        db_table = 'auth_users'
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        ordering = ['nom', 'prenom']

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.role})"

    @property
    def full_name(self):
        return f"{self.prenom} {self.nom}"

    @property
    def is_admin(self):
        return self.role == self.Role.ADMIN

    @property
    def is_consultant(self):
        return self.role == self.Role.CONSULTANT

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
        non restreint (ADMIN, ou CONSULTANT sans périmètre ni grant —
        comportement historique préservé).
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

    def accessible_poles_qs(self):
        """Pôles visibles pour ce compte."""
        from employees.models import Pole
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Pole.objects.all()
        return Pole.objects.filter(
            Q(direction_id__in=direction_ids)
            | Q(id__in=pole_ids)
            | Q(departements__id__in=departement_ids)
            | Q(departements__services__id__in=service_ids)
        ).distinct()

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

    def accessible_services_qs(self):
        """Services visibles pour ce compte."""
        from employees.models import Service
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Service.objects.all()
        return Service.objects.filter(
            Q(departement__direction_id__in=direction_ids)
            | Q(departement__pole_id__in=pole_ids)
            | Q(departement_id__in=departement_ids)
            | Q(id__in=service_ids)
        ).distinct()

    def accessible_cellules_qs(self):
        """Cellules visibles pour ce compte."""
        from employees.models import Cellule
        direction_ids, pole_ids, departement_ids, service_ids, cellule_ids = self._scope_ids()
        if not (direction_ids or pole_ids or departement_ids or service_ids or cellule_ids):
            return Cellule.objects.all()
        return Cellule.objects.filter(
            Q(direction_id__in=direction_ids)
            | Q(departement_id__in=departement_ids)
            | Q(id__in=cellule_ids)
        ).distinct()

    def _type_doc_scope_ids(self):
        """IDs des TypeDocument sélectionnés — set vide si aucune restriction."""
        if self.is_admin or not self.pk:
            return set()
        return set(self.scope_types_documents.values_list('id', flat=True))

    @property
    def has_type_doc_scope_restriction(self):
        """True si ce compte est restreint à certains types de documents."""
        return bool(self._type_doc_scope_ids())

    def document_type_scope_q(self, prefix='type_doc_id'):
        """
        Q object à appliquer sur un queryset EmployeeDocument (ou
        EmployeeDocumentFile via prefix='document__type_doc_id') pour
        restreindre aux types de documents autorisés. Combiné en ET avec
        employee_scope_q() — ce sont deux périmètres indépendants (qui vs
        quoi). Q() vide = accès non restreint.
        """
        type_ids = self._type_doc_scope_ids()
        if not type_ids:
            return Q()
        return Q(**{f'{prefix}__in': type_ids})

    def can_access_document_type(self, type_doc_id):
        """Vérification objet-par-objet équivalente à document_type_scope_q()."""
        type_ids = self._type_doc_scope_ids()
        if not type_ids:
            return True
        return type_doc_id in type_ids

    def _granted_type_doc_ids_for_employee(self, employee_id):
        """(full_dossier: bool, type_doc_ids: set) pour un employé donné.
        full_dossier=True si un grant type_doc=None existe (couvre tout,
        type_doc_ids est alors ignorable)."""
        if self.is_admin or not self.pk:
            return True, set()
        rows = list(self.employee_grants.filter(employee_id=employee_id).values_list('type_doc_id', flat=True))
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

    def accessible_types_documents_qs(self):
        """Types de documents visibles pour ce compte."""
        from employees.models import TypeDocument
        type_ids = self._type_doc_scope_ids()
        if not type_ids:
            return TypeDocument.objects.all()
        return TypeDocument.objects.filter(id__in=type_ids)

    def is_locked(self):
        """Vérifie si le compte est bloqué suite aux tentatives échouées."""
        if self.locked_until and timezone.now() < self.locked_until:
            return True
        return False

    def register_failed_login(self):
        """Incrémente le compteur d'échecs et verrouille si nécessaire."""
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
            self.locked_until = timezone.now() + settings.LOGIN_LOCKOUT_DURATION
        self.save(update_fields=['failed_login_attempts', 'locked_until'])

    def reset_login_attempts(self):
        """Réinitialise après connexion réussie."""
        self.failed_login_attempts = 0
        self.locked_until = None
        self.save(update_fields=['failed_login_attempts', 'locked_until'])

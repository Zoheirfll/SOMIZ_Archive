"""
apps/accounts/models.py
Modèle utilisateur custom SOMIZ avec rôles et sécurité login
"""

import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
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

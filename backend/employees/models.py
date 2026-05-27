"""
employees/models.py
Modèles principaux : Référentiels + Employé + Documents
"""

import uuid
import os
from django.db import models
from django.conf import settings
from django.core.validators import FileExtensionValidator


# ─── RÉFÉRENTIELS ─────────────────────────────────────────────────────────────

class Direction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=150, unique=True, verbose_name="Nom")
    code = models.CharField(max_length=20, unique=True, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'directions'
        verbose_name = "Direction"
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Departement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    direction = models.ForeignKey(
        Direction, on_delete=models.CASCADE,
        related_name='departements', verbose_name="Direction"
    )
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'departements'
        verbose_name = "Département"
        ordering = ['direction__nom', 'nom']
        unique_together = [['direction', 'nom']]

    def __str__(self):
        return f"{self.direction.nom} → {self.nom}"


class Service(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    departement = models.ForeignKey(
        Departement, on_delete=models.CASCADE,
        related_name='services', verbose_name="Département"
    )
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'services'
        verbose_name = "Service"
        ordering = ['departement__nom', 'nom']
        unique_together = [['departement', 'nom']]

    def __str__(self):
        return f"{self.departement.nom} → {self.nom}"


class Poste(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=150, unique=True, verbose_name="Intitulé")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'postes'
        verbose_name = "Poste"
        ordering = ['nom']

    def __str__(self):
        return self.nom


class TypeContrat(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True, verbose_name="Type de contrat")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'types_contrat'
        verbose_name = "Type de contrat"
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Categorie(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, unique=True, verbose_name="Catégorie")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'categories'
        verbose_name = "Catégorie"
        ordering = ['nom']

    def __str__(self):
        return self.nom


# ─── EMPLOYEE ─────────────────────────────────────────────────────────────────

class Employee(models.Model):

    class Statut(models.TextChoices):
        ACTIF = 'actif', 'Actif'
        INACTIF = 'inactif', 'Inactif'
        ARCHIVE = 'archive', 'Archivé'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    matricule = models.CharField(max_length=20, unique=True, db_index=True)
    nom = models.CharField(max_length=100, db_index=True)
    prenom = models.CharField(max_length=100)
    date_naissance = models.DateField(null=True, blank=True)
    date_embauche = models.DateField(null=True, blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.ACTIF)

    # Référentiels liés
    direction = models.ForeignKey(
        Direction, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    departement = models.ForeignKey(
        Departement, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    service = models.ForeignKey(
        Service, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    poste = models.ForeignKey(
        Poste, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    type_contrat = models.ForeignKey(
        TypeContrat, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    categorie = models.ForeignKey(
        Categorie, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='employees_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employees'
        verbose_name = "Employé"
        ordering = ['nom', 'prenom']

    def __str__(self):
        return f"{self.matricule} — {self.prenom} {self.nom}"

    @property
    def full_name(self):
        return f"{self.prenom} {self.nom}"

    @property
    def documents_actifs(self):
        return self.documents.filter(is_active=True)

    @property
    def dossier_complet(self):
        docs_requis = {'CNI', 'CONTRAT', 'FICHE_IEP'}
        docs_presents = set(
            self.documents.filter(is_active=True).values_list('type_document', flat=True)
        )
        return docs_requis.issubset(docs_presents)

    @property
    def taux_completude(self):
        total_types = len(EmployeeDocument.TypeDocument.values)
        docs_presents = self.documents.filter(is_active=True).values_list(
            'type_document', flat=True
        ).distinct()
        return round(len(set(docs_presents)) / total_types * 100)


# ─── DOCUMENT ─────────────────────────────────────────────────────────────────

def document_upload_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    safe_name = f"{instance.type_document}_{uuid.uuid4().hex[:8]}.{ext}"
    return os.path.join('employees', str(instance.employee.id), instance.type_document, safe_name)


class EmployeeDocument(models.Model):

    class TypeDocument(models.TextChoices):
        CNI = 'CNI', "Carte Nationale d'Identité"
        CONTRAT = 'CONTRAT', "Contrat de Travail"
        RESIDENCE = 'RESIDENCE', "Justificatif de Résidence"
        FICHE_IEP = 'FICHE_IEP', "Fiche IEP"
        DOSSIER_MED = 'DOSSIER_MED', "Dossier Médical"
        DIPLOME = 'DIPLOME', "Diplôme(s)"
        PHOTO = 'PHOTO', "Photo d'identité"
        AUTRE = 'AUTRE', "Document divers"

    REQUIRED_TYPES = {'CNI', 'CONTRAT', 'FICHE_IEP'}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='documents'
    )
    type_document = models.CharField(max_length=30, choices=TypeDocument.choices)
    file = models.FileField(
        upload_to=document_upload_path,
        validators=[FileExtensionValidator(allowed_extensions=['pdf', 'jpg', 'jpeg', 'png', 'tiff'])]
    )
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=50, blank=True)
    version = models.PositiveSmallIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='documents_uploaded'
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'employee_documents'
        verbose_name = "Document employé"
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.employee.matricule} — {self.get_type_document_display()} v{self.version}"

    @property
    def file_size_kb(self):
        if self.file_size:
            return round(self.file_size / 1024, 1)
        return None

    def save(self, *args, **kwargs):
        if not self.pk:
            existing = EmployeeDocument.objects.filter(
                employee=self.employee,
                type_document=self.type_document,
                is_active=True
            ).order_by('-version').first()
            if existing:
                self.version = existing.version + 1
                EmployeeDocument.objects.filter(
                    employee=self.employee,
                    type_document=self.type_document,
                    is_active=True
                ).update(is_active=False)
        super().save(*args, **kwargs)
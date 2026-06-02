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

class TypeDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=30, unique=True, verbose_name="Code")
    obligatoire = models.BooleanField(default=False, verbose_name="Obligatoire")
    is_active = models.BooleanField(default=True, verbose_name="Actif")
    ordre = models.PositiveSmallIntegerField(default=0, verbose_name="Ordre d'affichage")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'types_documents'
        verbose_name = "Type de document"
        ordering = ['ordre', 'nom']

    def __str__(self):
        return f"{self.nom} {'*' if self.obligatoire else ''}"

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
        types_obligatoires = TypeDocument.objects.filter(
            obligatoire=True, is_active=True
        ).values_list('id', flat=True)
        docs_presents = set(
        self.documents.filter(is_active=True).values_list('type_doc_id', flat=True)
    )
        return all(t in docs_presents for t in types_obligatoires)

    @property
    def taux_completude(self):
        total = TypeDocument.objects.filter(is_active=True).count()
        if total == 0:
            return 0
        presents = self.documents.filter(is_active=True).values_list(
            'type_doc_id', flat=True
        ).distinct().count()
        return round(presents / total * 100)


# ─── DOCUMENT ─────────────────────────────────────────────────────────────────

def document_upload_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    safe_name = f"{instance.document.type_doc.code}_{uuid.uuid4().hex[:8]}.{ext}"
    return os.path.join(
        'employees',
        str(instance.document.employee.id),
        instance.document.type_doc.code,
        safe_name
    )


class EmployeeDocument(models.Model):
    """
    Conteneur — représente un type de document pour un employé.
    Contient plusieurs fichiers (EmployeeDocumentFile).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='documents'
    )
    type_doc = models.ForeignKey(
        TypeDocument, on_delete=models.PROTECT,
        related_name='documents', verbose_name="Type de document"
    )
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
        return f"{self.employee.matricule} — {self.type_doc.nom} v{self.version}"

    @property
    def type_document(self):
        """Compatibilité avec l'ancien code."""
        return self.type_doc.code if self.type_doc else None

    @property
    def type_document_label(self):
        return self.type_doc.nom if self.type_doc else None

    @property
    def nb_fichiers(self):
        return self.fichiers.filter(is_active=True).count()

    @property
    def file_size_kb(self):
        """Taille totale de tous les fichiers."""
        total = sum(
            f.file_size or 0
            for f in self.fichiers.filter(is_active=True)
        )
        return round(total / 1024, 1) if total else None

    def save(self, *args, **kwargs):
        if not self.pk:
            existing = EmployeeDocument.objects.filter(
                employee=self.employee,
                type_doc=self.type_doc,
                is_active=True
            ).order_by('-version').first()
            if existing:
                self.version = existing.version + 1
                EmployeeDocument.objects.filter(
                    employee=self.employee,
                    type_doc=self.type_doc,
                    is_active=True
                ).update(is_active=False)
        super().save(*args, **kwargs)

class EmployeeDocumentFile(models.Model):
    """
    Fichier physique appartenant à un EmployeeDocument.
    Un document peut avoir plusieurs fichiers (recto/verso, pages multiples).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        EmployeeDocument, on_delete=models.CASCADE,
        related_name='fichiers', verbose_name="Document"
    )
    file = models.FileField(
        upload_to=document_upload_path,
        validators=[FileExtensionValidator(
            allowed_extensions=['pdf', 'jpg', 'jpeg', 'png', 'tiff']
        )]
    )
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=50, blank=True)
    ordre = models.PositiveSmallIntegerField(default=1, verbose_name="Ordre")
    is_active = models.BooleanField(default=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'employee_document_files'
        verbose_name = "Fichier document"
        ordering = ['ordre', 'uploaded_at']

    def __str__(self):
        return f"{self.document} — fichier {self.ordre}"

    @property
    def file_size_kb(self):
        return round(self.file_size / 1024, 1) if self.file_size else None
"""
employees/models.py
Modèles principaux : Référentiels + Employé + Documents
"""

import re
import uuid
import os
from django.db import models, transaction
from django.conf import settings
from django.core.validators import FileExtensionValidator


def _safe_path_segment(value):
    """
    Neutralise un composant de chemin de fichier dérivé d'une donnée saisie
    en base (numero_contrat, code type_doc) : ne garde que lettres/chiffres/
    tiret/underscore, pour empêcher tout path traversal (ex. "../../etc")
    quand ces valeurs sont insérées via os.path.join() dans document_upload_path.
    """
    return re.sub(r'[^A-Za-z0-9_-]', '_', str(value)) or '_'


def employee_photo_upload_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    return os.path.join('employees', str(instance.id), 'photo', f'{uuid.uuid4().hex}.{ext}')


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


class Pole(models.Model):
    """
    Regroupement optionnel de Départements sous une Direction — reflète les
    organigrammes réels où une Direction peut contenir directement des
    Départements OU les regrouper par Pôle (ex. "Pôle Machines Tournantes"
    contenant plusieurs Départements). Toujours rattaché à UNE Direction —
    contrairement à Departement/Service, un Pôle ne contient jamais
    d'employés directement (voir Departement.pole).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    direction = models.ForeignKey(
        Direction, on_delete=models.CASCADE,
        related_name='poles', verbose_name="Direction"
    )
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'poles'
        verbose_name = "Pôle"
        ordering = ['direction__nom', 'nom']
        unique_together = [['direction', 'nom']]

    def __str__(self):
        return f"{self.direction.nom} → {self.nom}"


class Departement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    direction = models.ForeignKey(
        Direction, on_delete=models.CASCADE,
        related_name='departements', verbose_name="Direction"
    )
    # Regroupement d'affichage optionnel — si renseigné, doit appartenir à
    # la même Direction (validé côté serializer). `direction` reste la
    # source de vérité pour le scoping/les filtres, inchangé par l'ajout
    # du Pôle : un Département "sous Pôle" est toujours aussi retrouvable
    # via sa Direction directe, exactement comme avant.
    pole = models.ForeignKey(
        Pole, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='departements', verbose_name="Pôle"
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


class Cellule(models.Model):
    """
    Unité terminale (contient des employés, comme un Service) rattachée
    directement à une Direction OU à un Département — jamais à un Service.
    Exactement un des deux champs `direction`/`departement` doit être
    renseigné (validé côté serializer et en base via `clean()`).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    direction = models.ForeignKey(
        Direction, null=True, blank=True, on_delete=models.CASCADE,
        related_name='cellules', verbose_name="Direction"
    )
    departement = models.ForeignKey(
        Departement, null=True, blank=True, on_delete=models.CASCADE,
        related_name='cellules', verbose_name="Département"
    )
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=20, blank=True, verbose_name="Code")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cellules'
        verbose_name = "Cellule"
        ordering = ['nom']

    def __str__(self):
        parent = self.direction.nom if self.direction_id else self.departement.nom
        return f"{parent} → {self.nom}"

    def clean(self):
        from django.core.exceptions import ValidationError
        if bool(self.direction_id) == bool(self.departement_id):
            raise ValidationError(
                "Une Cellule doit être rattachée à exactement une Direction OU un Département."
            )


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
    """
    Peut être soit une CATÉGORIE (parent=None, sert juste à regrouper
    visuellement des sous-types — ex. "État civil"), soit un type FEUILLE
    (utilisable pour un upload réel — ex. "Acte de naissance", enfant de
    "État civil", ou "Diplôme(s)" qui reste racine sans enfants). Seuls
    deux niveaux sont autorisés : une catégorie ne peut pas avoir de parent.
    Seuls les types feuilles comptent dans les statistiques de complétude
    et peuvent être rattachés à un EmployeeDocument (voir `is_categorie`).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=150, verbose_name="Nom")
    code = models.CharField(max_length=30, unique=True, verbose_name="Code")
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='sous_types', verbose_name="Catégorie parente"
    )
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

    @property
    def is_categorie(self):
        """True si ce type sert uniquement à regrouper des sous-types
        (jamais rattaché directement à un document)."""
        return self.sous_types.exists()

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
    date_embauche = models.DateField(null=True, blank=True, verbose_name="Date de recrutement")
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.ACTIF)

    photo = models.ImageField(upload_to=employee_photo_upload_path, null=True, blank=True, verbose_name="Photo")

    rib = models.CharField(max_length=50, blank=True, verbose_name="RIP/RIB")
    numero_secu_sociale = models.CharField(max_length=30, blank=True, verbose_name="N° Sécurité Sociale")
    groupe_sanguin = models.CharField(max_length=5, blank=True, verbose_name="Groupe sanguin")
    nin = models.CharField(max_length=30, blank=True, verbose_name="NIN")

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
    cellule = models.ForeignKey(
        Cellule, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees'
    )
    poste = models.ForeignKey(
        Poste, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='employees',
        verbose_name="Fonction"
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
            obligatoire=True, is_active=True, sous_types__isnull=True
        ).values_list('id', flat=True)
        docs_presents = set(
        self.documents.filter(is_active=True).values_list('type_doc_id', flat=True)
    )
        return all(t in docs_presents for t in types_obligatoires)

    @property
    def taux_completude(self):
        total = TypeDocument.objects.filter(is_active=True, sous_types__isnull=True).count()
        if total == 0:
            return 0
        presents = self.documents.filter(is_active=True).values_list(
            'type_doc_id', flat=True
        ).distinct().count()
        return round(presents / total * 100)


# ─── CHAMPS PERSONNALISÉS ──────────────────────────────────────────────────────

class ChampPersonnalise(models.Model):
    """
    Champ additionnel définissable par un ADMIN (ex. "Permis de conduire"),
    affiché sur la fiche employé sans nécessiter de migration de schéma —
    même logique de gestion que TypeDocument (CRUD dans /parametres).
    """
    class TypeChamp(models.TextChoices):
        TEXTE = 'texte', 'Texte'
        NOMBRE = 'nombre', 'Nombre'
        DATE = 'date', 'Date'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField(max_length=100, verbose_name="Nom")
    code = models.CharField(max_length=50, unique=True, verbose_name="Code")
    type_champ = models.CharField(
        max_length=10, choices=TypeChamp.choices, default=TypeChamp.TEXTE,
        verbose_name="Type"
    )
    ordre = models.PositiveSmallIntegerField(default=0, verbose_name="Ordre d'affichage")
    is_active = models.BooleanField(default=True, verbose_name="Actif")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'champs_personnalises'
        verbose_name = "Champ personnalisé"
        ordering = ['ordre', 'nom']

    def __str__(self):
        return self.nom


class EmployeeChampValeur(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='valeurs_personnalisees'
    )
    champ = models.ForeignKey(
        ChampPersonnalise, on_delete=models.CASCADE, related_name='valeurs'
    )
    valeur = models.CharField(max_length=500, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'employee_champs_valeurs'
        verbose_name = "Valeur de champ personnalisé"
        unique_together = ('employee', 'champ')

    def __str__(self):
        return f"{self.employee.matricule} — {self.champ.nom} = {self.valeur}"


class SystemFieldLabel(models.Model):
    """
    Libellé personnalisé pour un champ système (Matricule, Fonction, ...) —
    purement cosmétique. `code` correspond à l'un des SYSTEM_FIELDS du
    frontend (Parametres.jsx) ; ne touche jamais au champ réel sur Employee
    (structure, scoping, recherche, CSV import restent inchangés).
    """
    code = models.CharField(max_length=50, primary_key=True)
    label = models.CharField(max_length=100)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'system_field_labels'
        verbose_name = "Libellé de champ système"

    def __str__(self):
        return f"{self.code} → {self.label}"


# ─── CONTRAT ──────────────────────────────────────────────────────────────────

class Contrat(models.Model):

    class Statut(models.TextChoices):
        ACTIF = 'actif', 'Actif'
        ARCHIVE = 'archive', 'Archivé'
        DEMOBILISE = 'demobilise', 'Démobilisé'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    numero_contrat = models.CharField(
        max_length=50, unique=True, db_index=True, verbose_name="N° Contrat"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='contrats'
    )
    type_contrat = models.ForeignKey(
        TypeContrat, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='contrats'
    )
    date_debut = models.DateField(null=True, blank=True, verbose_name="Date début")
    date_fin = models.DateField(null=True, blank=True, verbose_name="Date fin")
    statut = models.CharField(
        max_length=20, choices=Statut.choices, default=Statut.ACTIF
    )
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL, related_name='contrats_created'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'contrats'
        verbose_name = "Contrat"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.numero_contrat} — {self.employee.matricule}"

    @property
    def documents_actifs(self):
        return self.documents.filter(is_active=True)

    @property
    def nb_documents(self):
        return self.documents.filter(is_active=True).count()


# ─── DOCUMENT ─────────────────────────────────────────────────────────────────

def document_upload_path(instance, filename):
    ext = filename.split('.')[-1].lower()
    type_doc_code = _safe_path_segment(instance.document.type_doc.code)
    safe_name = f"{type_doc_code}_{uuid.uuid4().hex[:8]}.{ext}"
    if instance.document.contrat_id:
        return os.path.join(
            'employees',
            str(instance.document.employee.id),
            'contrats',
            _safe_path_segment(instance.document.contrat.numero_contrat),
            type_doc_code,
            safe_name
        )
    return os.path.join(
        'employees',
        str(instance.document.employee.id),
        type_doc_code,
        safe_name
    )


class EmployeeDocument(models.Model):
    """
    Conteneur — représente un type de document pour un employé (ou un contrat).
    Contient plusieurs fichiers (EmployeeDocumentFile).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name='documents'
    )
    contrat = models.ForeignKey(
        Contrat, null=True, blank=True,
        on_delete=models.CASCADE, related_name='documents'
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
        # Ordre stable basé sur l'ordre d'affichage configuré du type de
        # document (Paramètres > Types de documents), pas sur la date
        # d'upload — un ré-upload (nouvelle version) ne doit pas faire
        # "sauter" le document en haut de la liste.
        ordering = ['type_doc__ordre', 'type_doc__nom']

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
            # transaction.atomic + select_for_update : sans ça, deux uploads
            # concurrents du même type de document pour le même employé
            # peuvent tous les deux lire "aucun actif" et créer deux documents
            # actifs en parallèle (race condition sur l'invariant "un seul
            # document actif par type").
            with transaction.atomic():
                existing = EmployeeDocument.objects.select_for_update().filter(
                    employee=self.employee,
                    contrat=self.contrat,
                    type_doc=self.type_doc,
                    is_active=True
                ).order_by('-version').first()
                if existing:
                    self.version = existing.version + 1
                    EmployeeDocument.objects.filter(
                        employee=self.employee,
                        contrat=self.contrat,
                        type_doc=self.type_doc,
                        is_active=True
                    ).update(is_active=False)
                super().save(*args, **kwargs)
        else:
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
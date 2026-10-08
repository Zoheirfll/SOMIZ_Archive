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

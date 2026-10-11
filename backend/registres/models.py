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

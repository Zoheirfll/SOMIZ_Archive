import uuid
from django.conf import settings
from django.db import models


def attestation_scan_upload_path(instance, filename):
    return f"attestations/{instance.employee_id}/{uuid.uuid4()}_{filename}"


def attestation_logo_upload_path(instance, filename):
    return f"attestation_logo/{uuid.uuid4()}_{filename}"


class ReferenceCounter(models.Model):
    """Compteur annuel pour générer les références NNNNN/AA des demandes
    d'attestation — une ligne par année civile, incrémentée sous verrou."""
    annee = models.PositiveSmallIntegerField(unique=True)
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'attestation_reference_counters'


class DemandeAttestation(models.Model):
    class Statut(models.TextChoices):
        RECUE = 'recue', 'Reçue'
        IMPRIMEE = 'imprimee', 'Imprimée'
        SIGNEE = 'signee', 'Signée'
        PRETE = 'prete', 'Prête'
        RECUPEREE = 'recuperee', 'Récupérée'
        REJETEE = 'rejetee', 'Rejetée'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=20, unique=True, editable=False)
    employee = models.ForeignKey(
        'employees.Employee', on_delete=models.PROTECT,
        related_name='demandes_attestation',
    )
    contrat = models.ForeignKey(
        'employees.Contrat', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation',
    )
    motif = models.CharField(max_length=255)
    commentaire = models.TextField(blank=True)
    statut = models.CharField(max_length=20, choices=Statut.choices, default=Statut.RECUE)
    motif_rejet = models.TextField(blank=True)
    scan_document = models.FileField(
        upload_to=attestation_scan_upload_path, null=True, blank=True,
    )

    demandeur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        related_name='demandes_attestation_faites',
    )
    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='demandes_attestation_traitees',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'demandes_attestation'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reference} — {self.employee} ({self.statut})"


class AttestationTemplateConfig(models.Model):
    """Singleton applicatif — un seul enregistrement pour toute la société,
    voir AttestationTemplateConfigView.get_object()."""
    societe_nom = models.CharField(max_length=100, default="SOMIZ")
    societe_soustitre = models.CharField(max_length=255, blank=True)
    societe_capital = models.CharField(max_length=255, blank=True)
    holding = models.CharField(max_length=255, blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    ville = models.CharField(max_length=100, blank=True)
    telephone = models.CharField(max_length=50, blank=True)
    fax = models.CharField(max_length=50, blank=True)
    telex = models.CharField(max_length=50, blank=True)
    signataire_titre = models.CharField(max_length=150, blank=True)
    signataire_nom = models.CharField(max_length=150, blank=True)
    texte_intro = models.TextField(blank=True)
    logo = models.ImageField(upload_to=attestation_logo_upload_path, null=True, blank=True)

    class Meta:
        db_table = 'attestation_template_config'

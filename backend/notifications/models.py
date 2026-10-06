import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Notification in-app destinée à UN compte (diffusion par rôle = une
    ligne par destinataire, avec son propre état lu/non-lu).

    `message` est volontairement neutre (aucun nom d'employé) : le détail
    se consulte sur la page cible, qui applique le scoping. Une notification
    n'octroie jamais d'accès — `link` n'est qu'une navigation."""

    class Type(models.TextChoices):
        ATTESTATION_NOUVELLE = 'ATTESTATION_NOUVELLE', "Nouvelle demande d'attestation"
        ATTESTATION_PRETE = 'ATTESTATION_PRETE', "Attestation prête"
        ATTESTATION_REJETEE = 'ATTESTATION_REJETEE', "Attestation rejetée"
        COMPTE_VERROUILLE = 'COMPTE_VERROUILLE', "Compte verrouillé"
        EMPLOYE_TRANSFERE = 'EMPLOYE_TRANSFERE', "Employé transféré"
        EMPLOYE_ARCHIVE = 'EMPLOYE_ARCHIVE', "Employé archivé"
        IMPORT_TERMINE = 'IMPORT_TERMINE', "Import terminé"
        CONTRAT_ECHEANCE = 'CONTRAT_ECHEANCE', "Contrat proche de l'échéance"
        CONSENTEMENT_EN_ATTENTE = 'CONSENTEMENT_EN_ATTENTE', "Consentement en attente"
        GENERIQUE = 'GENERIQUE', "Générique"

    class Severity(models.TextChoices):
        INFO = 'info', 'Information'
        WARNING = 'warning', 'Avertissement'
        CRITICAL = 'critical', 'Critique'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications',
    )
    type = models.CharField(max_length=40, choices=Type.choices, default=Type.GENERIQUE)
    message = models.CharField(max_length=255)
    link = models.CharField(max_length=255, blank=True)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.INFO)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'read_at', '-created_at']),
        ]

    def __str__(self):
        return f"{self.type} → {self.recipient_id}"

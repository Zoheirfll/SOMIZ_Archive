# backend/reporting/models.py
import uuid

from django.conf import settings
from django.db import models


class EffectifInstantane(models.Model):
    """Photo mensuelle des effectifs : un NOMBRE d'agents par combinaison
    unité × sexe × catégorie × type de contrat × tranches. Jamais de donnée
    nominative. Libellés figés à la date de la photo (une réorganisation ne
    réécrit pas le passé) ; `reconstitue` = calculé après coup (amorçage),
    moins fiable car basé sur l'affectation actuelle des agents."""
    date_photo = models.DateField(db_index=True)
    reconstitue = models.BooleanField(default=False)
    direction_id = models.UUIDField(null=True, blank=True)
    direction_nom = models.CharField(max_length=150, blank=True)
    departement_id = models.UUIDField(null=True, blank=True)
    departement_nom = models.CharField(max_length=150, blank=True)
    service_nom = models.CharField(max_length=150, blank=True)
    sexe = models.CharField(max_length=1, blank=True)
    categorie_nom = models.CharField(max_length=100, blank=True)
    type_contrat_nom = models.CharField(max_length=100, blank=True)
    tranche_age = models.CharField(max_length=20, blank=True)
    tranche_anciennete = models.CharField(max_length=20, blank=True)
    nb = models.PositiveIntegerField()
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date_photo']
        verbose_name = "Instantané d'effectif"


class ObjectifIndicateur(models.Model):
    """Cible fixée par la DRH pour un indicateur du reporting (code de
    reporting/rh/definitions.py). L'API ajoute cible et écart à chaque KPI
    portant ce code. Traçabilité : auteur et date de la dernière modification
    (pas d'action d'audit dédiée, voir docs/fonctionnel/statistiques-audit.md)."""
    class Sens(models.TextChoices):
        AU_MOINS = 'au_moins', 'Au moins'
        AU_PLUS = 'au_plus', 'Au plus'

    code = models.CharField(max_length=50, unique=True)
    cible = models.FloatField()
    sens = models.CharField(max_length=10, choices=Sens.choices, default=Sens.AU_MOINS)
    modifie_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name='+')
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        verbose_name = "Objectif d'indicateur"


def _chemin_rapport(instance, filename):
    # Nom imprévisible : le fichier n'est servi que par l'API (jamais par URL directe).
    return f'rapports/{uuid.uuid4().hex}.pdf'


class RapportMensuel(models.Model):
    """PDF de synthèse DRH généré le 1er du mois (commande rapport_mensuel)
    pour le mois écoulé. Contenu agrégé uniquement (indicateurs, alertes,
    faits marquants). Téléchargement par l'API, tracé dans l'audit."""
    mois = models.DateField(unique=True, help_text="1er jour du mois couvert")
    fichier = models.FileField(upload_to=_chemin_rapport)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-mois']
        verbose_name = 'Rapport mensuel'

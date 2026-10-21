"""Bascule du 1er juillet : aucun jour ne se déplace (les soldes sont suivis
par exercice, leur groupe reliquat/actuel/anticipé se déduit de la date). La
commande ouvre seulement, pour chaque employé, les lignes manquantes de
l'exercice en cours et de l'anticipé, au droit annuel.

Idempotente. À planifier chaque 1er juillet ; à défaut, l'ouverture se fait
d'elle-même à la première opération sur un solde (verrouiller_soldes)."""
from django.core.management.base import BaseCommand
from django.db import transaction

from audit.models import AuditLog
from conges.models import SoldeConge
from conges.services import exercice_courant, exercice_suivant, verrouiller_soldes


class Command(BaseCommand):
    help = "Ouvre l'exercice en cours et l'anticipé manquants pour chaque solde de congé."

    def handle(self, *args, **opts):
        courant = exercice_courant()
        ouvertures = 0
        employes = 0
        for entete in SoldeConge.objects.select_related('employee'):
            with transaction.atomic():
                avant = entete.employee.soldes_exercice.count()
                soldes = verrouiller_soldes(entete.employee)  # ouvre sous verrou
                nouvelles = len(soldes.lignes) - avant
            if nouvelles:
                ouvertures += nouvelles
                employes += 1
        if ouvertures:
            AuditLog.objects.create(
                user=None, username_snapshot='system:basculer_exercice',
                action=AuditLog.Action.BASCULE_CONGE, target_model='SoldeExercice', target_id='',
                target_label=f"Exercice {courant}",
                details={'exercice': courant, 'anticipe': exercice_suivant(courant),
                         'employes': employes, 'lignes_ouvertes': ouvertures},
            )
        self.stdout.write(self.style.SUCCESS(
            f"{ouvertures} exercice(s) ouvert(s) pour {employes} employé(s) (exercice en cours : {courant})."
        ))

"""Contrôle d'intégrité : pour chaque employé, chaque compteur et chaque ligne
d'exercice (droit, consommé) doit égaler la somme de ses mouvements. Échoue
(code ≠ 0) au moindre écart."""
from django.core.management.base import BaseCommand, CommandError

from conges.models import SoldeConge
from conges.services import ecarts_solde


class Command(BaseCommand):
    help = "Vérifie que chaque solde de congé égale la somme de ses mouvements."

    def handle(self, *args, **opts):
        anomalies = []
        for solde in SoldeConge.objects.select_related('employee'):
            ecarts = ecarts_solde(solde)
            if ecarts:
                detail = ', '.join(f"{c}: base={b} / mouvements={m}" for c, (b, m) in ecarts.items())
                anomalies.append(f"{solde.employee.matricule} — {detail}")
        if anomalies:
            raise CommandError("Écarts détectés :\n  " + "\n  ".join(anomalies))
        self.stdout.write(self.style.SUCCESS("Aucun écart : tous les soldes égalent la somme de leurs mouvements."))

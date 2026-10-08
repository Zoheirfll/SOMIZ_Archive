from django.core.management.base import BaseCommand

from consultations.alerts import notifier_echeances_consultation


class Command(BaseCommand):
    help = ("Rappelle au demandeur et au traiteur les consultations qui expirent "
            "dans moins de 24 h / 1 h. Idempotent ; à planifier toutes les "
            "15 minutes en production (cron de l'hôte, comme les autres "
            "commandes de notifications).")

    def handle(self, *args, **options):
        n = notifier_echeances_consultation()
        self.stdout.write(f"{n} rappel(s) d'échéance envoyé(s).")

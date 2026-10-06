from django.core.management.base import BaseCommand

from notifications.alerts import notifier_consentements_en_attente, notifier_echeances_contrat


class Command(BaseCommand):
    help = ("Notifie les ADMIN/SUPERADMIN des contrats actifs arrivant à échéance "
            "(30 jours par défaut) et les comptes sans consentement Loi 18-07 depuis "
            "7 jours. Idempotent, à planifier une fois par jour.")

    def add_arguments(self, parser):
        parser.add_argument('--jours', type=int, default=30)

    def handle(self, *args, **opts):
        n = notifier_echeances_contrat(opts['jours'])
        self.stdout.write(f"{n} contrat(s) notifié(s).")
        c = notifier_consentements_en_attente()
        self.stdout.write(f"{c} compte(s) sans consentement signalé(s).")

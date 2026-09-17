"""
employees/management/commands/sync_employees_to_sps.py
Backfill manuel, à la demande, de la synchronisation sortante vers
plateforme-sps (voir employees/webhook_client.py et employees/signals.py) —
les signaux Django ne notifient que les créations/modifications/archivages
FUTURS, ils ne se déclenchent pas rétroactivement pour les ~4000 employés
déjà en base au moment de la mise en place de l'intégration. Cette commande
rejoue l'envoi pour tous les employés existants (y compris archivés, aucun
filtre par statut).

Usage :
    python manage.py sync_employees_to_sps            # envoie pour tous les employés
    python manage.py sync_employees_to_sps --dry-run  # affiche juste le nombre concerné

Portée volontairement limitée : `envoyer_webhook_employe` ne renvoie aucun
signal de succès/échec (elle logue en warning et absorbe toute exception,
voir son docstring) — cette commande ne modifie pas webhook_client.py pour
en ajouter un (fonction déjà testée/utilisée par les signaux). Elle ne peut
donc rapporter qu'un nombre d'employés traités, pas un nombre de webhooks
effectivement livrés avec succès ; les échecs de livraison individuels ne
sont visibles que dans les logs Django (logger.warning côté webhook_client).
"""

from django.conf import settings
from django.core.management.base import BaseCommand

from employees.models import Employee
from employees.webhook_client import envoyer_webhook_employe

PROGRES_TOUS_LES = 100


class Command(BaseCommand):
    help = (
        "Rejoue l'envoi du webhook plateforme-sps ('employee.updated') pour tous les "
        "employés existants (backfill manuel, une seule fois — voir --dry-run)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'envoie rien, affiche seulement le nombre d'employés concernés.",
        )

    def handle(self, *args, **options):
        if not settings.PLATEFORME_SPS_WEBHOOK_URL or not settings.PLATEFORME_SPS_WEBHOOK_SECRET:
            self.stderr.write(self.style.ERROR(
                "PLATEFORME_SPS_WEBHOOK_URL / PLATEFORME_SPS_WEBHOOK_SECRET non configurés — "
                "aucun employé ne sera traité."
            ))
            raise SystemExit(1)

        # Volontairement pas de filtre par statut : les employés archivés doivent
        # aussi exister côté plateforme-sps.
        queryset = Employee.objects.all()
        count = queryset.count()

        if options['dry_run']:
            self.stdout.write(f"{count} employé(s) concerné(s) (dry-run, rien d'envoyé).")
            return

        traites = 0
        echecs_inattendus = 0
        for employee in queryset.iterator():
            try:
                envoyer_webhook_employe(employee, 'employee.updated')
            except Exception as exc:
                # envoyer_webhook_employe n'est pas censée lever (elle capture déjà ses
                # propres erreurs réseau) — mais une erreur de données propre à CET
                # employé (ex. FK cassée dans la hiérarchie) ne doit pas interrompre le
                # traitement des 3999 autres.
                echecs_inattendus += 1
                self.stderr.write(self.style.WARNING(
                    f"Employé matricule={employee.matricule} : exception inattendue — {exc}"
                ))
            traites += 1
            if traites % PROGRES_TOUS_LES == 0:
                self.stdout.write(f"{traites}/{count} employé(s) traité(s)...")

        self.stdout.write(self.style.SUCCESS(
            f"{traites} employé(s) traité(s) sur {count}"
            + (f" ({echecs_inattendus} exception(s) inattendue(s), voir ci-dessus)" if echecs_inattendus else "")
            + ". Rappel : la livraison effective de chaque webhook n'est pas trackée ici "
            "(pas de retour succès/échec côté webhook_client.envoyer_webhook_employe) — "
            "les échecs d'envoi individuels sont seulement visibles dans les logs Django "
            "(logger.warning de employees.webhook_client)."
        ))

# backend/reporting/management/commands/photo_effectifs.py
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from reporting.instantanes import calculer_instantane, premier_du_mois
from reporting.models import EffectifInstantane


def _mois_precedent(d):
    return date(d.year - 1, 12, 1) if d.month == 1 else date(d.year, d.month - 1, 1)


class Command(BaseCommand):
    help = ("Photographie les effectifs au 1er du mois (agrégats, sans donnée nominative). "
            "Idempotent. À planifier le 1er de chaque mois en production. "
            "--amorcer N reconstitue les N mois précédents (marqués « reconstitués »), "
            "sans jamais écraser une vraie photo.")

    def add_arguments(self, parser):
        parser.add_argument('--date', help="AAAA-MM-JJ (ramenée au 1er du mois). Défaut : mois courant.")
        parser.add_argument('--amorcer', type=int, default=0, help="Nombre de mois passés à reconstituer.")

    def handle(self, *args, **opts):
        try:
            ref = date.fromisoformat(opts['date']) if opts['date'] else timezone.localdate()
        except ValueError as exc:
            raise CommandError("--date attend le format AAAA-MM-JJ.") from exc
        cible = premier_du_mois(ref)

        if opts['amorcer']:
            mois = cible
            for _ in range(opts['amorcer']):
                mois = _mois_precedent(mois)
                if EffectifInstantane.objects.filter(date_photo=mois, reconstitue=False).exists():
                    self.stdout.write(f"{mois} : vraie photo existante, conservée.")
                    continue
                total = calculer_instantane(mois, reconstitue=True)
                self.stdout.write(f"{mois} : {total} agent(s) (reconstitué).")
            return

        total = calculer_instantane(cible)
        self.stdout.write(f"{cible} : {total} agent(s).")

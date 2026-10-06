from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.models import Notification


class Command(BaseCommand):
    help = ("Supprime les notifications LUES depuis plus de N jours (30 par "
            "défaut). Les non lues sont toujours conservées. --dry-run liste "
            "sans supprimer.")

    def add_arguments(self, parser):
        parser.add_argument('--jours', type=int, default=30)
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **opts):
        seuil = timezone.now() - timedelta(days=opts['jours'])
        qs = Notification.objects.filter(read_at__isnull=False, read_at__lt=seuil)
        total = qs.count()
        if opts['dry_run']:
            for n in qs.order_by('read_at')[:50]:
                self.stdout.write(f"{n.id} {n.type} lue le {n.read_at:%Y-%m-%d}")
            self.stdout.write(f"[dry-run] {total} notification(s) seraient supprimée(s).")
            return
        qs.delete()
        self.stdout.write(f"{total} notification(s) supprimée(s).")

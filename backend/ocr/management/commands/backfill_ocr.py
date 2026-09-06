"""
ocr/management/commands/backfill_ocr.py
Analyse OCR rétroactive des documents uploadés AVANT la mise en place du
pipeline OCR (2026-09-06) — sans cette commande, la recherche globale
(GET /api/ocr/search/) ne couvre que les documents uploadés après coup,
voir docs/superpowers/specs/2026-09-06-ocr-documents-design.md.

Usage :
    python manage.py backfill_ocr            # enfile tout ce qui manque
    python manage.py backfill_ocr --dry-run  # affiche juste le nombre concerné
"""

from django.core.management.base import BaseCommand

from employees.models import EmployeeDocumentFile
from ocr.tasks import run_ocr


class Command(BaseCommand):
    help = "Enfile l'analyse OCR pour tous les fichiers actifs qui n'en ont pas encore."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run', action='store_true',
            help="N'enfile rien, affiche seulement le nombre de fichiers concernés.",
        )

    def handle(self, *args, **options):
        queryset = EmployeeDocumentFile.objects.filter(
            is_active=True, ocr_result__isnull=True
        )
        count = queryset.count()

        if options['dry_run']:
            self.stdout.write(f"{count} fichier(s) sans analyse OCR (dry-run, rien d'enfilé).")
            return

        for file_obj in queryset.iterator():
            run_ocr.delay(str(file_obj.id))

        self.stdout.write(self.style.SUCCESS(
            f"{count} fichier(s) enfilé(s) pour analyse OCR — suivre la progression "
            f"via les logs du worker Celery (celery -A config worker -l info)."
        ))

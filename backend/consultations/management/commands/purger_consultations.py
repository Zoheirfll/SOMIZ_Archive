"""Purge MANUELLE des scans livrés. Jamais planifiée automatiquement.

Garde-fous issus de l'incident du 2026-07-22 (docs/fonctionnel/documents.md) :
1. sans --confirmer, la commande liste seulement ;
2. chaque chemin est normalisé (realpath) et doit être sous
   MEDIA_ROOT/consultations/ — sinon refus, fichier intact ;
3. sauvegarde écrite ET vérifiée avant toute suppression ;
4. chaque suppression est tracée dans AuditLog (snapshot texte)."""
import os
import shutil
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from audit.models import AuditLog
from consultations.services import fichiers_purgeables


class Command(BaseCommand):
    help = "Liste (ou, avec --confirmer, supprime après sauvegarde) les scans livrés d'anciennes consultations."

    def add_arguments(self, parser):
        parser.add_argument('--jours', type=int, default=90,
                            help="Ancienneté minimale de la clôture de la consultation (défaut : 90).")
        parser.add_argument('--confirmer', action='store_true',
                            help="Effectue réellement la purge (sinon : liste seulement).")
        parser.add_argument('--sauvegarde-dir', default=None,
                            help="Dossier de sauvegarde (défaut : <BASE_DIR>/backups/consultations_purge_<horodatage>).")

    def handle(self, *args, **opts):
        racine = os.path.realpath(os.path.join(settings.MEDIA_ROOT, 'consultations'))
        retenus, refuses = [], []
        for fichier in fichiers_purgeables(opts['jours']):
            try:
                chemin = os.path.realpath(fichier.file.path)
            except Exception as exc:
                refuses.append((fichier, f"chemin illisible ({exc})"))
                continue
            if not chemin.startswith(racine + os.sep):
                refuses.append((fichier, f"hors de {racine}"))
            elif not os.path.isfile(chemin):
                refuses.append((fichier, "fichier absent du disque"))
            else:
                retenus.append((fichier, chemin))

        self.stdout.write(f"{len(retenus)} fichier(s) à purger (consultations closes depuis plus de {opts['jours']} jours) :")
        for fichier, chemin in retenus:
            self.stdout.write(
                f"  {fichier.demande.reference}  {fichier.file_name}  "
                f"{fichier.file_size} octets  {os.path.relpath(chemin, racine)}"
            )
        for fichier, raison in refuses:
            self.stdout.write(self.style.WARNING(f"  REFUSÉ  {fichier.demande.reference}  {fichier.file_name} : {raison}"))

        if not opts['confirmer']:
            self.stdout.write("Aucune suppression. Relisez la liste puis relancez avec --confirmer.")
            return
        if not retenus:
            self.stdout.write("Rien à purger.")
            return

        dest = opts['sauvegarde_dir'] or os.path.join(
            settings.BASE_DIR, 'backups', f"consultations_purge_{datetime.now():%Y%m%d_%H%M%S}",
        )
        try:
            for fichier, chemin in retenus:
                cible = os.path.join(dest, os.path.relpath(chemin, racine))
                os.makedirs(os.path.dirname(cible), exist_ok=True)
                shutil.copy2(chemin, cible)
                if os.path.getsize(cible) != os.path.getsize(chemin):
                    raise OSError(f"copie incomplète : {cible}")
        except OSError as exc:
            raise CommandError(f"Sauvegarde impossible, AUCUNE suppression effectuée : {exc}")

        maintenant = timezone.now()
        for fichier, chemin in retenus:
            os.remove(chemin)
            fichier.supprime_le = maintenant
            fichier.save(update_fields=['supprime_le'])
            AuditLog.objects.create(
                user=None, username_snapshot='system:purger_consultations',
                action=AuditLog.Action.PURGE_CONSULTATION,
                target_model='ConsultationFichier', target_id=str(fichier.id),
                target_label=f"{fichier.demande.reference} — {fichier.file_name}",
                details={
                    'reference': fichier.demande.reference, 'fichier': fichier.file_name,
                    'taille': fichier.file_size, 'origine': fichier.origine, 'sauvegarde': dest,
                },
            )
        self.stdout.write(self.style.SUCCESS(f"{len(retenus)} fichier(s) purgé(s). Sauvegarde : {dest}"))

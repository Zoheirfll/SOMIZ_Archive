# backend/reporting/management/commands/rapport_mensuel.py
from datetime import date, timedelta

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from django.utils import timezone

from notifications.models import Notification
from accounts.models import User
from notifications.service import notify
from reporting.models import EffectifInstantane, RapportMensuel
from reporting.objectifs import appliquer_objectifs
from reporting.rapport_pdf import generer_pdf
from reporting.rh import synthese
from reporting.rh.commun import Parametres

MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
           'septembre', 'octobre', 'novembre', 'décembre']


MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']


def donnees_instantanes(fin):
    """Effectif sur les 12 photos mensuelles précédant le lendemain de `fin`
    (photo du 1er du mois = état à la fin du mois précédent, donc libellée
    avec ce mois-là) et répartition par direction de la photo la plus
    récente. Agrégats seulement."""
    photos = list(EffectifInstantane.objects.filter(date_photo__lte=fin + timedelta(days=1))
                  .values('date_photo').annotate(total=Sum('nb')).order_by('-date_photo')[:12])
    evolution = []
    for p in reversed(photos):
        mois = p['date_photo'] - timedelta(days=1)
        evolution.append((f"{MOIS_COURTS[mois.month - 1]} {str(mois.year)[2:]}", p['total']))
    par_direction = []
    if photos:
        par_direction = [
            (r['direction_nom'], r['total']) for r in
            EffectifInstantane.objects.filter(date_photo=photos[0]['date_photo'])
            .values('direction_nom').annotate(total=Sum('nb')).order_by('-total', 'direction_nom')
        ]
    return evolution, par_direction


class Command(BaseCommand):
    help = ("Génère le rapport mensuel DRH (PDF) du mois écoulé, ou de --mois AAAA-MM, et notifie les "
            "ADMIN/SUPERADMIN. Idempotent : régénère le rapport du mois s'il existe. À planifier le 1er "
            "de chaque mois en production, après photo_effectifs.")

    def add_arguments(self, parser):
        parser.add_argument('--mois', help='AAAA-MM (défaut : mois précédent)')

    def handle(self, *args, **opts):
        if opts['mois']:
            try:
                debut = date.fromisoformat(f"{opts['mois']}-01")
            except ValueError as exc:
                raise CommandError('--mois attend le format AAAA-MM.') from exc
        else:
            debut = (timezone.localdate().replace(day=1) - timedelta(days=1)).replace(day=1)
        fin = (debut.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        params = Parametres(debut, fin)
        data = synthese.construire(params, user=None)
        appliquer_objectifs(data)
        libelle = f'{MOIS_FR[debut.month - 1]} {debut.year}'
        evolution, par_direction = donnees_instantanes(fin)
        pdf = generer_pdf(f'Rapport mensuel DRH — {libelle}', params.as_dict(), data,
                          evolution=evolution, par_direction=par_direction)

        rapport, _cree = RapportMensuel.objects.get_or_create(mois=debut, defaults={'fichier': ''})
        if rapport.fichier:
            rapport.fichier.delete(save=False)
        rapport.fichier.save(f'{debut.isoformat()}.pdf', ContentFile(pdf), save=True)
        # Seuls les comptes ayant accès aux statistiques RH (SUPERADMIN, ADMIN
        # acces_statistiques) : un ADMIN sans ce droit ne doit pas être notifié.
        destinataires = [u for u in User.objects.filter(is_active=True, role__in=['ADMIN', 'SUPERADMIN', 'CONSULTANT'])
                         if u.can_view_statistiques]
        notify(destinataires, Notification.Type.GENERIQUE,
               f'Le rapport mensuel DRH de {libelle} est disponible.', link='/statistiques/synthese')
        self.stdout.write(f'Rapport de {libelle} généré.')

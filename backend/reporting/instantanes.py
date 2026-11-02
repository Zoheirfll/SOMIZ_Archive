# backend/reporting/instantanes.py
"""Calcul de la photo mensuelle des effectifs (voir models.EffectifInstantane)."""
from collections import Counter

from django.db import transaction
from django.db.models import Q

from audit.stats import AGE_TRANCHES, ANCIENNETE_TRANCHES
from employees.models import Employee
from reporting.models import EffectifInstantane


def premier_du_mois(d):
    return d.replace(day=1)


def _annees_revolues(depuis, jusqua):
    return jusqua.year - depuis.year - ((jusqua.month, jusqua.day) < (depuis.month, depuis.day))


def _tranche(depuis, ref, tranches):
    if not depuis:
        return ''
    annees = _annees_revolues(depuis, ref)
    for mini, maxi, libelle in tranches:
        if mini <= annees <= maxi:
            return libelle
    return ''


def _presents(date_photo, reconstitue):
    """Agents présents à `date_photo` : recrutés au plus tard ce jour-là et
    non encore sortis. Un agent sorti sans date de sortie est exclu (on ne
    sait pas s'il était là) ; un actif sans date de recrutement n'est compté
    que pour une photo du jour (jamais pour une reconstitution du passé)."""
    present = Q(statut=Employee.Statut.ACTIF) | Q(date_sortie__gt=date_photo)
    recrute = Q(date_embauche__lte=date_photo)
    if not reconstitue:
        recrute |= Q(date_embauche__isnull=True, statut=Employee.Statut.ACTIF)
    return Employee.objects.filter(present & recrute)


def calculer_instantane(date_photo, reconstitue=False):
    """Remplace les lignes de `date_photo` par l'agrégat courant. Idempotent.
    Renvoie l'effectif total photographié."""
    lignes = _presents(date_photo, reconstitue).values_list(
        'direction_id', 'direction__nom', 'departement_id', 'departement__nom', 'service__nom',
        'sexe', 'categorie__nom', 'type_contrat__nom', 'date_naissance', 'date_embauche',
    )
    compte = Counter()
    for dir_id, dir_nom, dep_id, dep_nom, svc_nom, sexe, cat, tc, naissance, embauche in lignes:
        compte[(
            dir_id, dir_nom or '', dep_id, dep_nom or '', svc_nom or '', sexe or '', cat or '', tc or '',
            _tranche(naissance, date_photo, AGE_TRANCHES),
            _tranche(embauche, date_photo, ANCIENNETE_TRANCHES),
        )] += 1
    with transaction.atomic():
        EffectifInstantane.objects.filter(date_photo=date_photo).delete()
        EffectifInstantane.objects.bulk_create([
            EffectifInstantane(
                date_photo=date_photo, reconstitue=reconstitue,
                direction_id=k[0], direction_nom=k[1], departement_id=k[2], departement_nom=k[3],
                service_nom=k[4], sexe=k[5], categorie_nom=k[6], type_contrat_nom=k[7],
                tranche_age=k[8], tranche_anciennete=k[9], nb=nb,
            )
            for k, nb in compte.items()
        ])
    return sum(compte.values())

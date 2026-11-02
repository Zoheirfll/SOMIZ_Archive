# backend/reporting/rh/mouvements.py
"""Mouvements, turnover et rétention — sur la vraie date de sortie
(Employee.date_sortie), pas sur la date du clic d'archivage."""
from collections import defaultdict
from datetime import timedelta
from statistics import mean

from django.db.models import Count
from django.db.models.functions import TruncMonth
from django.utils import timezone

from employees.models import Employee
from reporting.instantanes import _presents
from reporting.rh.commun import (
    CLE_SEXE, STATUTS_SORTIE, ajouter_annees, annees_revolues, kpi, table, table_kpis, taux,
)

ANNEES_COHORTES = 6
JALONS_RETENTION = (1, 3, 5)


def effectif_a(jour):
    """Effectif présent à une date (même règle que la photo mensuelle)."""
    return _presents(jour, reconstitue=jour < timezone.localdate()).count()


def _flux(debut, fin):
    entrees = Employee.objects.filter(date_embauche__range=[debut, fin])
    sorties = Employee.objects.filter(statut__in=STATUTS_SORTIE, date_sortie__range=[debut, fin])
    effectif_moyen = (effectif_a(debut) + effectif_a(fin)) / 2
    nb_e, nb_s = entrees.count(), sorties.count()
    return {
        'entrees': nb_e, 'sorties': nb_s, 'effectif_moyen': effectif_moyen,
        'turnover': taux((nb_e + nb_s) / 2, effectif_moyen),
        'taux_depart': taux(nb_s, effectif_moyen),
    }


def _par_mois(qs, champ):
    return {
        r['m'].strftime('%Y-%m'): r['n']
        for r in qs.annotate(m=TruncMonth(champ)).values('m').annotate(n=Count('id'))
    }


def _mois(debut, fin):
    cles, curseur = [], debut.replace(day=1)
    while curseur <= fin:
        cles.append(curseur.strftime('%Y-%m'))
        curseur = (curseur.replace(day=28) + timedelta(days=4)).replace(day=1)
    return cles


def _retention(ref):
    """Pour chaque promotion de recrutement : part encore présente 1, 3 et 5 ans
    après le recrutement. Un sorti sans date de sortie est « inconnu » : exclu
    du calcul de la promotion (on ne sait pas quand il est parti)."""
    lignes = []
    for annee in range(ref.year - ANNEES_COHORTES + 1, ref.year + 1):
        recrues = list(Employee.objects.filter(date_embauche__year=annee)
                       .values('date_embauche', 'statut', 'date_sortie'))
        connus = [r for r in recrues if r['statut'] not in STATUTS_SORTIE or r['date_sortie']]
        ligne = {'annee': annee, 'recrutes': len(recrues), 'inconnus': len(recrues) - len(connus)}
        for jalon in JALONS_RETENTION:
            echus = [r for r in connus if ajouter_annees(r['date_embauche'], jalon) <= ref]
            if not echus:
                ligne[f'a_{jalon}_an'] = None
                continue
            presents = sum(
                1 for r in echus
                if not r['date_sortie'] or r['date_sortie'] > ajouter_annees(r['date_embauche'], jalon)
            )
            ligne[f'a_{jalon}_an'] = taux(presents, len(echus))
        lignes.append(ligne)
    return lignes


def construire(params, user):
    ref = timezone.localdate()
    debut, fin = params.date_debut, params.date_fin
    courant = _flux(debut, fin)
    precedent = _flux(*params.periode_precedente)

    sorties = Employee.objects.filter(statut__in=STATUTS_SORTIE, date_sortie__range=[debut, fin])
    entrees = Employee.objects.filter(date_embauche__range=[debut, fin])
    anciennetes = [
        annees_revolues(e, s) for e, s in sorties.exclude(date_embauche__isnull=True)
        .values_list('date_embauche', 'date_sortie') if s >= e
    ]
    departs_precoces = sum(1 for e, s in sorties.exclude(date_embauche__isnull=True)
                           .values_list('date_embauche', 'date_sortie') if (s - e).days < 365)
    non_datees = Employee.objects.filter(statut__in=STATUTS_SORTIE, date_sortie__isnull=True).count()

    par_motif = [
        {'nom': r['motif_archivage__nom'] or 'Sans motif', 'count': r['n']}
        for r in sorties.values('motif_archivage__nom').annotate(n=Count('id')).order_by('-n')
    ]
    sorties_sexe = defaultdict(int)
    for r in sorties.values('sexe').annotate(n=Count('id')):
        sorties_sexe[CLE_SEXE.get(r['sexe'], 'non_renseigne')] += r['n']

    par_direction = {}
    for qs, cle in ((entrees, 'entrees'), (sorties, 'sorties')):
        for r in qs.values('direction__nom').annotate(n=Count('id')):
            nom = r['direction__nom'] or 'Non renseigné'
            par_direction.setdefault(nom, {'nom': nom, 'entrees': 0, 'sorties': 0})[cle] = r['n']
    lignes_direction = sorted(par_direction.values(), key=lambda l: -(l['entrees'] + l['sorties']))
    for l in lignes_direction:
        l['solde'] = l['entrees'] - l['sorties']

    e_mois, s_mois = _par_mois(entrees, 'date_embauche'), _par_mois(sorties, 'date_sortie')
    evolution = [{'mois': m, 'entrees': e_mois.get(m, 0), 'sorties': s_mois.get(m, 0)} for m in _mois(debut, fin)]

    kpis = [
        kpi('entrees', courant['entrees'], precedente=precedent['entrees']),
        kpi('sorties_reelles', courant['sorties'], precedente=precedent['sorties']),
        kpi('solde_net', courant['entrees'] - courant['sorties']),
        kpi('turnover', courant['turnover'], '%', precedente=precedent['turnover']),
        kpi('taux_depart', courant['taux_depart'], '%', precedente=precedent['taux_depart']),
        kpi('anciennete_au_depart', round(mean(anciennetes), 1) if anciennetes else None, 'ans'),
        kpi('departs_precoces', departs_precoces),
        kpi('sorties_non_datees', non_datees),
    ]
    data = {
        'kpis': kpis, 'evolution': evolution, 'par_motif': par_motif,
        'sorties_par_sexe': [{'nom': n, 'count': sorties_sexe[c]}
                             for c, n in (('hommes', 'Hommes'), ('femmes', 'Femmes'), ('non_renseigne', 'Non renseigné'))
                             if sorties_sexe[c]],
        'par_direction': lignes_direction, 'retention': _retention(ref),
        'effectif_moyen': courant['effectif_moyen'],
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Évolution', ['Mois', 'Entrées', 'Sorties'], [[e['mois'], e['entrees'], e['sorties']] for e in evolution]),
        table('Sorties par motif', ['Motif', 'Sorties'], [[m['nom'], m['count']] for m in par_motif]),
        table('Par direction', ['Direction', 'Entrées', 'Sorties', 'Solde'],
              [[l['nom'], l['entrees'], l['sorties'], l['solde']] for l in lignes_direction]),
        table('Rétention', ['Promotion', 'Recrutés', 'Sortis non datés', 'Présents à 1 an (%)',
                            'Présents à 3 ans (%)', 'Présents à 5 ans (%)'],
              [[r['annee'], r['recrutes'], r['inconnus'], r['a_1_an'], r['a_3_an'], r['a_5_an']]
               for r in data['retention']]),
    ]
    return data

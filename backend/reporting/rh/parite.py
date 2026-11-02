# backend/reporting/rh/parite.py
from collections import defaultdict
from statistics import mean

from django.db.models import Count
from django.utils import timezone

from audit.stats import AGE_TRANCHES
from employees.models import Employee
from reporting.rh.commun import (
    CLE_SEXE, actifs, annees_revolues, kpi, masquer, table, table_kpis, taux, tranche,
)
from reporting.rh.effectifs import responsables_actifs_ids

LIBELLES = {'hommes': 'Hommes', 'femmes': 'Femmes', 'non_renseigne': 'Non renseigné'}
AXES = [
    ('par_direction', 'direction__nom', 'Direction'),
    ('par_departement', 'departement__nom', 'Département'),
    ('par_categorie', 'categorie__nom', 'Catégorie'),
    ('par_type_contrat', 'type_contrat__nom', 'Type de contrat'),
    ('par_fonction', 'poste__nom', 'Fonction'),
]


def _compter(qs):
    compte = {'hommes': 0, 'femmes': 0, 'non_renseigne': 0}
    for r in qs.values('sexe').annotate(n=Count('id')):
        compte[CLE_SEXE.get(r['sexe'], 'non_renseigne')] += r['n']
    return compte


def _taux_f(compte):
    return taux(compte['femmes'], compte['hommes'] + compte['femmes'])


def _en_donut(compte):
    return [{'nom': LIBELLES[cle], 'count': n} for cle, n in compte.items() if n]


def _ventiler(qs, champ):
    par_nom = {}
    for r in qs.values(champ, 'sexe').annotate(n=Count('id')):
        nom = r[champ] or 'Non renseigné'
        ligne = par_nom.setdefault(nom, {'nom': nom, 'hommes': 0, 'femmes': 0, 'non_renseigne': 0})
        ligne[CLE_SEXE.get(r['sexe'], 'non_renseigne')] += r['n']
    lignes = []
    for ligne in par_nom.values():
        ligne['total'] = ligne['hommes'] + ligne['femmes'] + ligne['non_renseigne']
        ligne['taux_feminisation'] = _taux_f(ligne)
        lignes.append(ligne)
    lignes.sort(key=lambda l: -l['total'])
    return masquer(lignes, ('hommes', 'femmes', 'non_renseigne', 'taux_feminisation'))


def _pyramide_sexe(qs, ref):
    lignes = {lib: {'tranche': lib, 'hommes': 0, 'femmes': 0, 'non_renseigne': 0} for *_b, lib in AGE_TRANCHES}
    for naissance, sexe in qs.exclude(date_naissance__isnull=True).values_list('date_naissance', 'sexe'):
        lib = tranche(annees_revolues(naissance, ref), AGE_TRANCHES)
        if lib:
            lignes[lib][CLE_SEXE.get(sexe, 'non_renseigne')] += 1
    return list(lignes.values())


def _anciennete_par_sexe(qs, ref):
    par_sexe = defaultdict(list)
    for embauche, sexe in qs.exclude(date_embauche__isnull=True).values_list('date_embauche', 'sexe'):
        par_sexe[CLE_SEXE.get(sexe, 'non_renseigne')].append(annees_revolues(embauche, ref))
    return [
        {'sexe': LIBELLES[cle], 'anciennete_moyenne': round(mean(v), 1) if v else None}
        for cle in ('hommes', 'femmes', 'non_renseigne') for v in [par_sexe.get(cle, [])]
    ]


def construire(params, user):
    ref = timezone.localdate()
    qs = actifs()
    global_ = _compter(qs)
    encadrement = _compter(Employee.objects.filter(id__in=responsables_actifs_ids()))
    recrutes = _compter(Employee.objects.filter(date_embauche__range=[params.date_debut, params.date_fin]))
    debut_prec, fin_prec = params.periode_precedente
    recrutes_prec = _compter(Employee.objects.filter(date_embauche__range=[debut_prec, fin_prec]))
    kpis = [
        kpi('taux_feminisation', _taux_f(global_), '%'),
        kpi('sexe_non_renseigne', global_['non_renseigne']),
        kpi('feminisation_encadrement', _taux_f(encadrement), '%'),
        kpi('feminisation_recrutements', _taux_f(recrutes), '%', precedente=_taux_f(recrutes_prec)),
    ]
    data = {
        'kpis': kpis,
        'repartition': _en_donut(global_),
        'pyramide_age_sexe': _pyramide_sexe(qs, ref),
        'encadrement': _en_donut(encadrement),
        'recrutements': _en_donut(recrutes),
        'anciennete_par_sexe': _anciennete_par_sexe(qs, ref),
    }
    for cle, champ, _libelle in AXES:
        data[cle] = _ventiler(qs, champ)

    colonnes = ['Hommes', 'Femmes', 'Non renseigné', 'Total', 'Taux de féminisation (%)']
    data['exports'] = [
        table_kpis(kpis),
        table('Pyramide des âges par sexe', ['Tranche', 'Hommes', 'Femmes', 'Non renseigné'],
              [[l['tranche'], l['hommes'], l['femmes'], l['non_renseigne']] for l in data['pyramide_age_sexe']]),
        *[
            table(f'Par {libelle.lower()}', [libelle, *colonnes], [
                [l['nom'], l['hommes'], l['femmes'], l['non_renseigne'], l['total'], l['taux_feminisation']]
                for l in data[cle]
            ])
            for cle, _champ, libelle in AXES
        ],
    ]
    return data

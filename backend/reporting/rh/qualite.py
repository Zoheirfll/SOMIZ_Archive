# backend/reporting/rh/qualite.py
from functools import reduce
from operator import or_

from django.db.models import Count, F, Q
from django.db.models.functions import Upper

from audit.stats import _completude_par_departement, _completude_par_direction, _employes_complets
from employees.models import Contrat, Employee, TypeDocument
from reporting.rh.commun import STATUTS_SORTIE, actifs, kpi, table, table_kpis, taux

CHAMPS = [
    ('date_naissance', 'Date de naissance'), ('date_embauche', 'Date de recrutement'), ('sexe', 'Sexe'),
    ('direction', 'Direction'), ('poste', 'Fonction'), ('type_contrat', 'Type de contrat'),
    ('categorie', 'Catégorie'),
]
LIMITE_LISTE = 100


def _manque(champ):
    return Q(sexe='') if champ == 'sexe' else Q(**{f'{champ}__isnull': True})


def _ligne(e, detail=''):
    return {'matricule': e['matricule'], 'nom': f"{e['prenom']} {e['nom']}", 'detail': detail}


def _incoherences():
    valeurs = ('matricule', 'nom', 'prenom')
    sortis_sans_motif = Employee.objects.filter(statut__in=STATUTS_SORTIE, motif_archivage__isnull=True)
    naissance_apres_embauche = Employee.objects.filter(date_naissance__gte=F('date_embauche'))
    contrats_inverses = Contrat.objects.filter(date_fin__lt=F('date_debut')).select_related('employee')
    groupes = (Employee.objects.exclude(date_naissance__isnull=True)
               .annotate(nom_maj=Upper('nom'), prenom_maj=Upper('prenom'))
               .values('nom_maj', 'prenom_maj', 'date_naissance').annotate(n=Count('id')).filter(n__gt=1))
    doublons = []
    if groupes:
        cle = reduce(or_, (Q(nom__iexact=g['nom_maj'], prenom__iexact=g['prenom_maj'],
                             date_naissance=g['date_naissance']) for g in groupes))
        doublons = [_ligne(e, f"né(e) le {e['date_naissance'].isoformat()}")
                    for e in Employee.objects.filter(cle).order_by('nom', 'prenom')
                    .values(*valeurs, 'date_naissance')[:LIMITE_LISTE]]
    sortis_sans_date = Employee.objects.filter(statut__in=STATUTS_SORTIE, date_sortie__isnull=True)
    return [
        {'code': 'sortis_sans_date', 'libelle': 'Sortis sans date de sortie (à compléter depuis la fiche)',
         'lignes': [_ligne(e) for e in sortis_sans_date.order_by('nom').values(*valeurs)[:LIMITE_LISTE]]},
        {'code': 'sortis_sans_motif', 'libelle': "Sortis sans motif d'archivage",
         'lignes': [_ligne(e) for e in sortis_sans_motif.order_by('nom').values(*valeurs)[:LIMITE_LISTE]]},
        {'code': 'naissance_apres_embauche', 'libelle': 'Date de naissance postérieure au recrutement',
         'lignes': [_ligne(e) for e in naissance_apres_embauche.order_by('nom').values(*valeurs)[:LIMITE_LISTE]]},
        {'code': 'contrats_inverses', 'libelle': 'Contrat dont la fin précède le début',
         'lignes': [{'matricule': c.employee.matricule, 'nom': f'{c.employee.prenom} {c.employee.nom}',
                     'detail': c.numero_contrat} for c in contrats_inverses[:LIMITE_LISTE]]},
        {'code': 'doublons', 'libelle': 'Doublons probables (même nom, prénom et date de naissance)',
         'lignes': doublons},
    ]


def construire(params, user):
    qs = actifs()
    total = qs.count()
    manquants = []
    for champ, libelle in CHAMPS:
        nb = qs.filter(_manque(champ)).count()
        manquants.append({'champ': champ, 'libelle': libelle, 'nb': nb, 'taux': taux(nb, total)})
    incompletes = qs.filter(reduce(or_, (_manque(c) for c, _l in CHAMPS))).count()
    ids = list(TypeDocument.objects.filter(obligatoire=True, is_active=True, sous_types__isnull=True)
               .values_list('id', flat=True))
    complets = _employes_complets(ids).count() if ids else total
    incoherences = _incoherences()
    kpis = [
        kpi('completude', taux(complets, total), '%'),
        kpi('fiches_incompletes', incompletes),
        kpi('incoherences', sum(len(i['lignes']) for i in incoherences)),
    ]
    data = {
        'kpis': kpis, 'champs_manquants': manquants, 'incoherences': incoherences,
        'completude_par_direction': _completude_par_direction(),
        'completude_par_departement': _completude_par_departement(),
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Champs manquants', ['Donnée', 'Actifs concernés', 'Part (%)'],
              [[m['libelle'], m['nb'], m['taux']] for m in manquants]),
        table('Complétude', ['Direction', 'Département', 'Total', 'Complets', 'Taux (%)'],
              [[r['nom'], '', r['total'], r['complets'], r['taux']] for r in data['completude_par_direction']]
              + [[r['direction_nom'], r['nom'], r['total'], r['complets'], r['taux']]
                 for r in data['completude_par_departement']]),
        table('Incohérences', ['Anomalie', 'Matricule', 'Employé', 'Détail'],
              [[i['libelle'], l['matricule'], l['nom'], l['detail']] for i in incoherences for l in i['lignes']]),
    ]
    return data

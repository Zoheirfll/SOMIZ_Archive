# backend/reporting/rh/contrats.py
from statistics import mean

from django.db.models import Count, Q

from audit.stats import _contrats_echeance, _contrats_echus, _repartition_simple
from employees.models import Contrat
from reporting.rh.commun import actifs, kpi, table, table_kpis


def construire(params, user):
    echeance = _contrats_echeance(params.echeance_jours)
    echus = _contrats_echus()  # partagé avec le tableau de bord (audit/stats.py)
    cdd = Q(contrats__type_contrat__duree_indeterminee=False)
    enchaines = [
        {'matricule': e['matricule'], 'nom': f"{e['prenom']} {e['nom']}", 'nb_cdd': e['nb_cdd']}
        for e in actifs().annotate(nb_cdd=Count('contrats', filter=cdd)).filter(nb_cdd__gte=2)
        .order_by('-nb_cdd', 'nom').values('matricule', 'nom', 'prenom', 'nb_cdd')
    ]
    cdd_actifs = Contrat.objects.filter(statut='actif', type_contrat__duree_indeterminee=False)
    durees = [
        (fin - debut).days for debut, fin in Contrat.objects.filter(
            type_contrat__duree_indeterminee=False, date_debut__isnull=False, date_fin__isnull=False,
        ).values_list('date_debut', 'date_fin') if fin >= debut
    ]
    kpis = [
        kpi('contrats_echeance', len(echeance)),
        kpi('contrats_echus', len(echus)),
        kpi('cdd_actifs', cdd_actifs.count()),
        kpi('duree_moyenne_cdd', round(mean(durees) / 30.44, 1) if durees else None, 'mois'),
        kpi('cdd_enchaines', len(enchaines)),
    ]
    data = {
        'kpis': kpis, 'echeance_jours': params.echeance_jours,
        'contrats_echeance': echeance, 'contrats_echus': echus, 'cdd_enchaines': enchaines,
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
    }
    data['exports'] = [
        table_kpis(kpis),
        table(f'Échéances {params.echeance_jours} j', ['N° contrat', 'Matricule', 'Employé', 'Date de fin', 'Jours restants'],
              [[c['numero_contrat'], c['employee_matricule'], c['employee_nom'], c['date_fin'], c['jours_restants']]
               for c in echeance]),
        table('Contrats échus', ['N° contrat', 'Matricule', 'Employé', 'Date de fin', 'Jours de dépassement'],
              [[c['numero_contrat'], c['employee_matricule'], c['employee_nom'], c['date_fin'], c['jours_depasses']]
               for c in echus]),
        table('Contrats successifs', ['Matricule', 'Employé', 'Nombre de CDD'],
              [[e['matricule'], e['nom'], e['nb_cdd']] for e in enchaines]),
    ]
    return data

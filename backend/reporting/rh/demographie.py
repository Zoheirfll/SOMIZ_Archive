# backend/reporting/rh/demographie.py
from collections import defaultdict
from statistics import mean, median

from django.utils import timezone

from audit.stats import _pyramide_age, _pyramide_anciennete
from employees.models import Contrat
from reporting.rh.commun import (
    actifs, age_retraite, ajouter_annees, annees_revolues, kpi, masquer, table, table_kpis, taux,
)


def _date_retraite(naissance, sexe):
    return ajouter_annees(naissance, age_retraite(sexe))


def construire(params, user):
    ref = timezone.localdate()
    horizon = params.horizon
    agents = list(actifs().values(
        'id', 'matricule', 'nom', 'prenom', 'sexe', 'date_naissance', 'date_embauche',
        'direction__nom', 'poste__nom',
    ))
    for a in agents:
        a['date_retraite'] = _date_retraite(a['date_naissance'], a['sexe']) if a['date_naissance'] else None
        a['age'] = annees_revolues(a['date_naissance'], ref) if a['date_naissance'] else None
        a['anciennete'] = annees_revolues(a['date_embauche'], ref) if a['date_embauche'] else None

    ages = [a['age'] for a in agents if a['age'] is not None]
    anciennetes = [a['anciennete'] for a in agents if a['anciennete'] is not None]
    limite_12m = ajouter_annees(ref, 1)
    partants_12m = [a for a in agents if a['date_retraite'] and a['date_retraite'] <= limite_12m]
    deja_atteint = sum(1 for a in agents if a['date_retraite'] and a['date_retraite'] <= ref)

    # Fins de contrats à durée déterminée connues (contrats actifs datés).
    fins_cdd = list(Contrat.objects.filter(
        statut='actif', employee__statut='actif', type_contrat__duree_indeterminee=False,
        date_fin__gt=ref, date_fin__lte=ajouter_annees(ref, horizon),
    ).values_list('employee_id', 'date_fin'))

    previsions = []
    for annee in range(1, horizon + 1):
        debut, fin = ajouter_annees(ref, annee - 1), ajouter_annees(ref, annee)
        departs = sum(1 for a in agents if a['date_retraite'] and (
            debut < a['date_retraite'] <= fin or (annee == 1 and a['date_retraite'] <= ref)))
        sortants = {a['id'] for a in agents if a['date_retraite'] and a['date_retraite'] <= fin}
        sortants |= {emp for emp, date_fin in fins_cdd if date_fin <= fin}
        previsions.append({
            'annee': annee, 'fin': fin.isoformat(), 'departs': departs,
            'fins_cdd': sum(1 for _e, date_fin in fins_cdd if debut < date_fin <= fin),
            'effectif_projete': len(agents) - len(sortants),
        })

    limite_horizon = ajouter_annees(ref, horizon)
    par_direction = defaultdict(list)
    for a in agents:
        par_direction[a['direction__nom'] or 'Non renseigné'].append(a)
    lignes_direction = []
    for nom, groupe in par_direction.items():
        ages_g = [a['age'] for a in groupe if a['age'] is not None]
        anc_g = [a['anciennete'] for a in groupe if a['anciennete'] is not None]
        lignes_direction.append({
            'nom': nom, 'total': len(groupe),
            'age_moyen': round(mean(ages_g), 1) if ages_g else None,
            'anciennete_moyenne': round(mean(anc_g), 1) if anc_g else None,
            'nb_55_plus': sum(1 for x in ages_g if x >= 55),
            'departs_horizon': sum(1 for a in groupe if a['date_retraite'] and a['date_retraite'] <= limite_horizon),
        })
    lignes_direction.sort(key=lambda l: -l['total'])
    masquer(lignes_direction, ('age_moyen', 'anciennete_moyenne', 'nb_55_plus', 'departs_horizon'))

    # Postes à risque : tous les titulaires, d'âge connu, partent dans l'horizon.
    par_poste = defaultdict(list)
    for a in agents:
        if a['poste__nom']:
            par_poste[a['poste__nom']].append(a)
    postes_a_risque = []
    for poste, titulaires in sorted(par_poste.items()):
        if all(t['date_retraite'] and t['date_retraite'] <= limite_horizon for t in titulaires):
            postes_a_risque.append({
                'poste': poste, 'nb_titulaires': len(titulaires),
                'premiere_retraite': min(t['date_retraite'] for t in titulaires).isoformat(),
                'titulaires': [
                    {'matricule': t['matricule'], 'nom': f"{t['prenom']} {t['nom']}",
                     'date_retraite': t['date_retraite'].isoformat()}
                    for t in sorted(titulaires, key=lambda t: t['date_retraite'])
                ],
            })
    postes_a_risque.sort(key=lambda p: p['premiere_retraite'])

    kpis = [
        kpi('age_moyen', round(mean(ages), 1) if ages else None, 'ans'),
        kpi('age_median', median(ages) if ages else None, 'ans'),
        kpi('anciennete_moyenne', round(mean(anciennetes), 1) if anciennetes else None, 'ans'),
        kpi('part_55_plus', taux(sum(1 for x in ages if x >= 55), len(ages)), '%'),
        kpi('departs_retraite_12m', len(partants_12m)),
        kpi('retraite_incertaine', sum(1 for a in partants_12m if not a['sexe'])),
        kpi('naissance_inconnue', sum(1 for a in agents if a['date_naissance'] is None)),
        kpi('postes_a_risque', len(postes_a_risque)),
    ]
    data = {
        'kpis': kpis, 'horizon': horizon, 'deja_atteint': deja_atteint,
        'pyramide_age': _pyramide_age(), 'pyramide_anciennete': _pyramide_anciennete(),
        'previsions': previsions, 'par_direction': lignes_direction, 'postes_a_risque': postes_a_risque,
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Prévisions', ['Année', "Jusqu'au", 'Départs à la retraite', 'Fins de CDD', 'Effectif projeté'],
              [[p['annee'], p['fin'], p['departs'], p['fins_cdd'], p['effectif_projete']] for p in previsions]),
        table('Par direction', ['Direction', 'Effectif', 'Âge moyen', 'Ancienneté moyenne', '55 ans et plus',
                                f'Départs sous {horizon} ans'],
              [[l['nom'], l['total'], l['age_moyen'], l['anciennete_moyenne'], l['nb_55_plus'], l['departs_horizon']]
               for l in lignes_direction]),
        table('Postes à risque', ['Fonction', 'Titulaires', 'Première retraite', 'Détail'],
              [[p['poste'], p['nb_titulaires'], p['premiere_retraite'],
                ', '.join(f"{t['nom']} ({t['date_retraite']})" for t in p['titulaires'])]
               for p in postes_a_risque]),
    ]
    return data

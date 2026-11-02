# backend/reporting/rh/unites.py
"""Comparaison des unités (carte de chaleur) : une ligne par direction, une
colonne par indicateur, plus la valeur de l'organisation pour référence.
L'UI colore chaque cellule selon son écart à l'organisation (ou à la cible)."""
from collections import defaultdict
from statistics import mean

from django.utils import timezone

from audit.stats import _employes_complets
from employees.models import Employee, TypeDocument
from reporting.rh.commun import (
    STATUTS_SORTIE, actifs, age_retraite, ajouter_annees, annees_revolues, masquer, table, taux,
)
from reporting.rh.definitions import definition

# (code, sens) : « haut » = une valeur haute est favorable, « bas » = défavorable,
# None = neutre (information, pas de jugement).
INDICATEURS = [
    ('effectif_actif', None), ('taux_feminisation', None), ('age_moyen', None), ('part_55_plus', 'bas'),
    ('anciennete_moyenne', None), ('completude', 'haut'), ('taux_depart', 'bas'), ('departs_horizon', 'bas'),
]
SENSIBLES = ('taux_feminisation', 'age_moyen', 'part_55_plus', 'anciennete_moyenne', 'departs_horizon')


def _indicateurs(agents, nb_sorties, complets, limite):
    ages = [a['age'] for a in agents if a['age'] is not None]
    anc = [a['anciennete'] for a in agents if a['anciennete'] is not None]
    h = sum(1 for a in agents if a['sexe'] == 'M')
    f = sum(1 for a in agents if a['sexe'] == 'F')
    return {
        'effectif_actif': len(agents), 'total': len(agents),
        'taux_feminisation': taux(f, h + f),
        'age_moyen': round(mean(ages), 1) if ages else None,
        'part_55_plus': taux(sum(1 for x in ages if x >= 55), len(ages)),
        'anciennete_moyenne': round(mean(anc), 1) if anc else None,
        'completude': taux(complets, len(agents)),
        'taux_depart': taux(nb_sorties, len(agents) + nb_sorties),
        'departs_horizon': sum(1 for a in agents if a['retraite'] and a['retraite'] <= limite),
    }


def construire(params, user):
    ref = timezone.localdate()
    limite = ajouter_annees(ref, params.horizon)
    ids_obligatoires = list(TypeDocument.objects.filter(obligatoire=True, is_active=True, sous_types__isnull=True)
                            .values_list('id', flat=True))
    complets = set(_employes_complets(ids_obligatoires).values_list('id', flat=True)) if ids_obligatoires \
        else set(actifs().values_list('id', flat=True))
    par_direction = defaultdict(list)
    for a in actifs().values('id', 'sexe', 'date_naissance', 'date_embauche', 'direction__nom'):
        a['age'] = annees_revolues(a['date_naissance'], ref) if a['date_naissance'] else None
        a['anciennete'] = annees_revolues(a['date_embauche'], ref) if a['date_embauche'] else None
        a['retraite'] = ajouter_annees(a['date_naissance'], age_retraite(a['sexe'])) if a['date_naissance'] else None
        par_direction[a['direction__nom'] or 'Non renseigné'].append(a)
    sorties = defaultdict(int)
    for nom in Employee.objects.filter(statut__in=STATUTS_SORTIE, date_sortie__range=[params.date_debut, params.date_fin]) \
            .values_list('direction__nom', flat=True):
        sorties[nom or 'Non renseigné'] += 1

    lignes = []
    for nom, agents in par_direction.items():
        ligne = {'nom': nom, **_indicateurs(agents, sorties[nom], sum(1 for a in agents if a['id'] in complets), limite)}
        lignes.append(ligne)
    lignes.sort(key=lambda l: -l['total'])
    masquer(lignes, SENSIBLES)
    tous = [a for agents in par_direction.values() for a in agents]
    organisation = _indicateurs(tous, sum(sorties.values()), sum(1 for a in tous if a['id'] in complets), limite)

    colonnes = [{**definition(code), 'sens': sens} for code, sens in INDICATEURS]
    return {
        'kpis': [], 'colonnes': colonnes, 'lignes': lignes, 'organisation': organisation, 'horizon': params.horizon,
        'exports': [table('Comparaison des unités', ['Direction', *[c['libelle'] for c in colonnes]],
                          [[l['nom'], *[l[c] for c, _s in INDICATEURS]] for l in lignes]
                          + [['Organisation', *[organisation[c] for c, _s in INDICATEURS]]])],
    }

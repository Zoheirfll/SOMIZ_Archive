# backend/reporting/rh/carriere.py
"""Carrière et mobilité : historiques Fonction / Catégorie / Échelle et
transferts organisationnels (journal d'audit)."""
from collections import Counter
from statistics import mean

from django.utils import timezone

from audit.models import AuditLog
from employees.models import HistoriqueCategorie, HistoriqueEchelle, HistoriqueFonction
from reporting.rh.commun import actifs, ajouter_annees, annees_revolues, kpi, table, table_kpis

AXES = [('fonction', 'Fonction', HistoriqueFonction), ('categorie', 'Catégorie', HistoriqueCategorie),
        ('echelle', 'Échelle', HistoriqueEchelle)]
CLES_ORGANISATION = ('direction', 'departement', 'service', 'cellule', 'section')
ANNEES_SANS_EVOLUTION = 5
LIMITE_LISTE = 100


def _changements(modele, debut, fin):
    """Périodes ouvertes dans [debut, fin] qui ne sont pas la première période
    de l'agent (la première est une affectation initiale, pas un changement)."""
    premieres = {}
    for emp, d in modele.objects.values_list('employee_id', 'date_debut'):
        if emp not in premieres or d < premieres[emp]:
            premieres[emp] = d
    return sum(1 for emp, d in modele.objects.filter(date_debut__range=[debut, fin])
               .values_list('employee_id', 'date_debut') if d > premieres[emp])


def construire(params, user):
    ref = timezone.localdate()
    debut, fin = params.date_debut, params.date_fin
    ids_actifs = set(actifs().values_list('id', flat=True))

    lignes_axes, derniere_evolution = [], {}
    for code, libelle, modele in AXES:
        ouvertes = [annees_revolues(d, ref) for emp, d in modele.objects.filter(
            date_fin__isnull=True, employee_id__in=ids_actifs).values_list('employee_id', 'date_debut')]
        lignes_axes.append({
            'code': code, 'nom': libelle, 'changements': _changements(modele, debut, fin),
            'duree_moyenne': round(mean(ouvertes), 1) if ouvertes else None,
        })
        for emp, d in modele.objects.filter(employee_id__in=ids_actifs).values_list('employee_id', 'date_debut'):
            if emp not in derniere_evolution or d > derniere_evolution[emp]:
                derniere_evolution[emp] = d

    seuil = ajouter_annees(ref, -ANNEES_SANS_EVOLUTION)
    stagnants = []
    for e in actifs().order_by('nom', 'prenom').values('id', 'matricule', 'nom', 'prenom', 'date_embauche', 'poste__nom'):
        derniere = derniere_evolution.get(e['id']) or e['date_embauche']
        if derniere and derniere <= seuil:
            stagnants.append({'matricule': e['matricule'], 'nom': f"{e['prenom']} {e['nom']}",
                              'poste': e['poste__nom'] or '', 'depuis': derniere.isoformat(),
                              'annees': annees_revolues(derniere, ref)})
    stagnants.sort(key=lambda s: -s['annees'])

    transferts, destinations = 0, Counter()
    for details in AuditLog.objects.filter(action=AuditLog.Action.MODIFY_EMP,
                                           timestamp__date__range=[debut, fin]).values_list('details', flat=True):
        transfert = (details or {}).get('transfer') or {}
        cles = [c for c in CLES_ORGANISATION if c in transfert]
        if cles:
            transferts += 1
            destinations[transfert[cles[0]].get('vers') or 'Non renseigné'] += 1

    kpis = [
        kpi('changements_fonction', lignes_axes[0]['changements']),
        kpi('changements_categorie', lignes_axes[1]['changements']),
        kpi('changements_echelle', lignes_axes[2]['changements']),
        kpi('transferts', transferts),
        kpi('sans_evolution', len(stagnants)),
    ]
    data = {
        'kpis': kpis, 'axes': lignes_axes, 'annees_sans_evolution': ANNEES_SANS_EVOLUTION,
        'sans_evolution': stagnants[:LIMITE_LISTE],
        'transferts_par_destination': [{'nom': n, 'count': c} for n, c in destinations.most_common()],
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Par axe', ['Axe', 'Changements sur la période', 'Durée moyenne en cours (ans)'],
              [[a['nom'], a['changements'], a['duree_moyenne']] for a in lignes_axes]),
        table('Sans évolution', ['Matricule', 'Employé', 'Fonction', 'Depuis', 'Années'],
              [[s['matricule'], s['nom'], s['poste'], s['depuis'], s['annees']] for s in stagnants]),
        table('Transferts', ['Unité de destination', 'Transferts'],
              [[d['nom'], d['count']] for d in data['transferts_par_destination']]),
    ]
    return data

# backend/reporting/rh/conges.py
"""Statistiques des congés — réservées au traiteur des congés (SUPERADMIN ou
ADMIN charge_conge). SOMIZ ne connaît que CP / CE / CS : pas d'absentéisme."""
from collections import defaultdict
from statistics import mean

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncMonth

from conges.models import DemandeConge, SoldeExercice, TypeConge
from reporting.rh.commun import kpi, table, table_kpis, taux

PRIS = (DemandeConge.Statut.ACCORDEE, DemandeConge.Statut.INTERROMPUE)
EN_ATTENTE = (DemandeConge.Statut.VISA, DemandeConge.Statut.RECUE)
LIBELLES_TYPE = dict(TypeConge.choices)
LIMITE_FORTS_SOLDES = 20


def _jours(d):
    """Jours réellement pris : jours effectifs d'un congé interrompu, sinon nb_jours."""
    return d['jours_effectifs'] if d['statut'] == DemandeConge.Statut.INTERROMPUE and d['jours_effectifs'] is not None \
        else d['nb_jours']


def construire(params, user):
    debut, fin = params.date_debut, params.date_fin
    pris = list(DemandeConge.objects.filter(statut__in=PRIS, date_depart__range=[debut, fin]).values(
        'type_conge', 'statut', 'nb_jours', 'jours_effectifs', 'date_depart', 'employee_id',
        'employee__direction__nom', 'motif__nom', 'created_at', 'date_etablissement'))
    deposees = DemandeConge.objects.filter(created_at__date__range=[debut, fin])
    statuts = {r['statut']: r['n'] for r in deposees.values('statut').annotate(n=Count('id'))}
    total_deposees = sum(statuts.values())
    traitees = sum(statuts.get(s, 0) for s in (*PRIS, DemandeConge.Statut.REJETEE))

    par_type, par_mois, par_direction, par_motif = defaultdict(int), defaultdict(int), defaultdict(int), defaultdict(int)
    for d in pris:
        jours = _jours(d)
        par_type[LIBELLES_TYPE.get(d['type_conge'], 'Non renseigné')] += jours
        par_mois[d['date_depart'].strftime('%Y-%m')] += jours
        par_direction[d['employee__direction__nom'] or 'Non renseigné'] += jours
        if d['type_conge'] == TypeConge.CE:
            par_motif[d['motif__nom'] or 'Sans motif'] += jours
    delais = [(d['date_etablissement'] - d['created_at'].date()).days for d in pris
              if d['date_etablissement'] and d['date_etablissement'] >= d['created_at'].date()]

    soldes = list(SoldeExercice.objects.values('exercice').annotate(
        droit=Sum('droit'), consomme=Sum('consomme')).order_by('exercice'))
    for s in soldes:
        s['reste'] = s['droit'] - s['consomme']
    forts = list(SoldeExercice.objects.values('employee__matricule', 'employee__nom', 'employee__prenom')
                 .annotate(reste=Sum(F('droit') - F('consomme'))).filter(reste__gt=0)
                 .order_by('-reste')[:LIMITE_FORTS_SOLDES])

    kpis = [
        kpi('jours_conge_pris', sum(_jours(d) for d in pris), 'j'),
        kpi('agents_partis_conge', len({d['employee_id'] for d in pris})),
        kpi('demandes_deposees', total_deposees),
        kpi('demandes_en_attente', DemandeConge.objects.filter(statut__in=EN_ATTENTE).count()),
        kpi('taux_rejet', taux(statuts.get(DemandeConge.Statut.REJETEE, 0), traitees), '%'),
        kpi('delai_moyen_conge', round(mean(delais), 1) if delais else None, 'j'),
        kpi('solde_restant', sum(s['reste'] for s in soldes), 'j'),
    ]
    data = {
        'kpis': kpis,
        'jours_par_type': [{'nom': n, 'count': c} for n, c in sorted(par_type.items(), key=lambda x: -x[1])],
        'jours_par_mois': [{'mois': m, 'jours': par_mois[m]} for m in sorted(par_mois)],
        'jours_par_direction': [{'nom': n, 'count': c} for n, c in sorted(par_direction.items(), key=lambda x: -x[1])],
        'jours_par_motif_ce': [{'nom': n, 'count': c} for n, c in sorted(par_motif.items(), key=lambda x: -x[1])],
        'demandes_par_statut': [{'nom': dict(DemandeConge.Statut.choices).get(s, s), 'count': n}
                                for s, n in sorted(statuts.items(), key=lambda x: -x[1])],
        'soldes_par_exercice': soldes,
        'forts_soldes': [{'matricule': f['employee__matricule'],
                          'nom': f"{f['employee__prenom']} {f['employee__nom']}", 'reste': f['reste']} for f in forts],
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Jours par type', ['Type', 'Jours'], [[r['nom'], r['count']] for r in data['jours_par_type']]),
        table('Jours par mois', ['Mois', 'Jours'], [[r['mois'], r['jours']] for r in data['jours_par_mois']]),
        table('Jours par direction', ['Direction', 'Jours'], [[r['nom'], r['count']] for r in data['jours_par_direction']]),
        table('Demandes par statut', ['Statut', 'Demandes'], [[r['nom'], r['count']] for r in data['demandes_par_statut']]),
        table('Soldes par exercice', ['Exercice', 'Droit', 'Consommé', 'Reste'],
              [[s['exercice'], s['droit'], s['consomme'], s['reste']] for s in soldes]),
        table('Plus forts soldes', ['Matricule', 'Employé', 'Jours restants'],
              [[f['matricule'], f['nom'], f['reste']] for f in data['forts_soldes']]),
    ]
    return data

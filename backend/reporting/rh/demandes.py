# backend/reporting/rh/demandes.py
"""Statistiques des demandes d'attestation et de consultation. Chaque section
n'est calculée que pour un compte qui la traite (can_manage_attestations /
can_manage_consultations) — la vue refuse l'accès si aucune ne l'est."""
from datetime import timedelta
from statistics import mean, median

from django.db.models import Count
from django.utils import timezone

from attestations.models import DemandeAttestation
from consultations.models import DemandeConsultation
from reporting.rh.commun import kpi, table, table_kpis, taux

RETARD_JOURS = 7


def _jours(debut, fin):
    return (fin - debut).total_seconds() / 86400


def _repartition(qs, champ, libelles=None):
    libelles = libelles or {}
    return [{'nom': libelles.get(r[champ], r[champ]) or 'Non renseigné', 'count': r['n']}
            for r in qs.values(champ).annotate(n=Count('id')).order_by('-n')]


def _section(qs, en_attente, rejetee, traitees_statuts, date_traitement, libelles_statut, prefixe):
    statuts = {r['statut']: r['n'] for r in qs.values('statut').annotate(n=Count('id'))}
    traitees = sum(statuts.get(s, 0) for s in traitees_statuts)
    delais = [_jours(c, t) for c, t in qs.exclude(**{f'{date_traitement}__isnull': True})
              .values_list('created_at', date_traitement) if t >= c]
    retard = timezone.now() - timedelta(days=RETARD_JOURS)
    kpis = [
        kpi(f'{prefixe}_deposees', qs.count()),
        kpi(f'{prefixe}_en_retard', qs.model.objects.filter(statut__in=en_attente, created_at__lt=retard).count()),
        kpi(f'{prefixe}_delai_moyen', round(mean(delais), 1) if delais else None, 'j'),
        kpi(f'{prefixe}_delai_median', round(median(delais), 1) if delais else None, 'j'),
        kpi(f'{prefixe}_taux_rejet', taux(statuts.get(rejetee, 0), traitees), '%'),
    ]
    return kpis, {
        'par_statut': [{'nom': libelles_statut.get(s, s), 'count': n} for s, n in sorted(statuts.items(), key=lambda x: -x[1])],
        'par_direction': _repartition(qs, 'employee__direction__nom'),
        'par_importance': _repartition(qs, 'importance', dict(qs.model.Importance.choices)),
    }


def construire(params, user):
    debut, fin = params.date_debut, params.date_fin
    data, kpis, exports = {}, [], []
    if user.can_manage_attestations:
        qs = DemandeAttestation.objects.filter(created_at__date__range=[debut, fin])
        k, section = _section(qs, (DemandeAttestation.Statut.VISA, DemandeAttestation.Statut.RECUE),
                              DemandeAttestation.Statut.REJETEE,
                              (DemandeAttestation.Statut.PRETE, DemandeAttestation.Statut.RECUPEREE,
                               DemandeAttestation.Statut.REJETEE),
                              'date_prete', dict(DemandeAttestation.Statut.choices), 'attestations')
        section['par_motif'] = _repartition(qs, 'motif__nom')
        kpis += k
        data['attestations'] = section
        exports += [table(f'Attestations — {titre}', [titre.capitalize(), 'Demandes'],
                          [[r['nom'], r['count']] for r in section[cle]])
                    for cle, titre in (('par_statut', 'statut'), ('par_motif', 'motif'), ('par_direction', 'direction'))]
    if user.can_manage_consultations:
        qs = DemandeConsultation.objects.filter(created_at__date__range=[debut, fin])
        k, section = _section(qs, (DemandeConsultation.Statut.EN_COURS,), DemandeConsultation.Statut.REJETEE,
                              (DemandeConsultation.Statut.VALIDEE, DemandeConsultation.Statut.REJETEE,
                               DemandeConsultation.Statut.REVOQUEE),
                              'date_validation', dict(DemandeConsultation.Statut.choices), 'consultations')
        section['par_type'] = _repartition(qs, 'type_demande', dict(DemandeConsultation.Type.choices))
        section['prolongations'] = sum(qs.values_list('nb_prolongations', flat=True))
        section['revocations'] = qs.filter(statut=DemandeConsultation.Statut.REVOQUEE).count()
        kpis += k
        data['consultations'] = section
        exports += [table(f'Consultations — {titre}', [titre.capitalize(), 'Demandes'],
                          [[r['nom'], r['count']] for r in section[cle]])
                    for cle, titre in (('par_statut', 'statut'), ('par_type', 'type'), ('par_direction', 'direction'))]
    data['kpis'] = kpis
    data['exports'] = [table_kpis(kpis), *exports]
    return data

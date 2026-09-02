"""
audit/stats.py
Calcul des statistiques de la page /statistiques — logique pure, sans
dépendance HTTP, partagée par StatsDetailView (JSON) et StatsExportView
(xlsx). Voir docs/superpowers/specs/2026-09-02-page-statistiques-design.md.
"""
from calendar import monthrange
from datetime import timedelta
from django.db.models import Count
from django.utils import timezone

from employees.models import Employee, Contrat, TypeDocument
from audit.models import AuditLog

STATUTS_ARCHIVE = ['Inactif', 'Archivé', 'Démobilisé']
TOP_FONCTIONS = 10

AGE_TRANCHES = [(0, 24, '<25'), (25, 34, '25-34'), (35, 44, '35-44'), (45, 54, '45-54'), (55, 200, '55+')]
ANCIENNETE_TRANCHES = [
    (0, 0, '<1 an'), (1, 2, '1-3 ans'), (3, 4, '3-5 ans'), (5, 9, '5-10 ans'), (10, 200, '10+ ans'),
]


def _default_periode():
    fin = timezone.localdate()
    debut = fin - timedelta(days=365)
    return debut, fin


def _variation_pct(valeur, valeur_precedente):
    if not valeur_precedente:
        return None
    return round((valeur - valeur_precedente) / valeur_precedente * 100, 1)


def _indicateurs(date_debut, date_fin):
    duree = (date_fin - date_debut).days + 1
    date_debut_prec = date_debut - timedelta(days=duree)
    date_fin_prec = date_debut - timedelta(days=1)

    def recrutements(debut, fin):
        return Employee.objects.filter(date_embauche__range=[debut, fin]).count()

    def archivages(debut, fin):
        return AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP,
            timestamp__date__range=[debut, fin],
            details__transfer__statut__vers__in=STATUTS_ARCHIVE,
        ).count()

    def dossiers_completes(debut, fin):
        types_obligatoires = TypeDocument.objects.filter(
            obligatoire=True, is_active=True, sous_types__isnull=True
        )
        qs = Employee.objects.filter(statut='actif', date_embauche__range=[debut, fin])
        for t in types_obligatoires:
            qs = qs.filter(documents__type_doc=t, documents__is_active=True)
        return qs.distinct().count()

    rec, rec_prec = recrutements(date_debut, date_fin), recrutements(date_debut_prec, date_fin_prec)
    arc, arc_prec = archivages(date_debut, date_fin), archivages(date_debut_prec, date_fin_prec)
    comp, comp_prec = dossiers_completes(date_debut, date_fin), dossiers_completes(date_debut_prec, date_fin_prec)

    return {
        'recrutements': {'valeur': rec, 'variation_pct': _variation_pct(rec, rec_prec)},
        'archivages': {'valeur': arc, 'variation_pct': _variation_pct(arc, arc_prec)},
        'dossiers_completes': {'valeur': comp, 'variation_pct': _variation_pct(comp, comp_prec)},
    }


def _repartition_direction():
    rows = Employee.objects.filter(statut='actif').values(
        'direction_id', 'direction__nom'
    ).annotate(count=Count('id')).order_by('-count')
    return [
        {'id': str(r['direction_id']), 'nom': r['direction__nom'] or 'Non renseigné', 'count': r['count']}
        for r in rows if r['direction_id']
    ]


def _repartition_departement():
    rows = Employee.objects.filter(statut='actif').values(
        'departement_id', 'departement__nom', 'departement__direction__nom'
    ).annotate(count=Count('id')).order_by('-count')
    return [
        {
            'id': str(r['departement_id']), 'nom': r['departement__nom'] or 'Non renseigné',
            'direction_nom': r['departement__direction__nom'], 'count': r['count'],
        }
        for r in rows if r['departement_id']
    ]


def _repartition_simple(field_nom):
    rows = Employee.objects.filter(statut='actif').values(field_nom).annotate(
        count=Count('id')
    ).order_by('-count')
    # Fusionne les lignes "Non renseigné" éventuellement dupliquées (une
    # par valeur NULL groupée séparément par Django selon la DB).
    merged = {}
    for r in rows:
        nom = r[field_nom] or 'Non renseigné'
        merged[nom] = merged.get(nom, 0) + r['count']
    return [{'nom': nom, 'count': count} for nom, count in sorted(merged.items(), key=lambda x: -x[1])]


def _repartition_fonction():
    full = _repartition_simple('poste__nom')
    if len(full) <= TOP_FONCTIONS:
        return full
    top = full[:TOP_FONCTIONS]
    autres_count = sum(r['count'] for r in full[TOP_FONCTIONS:])
    return top + [{'nom': 'Autres', 'count': autres_count}]


def _years_between(start, end):
    years = end.year - start.year
    if (end.month, end.day) < (start.month, start.day):
        years -= 1
    return years


def _evolution_mensuelle(date_debut, date_fin):
    months = []
    cursor = date_debut.replace(day=1)
    end_marker = date_fin.replace(day=1)
    while cursor <= end_marker:
        months.append(cursor)
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    result = []
    for m in months:
        last_day = monthrange(m.year, m.month)[1]
        m_debut, m_fin = m, m.replace(day=last_day)
        recrutements = Employee.objects.filter(date_embauche__range=[m_debut, m_fin]).count()
        archivages = AuditLog.objects.filter(
            action=AuditLog.Action.MODIFY_EMP,
            timestamp__date__range=[m_debut, m_fin],
            details__transfer__statut__vers__in=STATUTS_ARCHIVE,
        ).count()
        result.append({'mois': m.strftime('%Y-%m'), 'recrutements': recrutements, 'archivages': archivages})
    return result


def _pyramide(qs, date_field, tranches):
    today = timezone.localdate()
    buckets = {label: 0 for *_r, label in tranches}
    for value in qs.exclude(**{f'{date_field}__isnull': True}).values_list(date_field, flat=True):
        n = _years_between(value, today)
        for lo, hi, label in tranches:
            if lo <= n <= hi:
                buckets[label] += 1
                break
    return [{'tranche': label, 'count': buckets[label]} for *_r, label in tranches]


def _pyramide_age():
    return _pyramide(Employee.objects.filter(statut='actif'), 'date_naissance', AGE_TRANCHES)


def _pyramide_anciennete():
    return _pyramide(Employee.objects.filter(statut='actif'), 'date_embauche', ANCIENNETE_TRANCHES)


def _contrats_echeance():
    today = timezone.localdate()
    limite = today + timedelta(days=90)
    contrats = Contrat.objects.filter(
        statut='actif', date_fin__isnull=False, date_fin__range=[today, limite]
    ).select_related('employee').order_by('date_fin')
    return [
        {
            'id': str(c.id),
            'numero_contrat': c.numero_contrat,
            'employee_id': str(c.employee_id),
            'employee_nom': f'{c.employee.prenom} {c.employee.nom}',
            'date_fin': c.date_fin.isoformat(),
            'jours_restants': (c.date_fin - today).days,
        }
        for c in contrats
    ]


def _completude_par(group_field, extra_values=()):
    types_obligatoires = list(TypeDocument.objects.filter(
        obligatoire=True, is_active=True, sous_types__isnull=True
    ))
    base = Employee.objects.filter(statut='actif').exclude(**{f'{group_field}__isnull': True})
    groupes = base.values(f'{group_field}_id', f'{group_field}__nom', *extra_values).annotate(
        total=Count('id', distinct=True)
    )
    result = []
    for g in groupes:
        group_id = g[f'{group_field}_id']
        total = g['total']
        complets_qs = Employee.objects.filter(statut='actif', **{group_field: group_id})
        for t in types_obligatoires:
            complets_qs = complets_qs.filter(documents__type_doc=t, documents__is_active=True)
        complets = complets_qs.distinct().count()
        row = {
            'id': str(group_id),
            'nom': g[f'{group_field}__nom'],
            'total': total,
            'complets': complets,
            'taux': round(complets / total * 100, 1) if total else 0.0,
        }
        for extra in extra_values:
            row[extra] = g[extra]
        result.append(row)
    return sorted(result, key=lambda r: r['taux'])


def _completude_par_direction():
    return _completude_par('direction')


def _completude_par_departement():
    rows = _completude_par('departement', extra_values=('departement__direction__nom',))
    for r in rows:
        r['direction_nom'] = r.pop('departement__direction__nom')
    return rows


def build_stats_detail(date_debut, date_fin):
    if date_debut is None or date_fin is None:
        date_debut, date_fin = _default_periode()

    return {
        'periode': {'debut': date_debut.isoformat(), 'fin': date_fin.isoformat()},
        'indicateurs': _indicateurs(date_debut, date_fin),
        'repartition_direction': _repartition_direction(),
        'repartition_departement': _repartition_departement(),
        'repartition_categorie': _repartition_simple('categorie__nom'),
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
        'repartition_fonction': _repartition_fonction(),
        'evolution_mensuelle': _evolution_mensuelle(date_debut, date_fin),
        'pyramide_age': _pyramide_age(),
        'pyramide_anciennete': _pyramide_anciennete(),
        'contrats_echeance': _contrats_echeance(),
        'completude_par_direction': _completude_par_direction(),
        'completude_par_departement': _completude_par_departement(),
    }

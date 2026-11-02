# backend/reporting/rh/documents.py
"""Documents & archives : volumétrie, uploads, types, suppressions."""
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from audit.models import AuditLog
from employees.models import EmployeeDocument, EmployeeDocumentFile
from reporting.rh.commun import kpi, table, table_kpis

MO = 1024 * 1024


def _par_mois(qs, champ):
    return {r['m'].strftime('%Y-%m'): r['n']
            for r in qs.annotate(m=TruncMonth(champ)).values('m').annotate(n=Count('id'))}


def construire(params, user):
    debut, fin = params.date_debut, params.date_fin
    documents = EmployeeDocument.objects.filter(is_active=True)
    fichiers = EmployeeDocumentFile.objects.filter(is_active=True, document__is_active=True)
    uploads = documents.filter(uploaded_at__date__range=[debut, fin])
    suppressions = AuditLog.objects.filter(action=AuditLog.Action.DELETE_DOC, timestamp__date__range=[debut, fin])
    volume = fichiers.aggregate(t=Sum('file_size'))['t'] or 0

    u_mois, s_mois = _par_mois(uploads, 'uploaded_at'), _par_mois(suppressions, 'timestamp')
    evolution = [{'mois': m, 'uploads': u_mois.get(m, 0), 'suppressions': s_mois.get(m, 0)}
                 for m in sorted(set(u_mois) | set(s_mois))]
    par_type = [{'nom': r['type_doc__nom'] or 'Non classé', 'count': r['n']}
                for r in documents.values('type_doc__nom').annotate(n=Count('id')).order_by('-n')]
    par_direction = [{'nom': r['employee__direction__nom'] or 'Non renseigné', 'count': r['n']}
                     for r in documents.values('employee__direction__nom').annotate(n=Count('id')).order_by('-n')]
    par_format = [{'nom': r['mime_type'] or 'Inconnu', 'count': r['n']}
                  for r in fichiers.values('mime_type').annotate(n=Count('id')).order_by('-n')]

    kpis = [
        kpi('documents_actifs', documents.count()),
        kpi('fichiers_actifs', fichiers.count()),
        kpi('volume_stockage', round(volume / MO, 1), 'Mo'),
        kpi('documents_uploades_periode', uploads.count()),
        kpi('documents_supprimes_periode', suppressions.count()),
    ]
    data = {'kpis': kpis, 'evolution': evolution, 'par_type': par_type,
            'par_direction': par_direction, 'par_format': par_format}
    data['exports'] = [
        table_kpis(kpis),
        table('Évolution', ['Mois', 'Uploads', 'Suppressions'],
              [[e['mois'], e['uploads'], e['suppressions']] for e in evolution]),
        table('Par type', ['Type de document', 'Documents'], [[r['nom'], r['count']] for r in par_type]),
        table('Par direction', ['Direction', 'Documents'], [[r['nom'], r['count']] for r in par_direction]),
        table('Par format', ['Format', 'Fichiers'], [[r['nom'], r['count']] for r in par_format]),
    ]
    return data

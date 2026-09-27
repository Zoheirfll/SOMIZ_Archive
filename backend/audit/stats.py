"""
audit/stats.py
Calcul des statistiques de la page /statistiques — logique pure, sans
dépendance HTTP, partagée par StatsDetailView (JSON) et StatsExportView
(xlsx). Voir docs/superpowers/specs/2026-09-02-page-statistiques-design.md.

Les statistiques principales (répartitions, évolution, pyramides,
échéances, complétude) restent toujours organisation-wide, pour
ADMIN comme SUPERADMIN — voir CLAUDE.md section "Page Statistiques".
En complément, "Mon activité" (_mon_activite) donne à CHAQUE compte
ADMIN/SUPERADMIN le décompte détaillé et mutuellement exclusif de ses
propres actions (créations, transferts organisationnels, carrière,
champs personnalisés, photo, archivages, restaurations, suppressions
définitives, contrats, documents, mots de passe — voir
_categorize_emp_log), et un SUPERADMIN reçoit en plus la même
ventilation pour tous les comptes (_activite_par_admin). "Documents
uploadés" compte les documents actuellement présents
(EmployeeDocument.uploaded_by/is_active), pas les entrées du journal
d'audit — un document uploadé puis supprimé ne doit pas gonfler ce
compteur indéfiniment. Les actions en masse (bulk archive/restaurer/
delete, EmployeeBulkDeleteView) n'écrivent qu'une seule ligne d'audit
pour N employés : chaque catégorie compte le vrai nombre d'employés
concernés (details['nb']), pas le nombre de lignes d'audit.
"""
from calendar import monthrange
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.db.models import Count, Max
from django.utils import timezone

from employees.models import Employee, Contrat, TypeDocument, EmployeeDocument
from audit.models import AuditLog

STATUTS_ARCHIVE = ['Inactif', 'Archivé', 'Démobilisé']

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


def _years_between(start, end):
    years = end.year - start.year
    if (end.month, end.day) < (start.month, start.day):
        years -= 1
    return years


def _dossiers_completes_par_mois_completion(types_obligatoires):
    """
    Dossiers complétés groupés par le mois où ils sont RÉELLEMENT devenus
    complets — le mois de l'upload du dernier document obligatoire
    manquant, pas le mois de recrutement de l'employé (ancien
    comportement, trompeur : un employé recruté en avril mais dont le
    dossier n'a été complété qu'hier apparaissait quand même sous
    "2026-04"). Pas d'historique de complétude en base — seule
    approximation possible : parmi les employés ACTUELLEMENT complets,
    la date du plus récent des documents obligatoires encore actifs.
    """
    if not types_obligatoires:
        return {}
    types_ids = [t.id for t in types_obligatoires]

    qs = Employee.objects.filter(statut='actif')
    for t in types_obligatoires:
        qs = qs.filter(documents__type_doc=t, documents__is_active=True)
    complete_ids = list(qs.distinct().values_list('id', flat=True))
    if not complete_ids:
        return {}

    rows = EmployeeDocument.objects.filter(
        employee_id__in=complete_ids, type_doc_id__in=types_ids, is_active=True,
    ).values('employee_id').annotate(derniere=Max('uploaded_at'))

    par_mois = {}
    for row in rows:
        if row['derniere'] is None:
            continue
        cle = timezone.localtime(row['derniere']).strftime('%Y-%m')
        par_mois[cle] = par_mois.get(cle, 0) + 1
    return par_mois


def _evolution_mensuelle(date_debut, date_fin):
    months = []
    cursor = date_debut.replace(day=1)
    end_marker = date_fin.replace(day=1)
    while cursor <= end_marker:
        months.append(cursor)
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    types_obligatoires = list(TypeDocument.objects.filter(
        obligatoire=True, is_active=True, sous_types__isnull=True
    ))
    par_mois_completion = _dossiers_completes_par_mois_completion(types_obligatoires)

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
        result.append({
            'mois': m.strftime('%Y-%m'),
            'recrutements': recrutements,
            'archivages': archivages,
            'dossiers_completes': par_mois_completion.get(m.strftime('%Y-%m'), 0),
        })
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


_ORG_TRANSFER_KEYS = {'direction', 'departement', 'service', 'cellule', 'section'}
_CARRIERE_TRANSFER_KEYS = {'poste', 'categorie'}


def _categorize_emp_log(action, details):
    """
    Classe une entrée AuditLog (action CREATE_EMP/MODIFY_EMP/DELETE_EMP)
    dans une catégorie exclusive + son "poids" (nombre d'employés/contrats
    réellement concernés par CETTE ligne). Nécessaire car MODIFY_EMP/
    DELETE_EMP sont réutilisés pour des choses très différentes selon le
    contenu de `details` (transfert organisationnel, carrière, archivage,
    champs personnalisés, photo, contrats, mots de passe — voir
    employees/views.py et accounts/views.py) — et une action en masse
    (bulk archive/restaurer/delete, EmployeeBulkDeleteView) n'écrit qu'UNE
    SEULE ligne d'audit pour N employés (`details['nb']`) : un simple
    `.count()` sur ces lignes sous-comptait silencieusement ces
    opérations en masse.
    """
    details = details or {}
    nb = details.get('nb', 1)

    if action == AuditLog.Action.CREATE_EMP:
        return 'employes_crees', 1

    if action == AuditLog.Action.MODIFY_EMP:
        transfer = details.get('transfer')
        if transfer:
            if 'statut' in transfer:
                vers = (transfer['statut'] or {}).get('vers')
                if vers in STATUTS_ARCHIVE:
                    return 'employes_archives', 1
                if vers == 'actif':
                    return 'employes_restaures', 1
                return 'employes_autres', 1
            keys = set(transfer.keys())
            if keys & _ORG_TRANSFER_KEYS:
                return 'employes_transferts', 1
            if keys & _CARRIERE_TRANSFER_KEYS:
                return 'employes_carriere', 1
            # Champ isolé (ex. suggestion OCR appliquée sur un champ
            # système/personnalisé) — voir ocr/views.py.
            return 'employes_champs', 1
        sous_action = details.get('action')
        if 'champs_personnalises' in details:
            return 'employes_champs', 1
        if sous_action and sous_action.startswith('historique_'):
            return 'employes_carriere', 1
        if sous_action in ('upload_photo', 'delete_photo'):
            return 'employes_photo', 1
        if sous_action in ('create_contrat', 'modify_contrat'):
            return 'contrats_crees_modifies', 1
        if sous_action == 'restaurer':
            return 'employes_restaures', nb
        if sous_action in ('change_password', 'admin_reset_password'):
            return 'comptes_mdp', 1
        return 'employes_autres', 1

    if action == AuditLog.Action.DELETE_EMP:
        sous_action = details.get('action')
        if sous_action == 'delete_contrat':
            return 'contrats_supprimes', 1
        if sous_action == 'archive':
            return 'employes_archives', nb
        if sous_action == 'delete':
            return 'employes_supprimes', nb
        # Suppression définitive d'un employé unique (perform_destroy) —
        # details contient 'matricule'/'nom', pas de clé 'action'.
        return 'employes_supprimes', 1

    return None, 0


_ACTIVITY_KEYS = [
    'employes_crees', 'employes_transferts', 'employes_carriere', 'employes_champs',
    'employes_photo', 'employes_archives', 'employes_restaures', 'employes_supprimes',
    'employes_autres', 'contrats_crees_modifies', 'contrats_supprimes',
    'documents_uploades', 'documents_supprimes', 'documents_modifies', 'comptes_mdp',
]


def _activity_counts(user, date_debut, date_fin):
    """
    Décompte détaillé des actions d'un compte (ADMIN ou SUPERADMIN) sur la
    période — "Mon activité" / une ligne de "Activité par administrateur".
    Catégories mutuellement exclusives (voir _categorize_emp_log) : un
    archivage n'est plus compté aussi dans "employés modifiés", et les
    actions en masse comptent leur vrai nombre d'employés (details['nb']),
    pas 1 ligne = 1 employé.
    """
    counts = {k: 0 for k in _ACTIVITY_KEYS}

    emp_logs = AuditLog.objects.filter(
        user=user, timestamp__date__range=[date_debut, date_fin],
        action__in=[AuditLog.Action.CREATE_EMP, AuditLog.Action.MODIFY_EMP, AuditLog.Action.DELETE_EMP],
    ).values_list('action', 'details')
    for action, details in emp_logs:
        key, weight = _categorize_emp_log(action, details)
        if key:
            counts[key] += weight

    base = AuditLog.objects.filter(user=user, timestamp__date__range=[date_debut, date_fin])
    counts['documents_supprimes'] = base.filter(action=AuditLog.Action.DELETE_DOC).count()
    counts['documents_modifies'] = base.filter(action=AuditLog.Action.MODIFY_DOC).count()

    # "Documents uploadés" compte les documents ENCORE PRÉSENTS
    # (EmployeeDocument.uploaded_by, is_active=True), pas les entrées
    # UPLOAD du journal d'audit — celles-ci restent même après suppression
    # définitive du document (hard delete, voir CLAUDE.md), ce qui
    # gonflerait ce compteur avec des documents qui n'existent plus.
    # Regroupe upload manuel et "Scanner un dossier" (scan-import) — les
    # deux créent le même type d'objet, pas de distinction utile ici.
    counts['documents_uploades'] = EmployeeDocument.objects.filter(
        uploaded_by=user, is_active=True, uploaded_at__date__range=[date_debut, date_fin],
    ).count()

    return counts


def _mon_activite(user, date_debut, date_fin):
    return _activity_counts(user, date_debut, date_fin)


def _activite_par_admin(date_debut, date_fin):
    User = get_user_model()
    admins = User.objects.filter(role__in=['ADMIN', 'SUPERADMIN'], is_active=True).order_by('nom', 'prenom')
    result = []
    for admin in admins:
        row = {'id': str(admin.id), 'username': admin.username, 'nom_complet': admin.full_name, 'role': admin.role}
        row.update(_activity_counts(admin, date_debut, date_fin))
        result.append(row)
    return result


def build_stats_detail(date_debut, date_fin, requesting_user=None):
    """
    requesting_user : si fourni, la réponse inclut 'mon_activite' (décompte
    des actions de ce compte) et, s'il s'agit d'un SUPERADMIN,
    'activite_par_admin' (même décompte pour tous les comptes ADMIN/
    SUPERADMIN). Les statistiques principales restent toujours
    organisation-wide, indépendamment de requesting_user.
    """
    if date_debut is None or date_fin is None:
        date_debut, date_fin = _default_periode()

    data = {
        'periode': {'debut': date_debut.isoformat(), 'fin': date_fin.isoformat()},
        'indicateurs': _indicateurs(date_debut, date_fin),
        'repartition_direction': _repartition_direction(),
        'repartition_departement': _repartition_departement(),
        'repartition_categorie': _repartition_simple('categorie__nom'),
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
        'repartition_fonction': _repartition_simple('poste__nom'),
        'evolution_mensuelle': _evolution_mensuelle(date_debut, date_fin),
        'pyramide_age': _pyramide_age(),
        'pyramide_anciennete': _pyramide_anciennete(),
        'contrats_echeance': _contrats_echeance(),
        'completude_par_direction': _completude_par_direction(),
        'completude_par_departement': _completude_par_departement(),
    }

    if requesting_user is not None:
        data['mon_activite'] = _mon_activite(requesting_user, date_debut, date_fin)
        if getattr(requesting_user, 'is_superadmin', False):
            data['activite_par_admin'] = _activite_par_admin(date_debut, date_fin)

    return data

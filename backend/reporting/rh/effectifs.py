# backend/reporting/rh/effectifs.py
from django.db.models import Q

from audit.stats import _repartition_departement, _repartition_direction, _repartition_simple
from employees.models import Cellule, Departement, Direction, Employee, Pole, Poste, Section, Service
from reporting.rh.commun import STATUTS_SORTIE, actifs, kpi, table, table_kpis, taux

MODELES_UNITE = [
    ('Direction', Direction), ('Pôle', Pole), ('Département', Departement),
    ('Service', Service), ('Cellule', Cellule), ('Section', Section),
]


def responsables_actifs_ids():
    """Employés actifs responsables d'au moins une unité active (comptés une fois)."""
    ids = set()
    for _type, modele in MODELES_UNITE:
        ids.update(modele.objects.filter(
            is_active=True, responsable__statut=Employee.Statut.ACTIF,
        ).values_list('responsable_id', flat=True))
    return ids


def unites_sans_responsable():
    lignes = []
    for type_unite, modele in MODELES_UNITE:
        sans = modele.objects.filter(is_active=True).filter(
            Q(responsable__isnull=True) | ~Q(responsable__statut=Employee.Statut.ACTIF)
        ).order_by('nom').values('id', 'nom')
        lignes.extend({'type': type_unite, 'id': str(u['id']), 'nom': u['nom']} for u in sans)
    return lignes


def construire(params, user):
    qs = actifs()
    effectif = qs.count()
    avec_type = qs.exclude(type_contrat__isnull=True)
    nb_cdi = avec_type.filter(type_contrat__duree_indeterminee=True).count()
    sans_responsable = unites_sans_responsable()
    postes_vides = list(
        Poste.objects.filter(is_active=True)
        # exclude(poste__isnull=True) : un NULL dans un NOT IN viderait le résultat.
        .exclude(id__in=qs.exclude(poste__isnull=True).values('poste_id'))
        .order_by('nom').values_list('nom', flat=True)
    )
    kpis = [
        kpi('effectif_actif', effectif),
        kpi('effectif_sorti', Employee.objects.filter(statut__in=STATUTS_SORTIE).count()),
        kpi('part_cdi', taux(nb_cdi, avec_type.count()), '%'),
        kpi('taux_encadrement', taux(len(responsables_actifs_ids()), effectif), '%'),
        kpi('unites_sans_responsable', len(sans_responsable)),
    ]
    data = {
        'kpis': kpis,
        'repartition_direction': _repartition_direction(),
        'repartition_departement': _repartition_departement(),
        'repartition_categorie': _repartition_simple('categorie__nom'),
        'repartition_type_contrat': _repartition_simple('type_contrat__nom'),
        'repartition_fonction': _repartition_simple('poste__nom'),
        'unites_sans_responsable': sans_responsable,
        'postes_sans_titulaire': postes_vides,
    }
    data['exports'] = [
        table_kpis(kpis),
        table('Par direction', ['Direction', 'Effectif'],
              [[r['nom'], r['count']] for r in data['repartition_direction']]),
        table('Par département', ['Direction', 'Département', 'Effectif'],
              [[r['direction_nom'], r['nom'], r['count']] for r in data['repartition_departement']]),
        table('Profils', ['Axe', 'Valeur', 'Effectif'],
              [['Catégorie', r['nom'], r['count']] for r in data['repartition_categorie']]
              + [['Type de contrat', r['nom'], r['count']] for r in data['repartition_type_contrat']]
              + [['Fonction', r['nom'], r['count']] for r in data['repartition_fonction']]),
        table('Unités sans responsable', ['Type', 'Unité'], [[u['type'], u['nom']] for u in sans_responsable]),
        table('Postes sans titulaire', ['Fonction'], [[p] for p in postes_vides]),
    ]
    return data

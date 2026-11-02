# backend/reporting/rh/activite.py
"""« Mon activité » et « Activité par administrateur » de l'ancienne page
/statistiques, reprises telles quelles (audit/stats.py)."""
from audit.stats import _activite_par_admin, _mon_activite
from reporting.rh.commun import kpi, table, table_kpis

COLONNES = [
    ('employes_crees', 'Employés créés'), ('employes_transferts', 'Transferts'),
    ('employes_carriere', 'Carrière'), ('employes_champs', 'Champs'), ('employes_photo', 'Photos'),
    ('employes_archives', 'Archivages'), ('employes_restaures', 'Restaurations'),
    ('employes_supprimes', 'Suppressions définitives'), ('employes_autres', 'Autres'),
    ('contrats_crees_modifies', 'Contrats créés/modifiés'), ('contrats_supprimes', 'Contrats supprimés'),
    ('documents_uploades', 'Documents uploadés'), ('documents_supprimes', 'Documents supprimés'),
    ('documents_modifies', 'Documents modifiés'), ('comptes_mdp', 'Mots de passe'),
]


def construire(params, user):
    mon_activite = _mon_activite(user, params.date_debut, params.date_fin)
    kpis = [kpi('mes_actions', sum(v for v in mon_activite.values() if isinstance(v, int)))]
    data = {'kpis': kpis, 'mon_activite': mon_activite}
    exports = [table_kpis(kpis), table('Mon activité', ['Action', 'Nombre'],
                                       [[libelle, mon_activite.get(cle, 0)] for cle, libelle in COLONNES])]
    if getattr(user, 'is_superadmin', False):
        data['activite_par_admin'] = _activite_par_admin(params.date_debut, params.date_fin)
        exports.append(table('Par administrateur', ['Compte', *[l for _c, l in COLONNES]],
                             [[a['nom_complet'], *[a.get(c, 0) for c, _l in COLONNES]]
                              for a in data['activite_par_admin']]))
    data['exports'] = exports
    return data

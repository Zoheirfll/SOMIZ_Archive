from audit.models import AuditLog

ACTIONS_REGISTRES = [
    'CREATE_MOUVEMENT', 'MODIFY_MOUVEMENT', 'CANCEL_MOUVEMENT', 'RETOUR_MOUVEMENT',
    'CREATE_RECEPTION', 'MODIFY_RECEPTION', 'CANCEL_RECEPTION', 'CLASSER_RECEPTION',
    'EXPORT_REGISTRE', 'PRINT_REGISTRE',
]


def test_actions_registres_existent_et_tiennent_dans_max_length():
    max_length = AuditLog._meta.get_field('action').max_length
    for nom in ACTIONS_REGISTRES:
        valeur = getattr(AuditLog.Action, nom).value
        assert valeur == nom
        assert len(valeur) <= max_length, f"{nom} dépasse {max_length} caractères"

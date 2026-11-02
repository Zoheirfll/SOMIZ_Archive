# backend/reporting/rh/bilan.py
"""Bilan social : classeur consolidé de toutes les pages Employés sur la
période choisie (export uniquement, `?fmt=xlsx`)."""
from reporting.rh import carriere, contrats, demographie, effectifs, mouvements, parite, qualite, unites

SECTIONS = [
    ('Eff', effectifs), ('Par', parite), ('Dém', demographie), ('Mvt', mouvements),
    ('Ctr', contrats), ('Car', carriere), ('Qua', qualite), ('Uni', unites),
]


def construire(params, user):
    exports = []
    for prefixe, module in SECTIONS:
        for t in module.construire(params, user)['exports']:
            exports.append({**t, 'titre': f"{prefixe} - {t['titre']}"})
    return {'kpis': [], 'sections': [p for p, _m in SECTIONS], 'exports': exports}

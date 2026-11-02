# backend/reporting/objectifs.py
"""Application des objectifs DRH (ObjectifIndicateur) aux KPI d'une réponse :
une seule requête par réponse, quel que soit le nombre de KPI."""
from reporting.models import ObjectifIndicateur


def appliquer_objectifs(data):
    kpis = data.get('kpis') or []
    objectifs = {o.code: o for o in ObjectifIndicateur.objects.filter(code__in=[k['code'] for k in kpis])}
    for k in kpis:
        o = objectifs.get(k['code'])
        if o is None:
            k.update(cible=None, sens=None, ecart=None, atteint=None)
            continue
        valeur = k['valeur']
        ecart = None if valeur is None else round(valeur - o.cible, 1)
        atteint = None if valeur is None else (valeur >= o.cible if o.sens == o.Sens.AU_MOINS else valeur <= o.cible)
        k.update(cible=o.cible, sens=o.sens, ecart=ecart, atteint=atteint)
        if atteint is False and 'faits_marquants' in data:
            seuil = 'au moins' if o.sens == o.Sens.AU_MOINS else 'au plus'
            data['faits_marquants'].append({
                'texte': f"Objectif non atteint — {k['libelle']} : {valeur}{(' ' + k['unite']) if k['unite'] else ''} "
                         f"pour une cible de {seuil} {o.cible}.",
                'lien': '/statistiques/synthese',
            })
    return data

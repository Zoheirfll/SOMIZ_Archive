# backend/reporting/nominatif.py
"""Retrait des données nominatives du reporting pour les comptes non
administrateurs (CONSULTANT portant `acces_statistiques`, 2026-11-01).

Un consultant voit les chiffres de toute l'organisation, mais aucun nom
d'agent : son périmètre (scoping) ne s'applique pas aux agrégats, il ne doit
donc pas non plus servir à contourner ce périmètre par des listes
nominatives. Règle générique (aucune page n'a à y penser) :
- toute liste dont les éléments portent un matricule est vidée ;
- dans les exports, toute table avec une colonne « Matricule » ou « Employé »
  est retirée, et une colonne « Détail » (noms concaténés) est vidée.
"""
CLES_NOMINATIVES = {'matricule', 'employee_matricule'}
COLONNES_NOMINATIVES = {'Matricule', 'Employé'}


def _est_nominative(liste):
    return bool(liste) and all(isinstance(x, dict) and CLES_NOMINATIVES & x.keys() for x in liste)


def _nettoyer(valeur):
    if isinstance(valeur, dict):
        return {k: _nettoyer(v) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [] if _est_nominative(valeur) else [_nettoyer(v) for v in valeur]
    return valeur


def _nettoyer_table(table):
    colonnes = table['colonnes']
    if COLONNES_NOMINATIVES & set(colonnes):
        return None
    if 'Détail' in colonnes:
        i = colonnes.index('Détail')
        table = {**table, 'lignes': [[*l[:i], '', *l[i + 1:]] for l in table['lignes']]}
    return table


def retirer_nominatif(data):
    exports = data.get('exports')
    data = _nettoyer({k: v for k, v in data.items() if k != 'exports'})
    if exports is not None:
        data['exports'] = [t for t in (_nettoyer_table(t) for t in exports) if t is not None]
    data['nominatif_masque'] = True
    return data

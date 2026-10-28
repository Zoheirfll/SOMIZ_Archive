"""Briques communes aux listes de demandes (attestations, consultations, congés).

Ces listes se consultent par période (mois/année de réception) : plusieurs
centaines de demandes par mois, donc pas de coupure à 25, et un tri/filtre
piloté par l'URL — toujours via liste blanche, jamais un nom de champ brut.
"""
from rest_framework.pagination import PageNumberPagination


class DemandePagination(PageNumberPagination):
    page_size = 500
    max_page_size = 500


def appliquer_periode_importance_tri(qs, params, tris, importances):
    """`?annee=2026[&mois=10]` (date de réception), `?importance=haute`,
    `?tri=[-]cle` où `cle` ∈ `tris` (clé d'URL → champ ORM)."""
    annee, mois = params.get('annee', ''), params.get('mois', '')
    if annee.isdigit():
        qs = qs.filter(created_at__year=int(annee))
        if mois.isdigit() and 1 <= int(mois) <= 12:
            qs = qs.filter(created_at__month=int(mois))
    if params.get('importance') in importances:
        qs = qs.filter(importance=params['importance'])
    tri = params.get('tri', '')
    cle = tri.lstrip('-')
    if cle in tris:
        qs = qs.order_by(('-' if tri.startswith('-') else '') + tris[cle], '-id')
    return qs

"""Contrôle d'accès à un fichier livré — appelé à CHAQUE lecture ou
téléchargement. Ni l'interface ni un lien déjà ouvert ne suffisent : c'est
ici que l'expiration est réellement appliquée."""
from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied

from .models import DemandeConsultation

Statut = DemandeConsultation.Statut


class Gone(APIException):
    status_code = status.HTTP_410_GONE
    default_detail = "Ce fichier a été supprimé."
    default_code = 'gone'


def controler_acces(user, demande, fichier, now=None):
    """Lève une exception si `user` ne peut pas lire `fichier`.

    - tiers (ni traiteur, ni demandeur de CETTE demande) → 404 : l'existence
      de la demande n'est pas révélée ;
    - demandeur légitime hors validité → 403 avec un message explicite ;
    - fichier purgé → 410 ;
    - traiteur → toujours autorisé (il vérifie ce qu'il a envoyé).
    """
    now = now or timezone.now()
    if not user.can_manage_consultations:
        if demande.demandeur_id != user.id:
            raise Http404
        if demande.statut == Statut.EN_COURS:
            raise PermissionDenied("Cette demande n'a pas encore été validée.")
        if demande.statut == Statut.REJETEE:
            raise PermissionDenied("Cette demande a été rejetée.")
        if demande.statut == Statut.REVOQUEE:
            raise PermissionDenied("Cette consultation a été révoquée.")
        if not demande.est_active(now):
            quand = timezone.localtime(demande.date_echeance).strftime('%d/%m/%Y à %H:%M')
            raise PermissionDenied(f"Consultation expirée le {quand}.")
    if fichier.supprime_le is not None:
        raise Gone()

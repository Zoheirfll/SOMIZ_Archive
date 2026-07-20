"""
apps/audit/middleware.py
Middleware léger — détecte les comportements suspects (>20 consultations/heure)
Le log détaillé se fait dans les views, pas ici.
"""

import logging
from django.core.cache import cache
from django.core.mail import mail_admins
from django.conf import settings

logger = logging.getLogger('audit')


class AuditMiddleware:
    """
    Surveille le volume de requêtes par utilisateur.
    Déclenche une alerte si un user consulte >20 documents en 1h.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Surveiller les consultations de documents (VIEW uniquement)
        if (
            request.user.is_authenticated and
            '/documents/' in request.path and
            '/view/' in request.path and
            request.method == 'GET'
        ):
            self._check_consultation_rate(request.user)

        return response

    def _check_consultation_rate(self, user):
        """Alerte si >20 consultations en 1 heure."""
        cache_key = f"consult_rate_{user.id}"
        threshold = getattr(settings, 'AUDIT_ALERT_THRESHOLD', 20)

        count = cache.get(cache_key, 0)
        count += 1
        cache.set(cache_key, count, timeout=3600)  # reset toutes les heures

        if count == threshold:
            message = (
                f"[ALERTE AUDIT] {user.username} a consulté {count} documents en 1h. "
                f"IP: {self._get_ip_from_request(user)}"
            )
            logger.warning(message)
            if settings.ADMINS:
                try:
                    mail_admins(
                        subject="SOMIZ — Volume de consultation anormal",
                        message=message,
                        fail_silently=True,
                    )
                except Exception:
                    # Une panne d'envoi d'email ne doit jamais casser la requête HTTP.
                    logger.exception("Échec de l'envoi de l'alerte email d'audit.")

    @staticmethod
    def _get_ip_from_request(user):
        return getattr(user, 'last_login_ip', 'inconnue')

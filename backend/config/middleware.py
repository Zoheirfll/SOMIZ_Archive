"""
config/middleware.py
En-têtes de sécurité globaux non couverts par les settings Django natifs.
"""

PERMISSIONS_POLICY = (
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), "
    "magnetometer=(), gyroscope=(), accelerometer=()"
)


class PermissionsPolicyMiddleware:
    """Désactive explicitement les fonctionnalités navigateur que SOMIZ
    n'utilise jamais — réduit la surface d'attaque si un contenu malveillant
    parvenait un jour à s'exécuter dans la page."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['Permissions-Policy'] = PERMISSIONS_POLICY
        return response

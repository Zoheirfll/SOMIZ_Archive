"""
Authentification JWT via cookie httpOnly.
Lit le token depuis le cookie 'access_token' au lieu du header Authorization.
"""
from rest_framework_simplejwt.authentication import JWTAuthentication


class JWTCookieAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # Essayer d'abord le cookie httpOnly
        raw_token = request.COOKIES.get("access_token")
        if raw_token:
            validated = self.get_validated_token(raw_token)
            return self.get_user(validated), validated
        # Fallback header Authorization (pour les clients API directs)
        return super().authenticate(request)

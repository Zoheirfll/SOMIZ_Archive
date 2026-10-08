"""
Authentification JWT via cookie httpOnly.
Lit le token depuis le cookie 'access_token' au lieu du header Authorization.
"""
from django.middleware.csrf import CsrfViewMiddleware as CSRFCheck
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


def is_token_revoked(user, token):
    """
    Vrai si le JWT (access ou refresh) a été émis avant le dernier changement
    de mot de passe imposé au compte. `iat` est en secondes entières : on compare
    à la seconde tronquée pour ne pas rejeter un jeton émis juste après le
    changement.
    """
    changed_at = getattr(user, 'password_changed_at', None)
    if changed_at is None:
        return False
    iat = token.get('iat')
    return iat is None or iat < int(changed_at.timestamp())


class JWTCookieAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if is_token_revoked(user, validated_token):
            raise exceptions.AuthenticationFailed('Session révoquée.', code='token_revoked')
        return user

    def authenticate(self, request):
        # Essayer d'abord le cookie httpOnly
        raw_token = request.COOKIES.get("access_token")
        if raw_token:
            validated = self.get_validated_token(raw_token)
            # Le cookie est envoyé automatiquement par le navigateur (contrairement
            # au header Authorization) : on exige donc un jeton CSRF en double
            # soumission en défense en profondeur, en plus de SameSite=Lax.
            self.enforce_csrf(request)
            return self.get_user(validated), validated
        # Fallback header Authorization (pour les clients API directs) — pas de
        # cookie envoyé automatiquement par le navigateur, donc pas de risque CSRF.
        return super().authenticate(request)

    def enforce_csrf(self, request):
        check = CSRFCheck(lambda r: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')

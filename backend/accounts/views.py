"""
apps/accounts/views.py
Authentification JWT sécurisée avec blocage anti-brute-force
"""

from django.contrib.auth import get_user_model
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from audit.models import AuditLog

User = get_user_model()


class LoginView(APIView):
    """
    POST /api/auth/login/
    Retourne access + refresh JWT.
    Bloque le compte après 5 tentatives échouées (30 min).
    """
    permission_classes = [AllowAny]
    throttle_scope = 'anon'  # Max 10 tentatives/min depuis même IP

    def post(self, request):
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')

        if not username or not password:
            return Response(
                {'error': 'Identifiant et mot de passe requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Chercher l'utilisateur
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            # Log tentative avec user inconnu
            AuditLog.objects.create(
                username_snapshot=username,
                action=AuditLog.Action.LOGIN_FAIL,
                ip_address=AuditLog._get_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                details={'reason': 'user_not_found'}
            )
            return Response(
                {'error': 'Identifiants incorrects.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Vérifier si le compte est verrouillé
        if user.is_locked():
            remaining = (user.locked_until - timezone.now()).seconds // 60
            AuditLog.log(
                request, AuditLog.Action.LOGIN_FAIL,
                target=user,
                details={'reason': 'account_locked', 'remaining_minutes': remaining}
            )
            return Response(
                {
                    'error': f'Compte verrouillé. Réessayez dans {remaining} minute(s).',
                    'locked': True,
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Vérifier si le compte est actif
        if not user.is_active:
            return Response(
                {'error': 'Compte désactivé. Contactez l\'administrateur.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Vérifier le mot de passe
        if not user.check_password(password):
            user.register_failed_login()
            attempts_left = max(0, 5 - user.failed_login_attempts)
            AuditLog.log(
                request, AuditLog.Action.LOGIN_FAIL,
                target=user,
                details={'reason': 'wrong_password', 'attempts_left': attempts_left}
            )
            return Response(
                {
                    'error': 'Identifiants incorrects.',
                    'attempts_left': attempts_left,
                },
                status=status.HTTP_401_UNAUTHORIZED
            )

        # ✅ Connexion réussie
        user.reset_login_attempts()
        user.last_login_ip = AuditLog._get_ip(request)
        user.save(update_fields=['last_login_ip'])

        refresh = RefreshToken.for_user(user)

        AuditLog.log(request, AuditLog.Action.LOGIN, target=user)

        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': {
                'id': str(user.id),
                'username': user.username,
                'nom': user.nom,
                'prenom': user.prenom,
                'role': user.role,
            }
        })


class LogoutView(APIView):
    """POST /api/auth/logout/ — Blackliste le refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response(
                {'error': 'Refresh token requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            AuditLog.log(request, AuditLog.Action.LOGOUT)
            return Response({'message': 'Déconnexion réussie.'})
        except TokenError:
            return Response(
                {'error': 'Token invalide.'},
                status=status.HTTP_400_BAD_REQUEST
            )


class UserMeView(APIView):
    """GET /api/auth/me/ — Infos de l'utilisateur connecté."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': str(user.id),
            'username': user.username,
            'full_name': user.full_name,
            'role': user.role,
            'is_admin': user.is_admin,
        })

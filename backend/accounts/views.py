"""
apps/accounts/views.py
Authentification JWT sécurisée avec blocage anti-brute-force
"""

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.conf import settings

from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.http import Http404
from accounts.permissions import IsAdmin
from audit.models import AuditLog


def _set_auth_cookies(response, access_token, refresh_token):
    """Pose les deux tokens JWT en cookies httpOnly."""
    secure = getattr(settings, 'JWT_COOKIE_SECURE', False)
    samesite = getattr(settings, 'JWT_COOKIE_SAMESITE', 'Lax')
    response.set_cookie(
        'access_token', str(access_token),
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        httponly=True, secure=secure, samesite=samesite, path='/',
    )
    response.set_cookie(
        'refresh_token', str(refresh_token),
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True, secure=secure, samesite=samesite, path='/api/auth/refresh/',
    )


def _clear_auth_cookies(response):
    response.delete_cookie('access_token', path='/')
    response.delete_cookie('refresh_token', path='/api/auth/refresh/')

User = get_user_model()


from django.contrib.auth.models import update_last_login  # 🔴 AJOUT DE L'IMPORT

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

        # 🔴 CORRECTION ICI : Met à jour le champ last_login en base de données 🪄
        update_last_login(None, user) 

        refresh = RefreshToken.for_user(user)

        AuditLog.log(request, AuditLog.Action.LOGIN, target=user)

        response = Response({
            'user': {
                'id': str(user.id),
                'username': user.username,
                'nom': user.nom,
                'prenom': user.prenom,
                'role': user.role,
            }
        })
        _set_auth_cookies(response, refresh.access_token, refresh)
        return response


class LogoutView(APIView):
    """POST /api/auth/logout/ — Blackliste le refresh token et efface les cookies."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
        try:
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except TokenError:
            pass
        AuditLog.log(request, AuditLog.Action.LOGOUT)
        response = Response({'message': 'Déconnexion réussie.'})
        _clear_auth_cookies(response)
        return response


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

class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/
    L'utilisateur connecté change son propre mot de passe.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ancien = request.data.get('ancien_mot_de_passe')
        nouveau = request.data.get('nouveau_mot_de_passe')
        confirmation = request.data.get('confirmation')

        if not ancien or not nouveau or not confirmation:
            return Response(
                {'error': 'Tous les champs sont obligatoires.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not request.user.check_password(ancien):
            return Response(
                {'error': 'Ancien mot de passe incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if nouveau != confirmation:
            return Response(
                {'error': 'Les nouveaux mots de passe ne correspondent pas.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(nouveau) < 10:
            return Response(
                {'error': 'Le mot de passe doit contenir au moins 10 caractères.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        request.user.set_password(nouveau)
        request.user.save()

        AuditLog.log(request, AuditLog.Action.MODIFY_EMP,
            target=request.user,
            details={'action': 'change_password'}
        )

        return Response({'message': 'Mot de passe modifié avec succès.'})


class AdminResetPasswordView(APIView):
    """
    POST /api/admin-users/{id}/reset-password/
    L'ADMIN réinitialise le mot de passe d'un utilisateur.
    """
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            raise Http404

        nouveau = request.data.get('nouveau_mot_de_passe')
        confirmation = request.data.get('confirmation')

        if not nouveau or not confirmation:
            return Response(
                {'error': 'Tous les champs sont obligatoires.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if nouveau != confirmation:
            return Response(
                {'error': 'Les mots de passe ne correspondent pas.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(nouveau) < 10:
            return Response(
                {'error': 'Minimum 10 caractères.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(nouveau)
        user.failed_login_attempts = 0
        user.locked_until = None
        user.save()

        AuditLog.log(request, AuditLog.Action.MODIFY_EMP,
            target=user,
            details={'action': 'admin_reset_password', 'target_user': user.username}
        )

        return Response({'message': f'Mot de passe de {user.username} réinitialisé.'})


class CookieTokenRefreshView(APIView):
    """
    POST /api/auth/refresh/
    Renouvelle l'access token depuis le cookie refresh_token httpOnly.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({'error': 'Session expirée.'}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            token = RefreshToken(refresh_token)
            response = Response({'detail': 'Token renouvelé.'})
            _set_auth_cookies(response, token.access_token, token)
            return response
        except TokenError:
            response = Response({'error': 'Session invalide.'}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response
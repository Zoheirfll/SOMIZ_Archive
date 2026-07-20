"""
apps/accounts/backends.py
Backend d'authentification Django réutilisant le verrouillage anti-brute-force
de l'app (5 tentatives → 30 min) pour TOUT point d'entrée qui passe par
django.contrib.auth.authenticate() — en particulier /django-admin/login/,
qui sans cela n'aurait aucune protection contre le bruteforce.
"""
from django.contrib.auth.backends import ModelBackend


class LockoutModelBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        UserModel = self.get_user_model()
        try:
            user = UserModel._default_manager.get_by_natural_key(username)
        except UserModel.DoesNotExist:
            # Hashage factice pour égaliser le temps de réponse avec le cas
            # "mauvais mot de passe" (protection contre le timing attack
            # d'énumération d'utilisateurs — cf. Django #20760).
            UserModel().set_password(password)
            return None

        if user.is_locked():
            return None

        if not self.user_can_authenticate(user):
            return None

        if user.check_password(password):
            user.reset_login_attempts()
            return user

        user.register_failed_login()
        return None

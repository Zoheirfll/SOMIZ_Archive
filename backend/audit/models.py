"""
apps/audit/models.py
Journal d'audit complet — conformité RGPD / loi 18-07 algérienne
Chaque consultation, upload, modification, suppression est tracée.
"""

from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """
    Trace TOUTES les actions sensibles sur les dossiers.
    Conservé 5 ans minimum (ANPDP).
    Table append-only — pas de UPDATE ni DELETE autorisé.
    """

    class Action(models.TextChoices):
        VIEW = 'VIEW', 'Consultation document'
        UPLOAD = 'UPLOAD', 'Upload document'
        DELETE_DOC = 'DELETE_DOC', 'Suppression document'
        MODIFY_DOC = 'MODIFY_DOC', 'Modification métadonnées document'
        CREATE_EMP = 'CREATE_EMP', 'Création employé'
        MODIFY_EMP = 'MODIFY_EMP', 'Modification employé'
        DELETE_EMP = 'DELETE_EMP', 'Suppression employé'
        LOGIN = 'LOGIN', 'Connexion'
        LOGOUT = 'LOGOUT', 'Déconnexion'
        LOGIN_FAIL = 'LOGIN_FAIL', 'Tentative de connexion échouée'
        EXPORT = 'EXPORT', 'Export / Rapport'
        CREATE_USER = 'CREATE_USER', 'Création utilisateur'
        MODIFY_USER = 'MODIFY_USER', 'Modification utilisateur (rôle/statut)'
        DELETE_USER = 'DELETE_USER', 'Suppression utilisateur'
        CONSENT = 'CONSENT', 'Consentement Loi 18-07 accepté'

    # Pas de UUIDField ici — BIGSERIAL plus rapide pour les logs
    # (table peut atteindre des millions de lignes)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,  # null si tentative login échouée (user inconnu)
        on_delete=models.SET_NULL,
        related_name='audit_logs',
        verbose_name="Utilisateur"
    )
    username_snapshot = models.CharField(
        max_length=50, blank=True,
        verbose_name="Login au moment de l'action",
        help_text="Conservé même si le compte est supprimé"
    )
    action = models.CharField(max_length=20, choices=Action.choices, verbose_name="Action")

    # Objet concerné (employé ou document)
    target_model = models.CharField(max_length=50, blank=True, verbose_name="Modèle cible")
    target_id = models.CharField(max_length=36, blank=True, verbose_name="ID cible")
    target_label = models.CharField(
        max_length=255, blank=True,
        verbose_name="Libellé cible",
        help_text="Ex: 'EMP-001 — Jean Dupont'"
    )

    # Contexte réseau
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="Adresse IP")
    user_agent = models.TextField(blank=True, verbose_name="User-Agent")

    # Horodatage
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True, verbose_name="Horodatage")

    # Données supplémentaires (diff avant/après pour MODIFY, etc.)
    details = models.JSONField(default=dict, blank=True, verbose_name="Détails JSON")

    class Meta:
        db_table = 'audit_logs'
        verbose_name = "Log d'audit"
        verbose_name_plural = "Logs d'audit"
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp'], name='idx_audit_user_ts'),
            models.Index(fields=['action', 'timestamp'], name='idx_audit_action_ts'),
            models.Index(fields=['target_model', 'target_id'], name='idx_audit_target'),
        ]

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.username_snapshot} — {self.action} — {self.target_label}"

    def save(self, *args, **kwargs):
        """Snapshot du username pour pérennité du log."""
        if self.user and not self.username_snapshot:
            self.username_snapshot = self.user.username
        super().save(*args, **kwargs)

    # ─── API utilitaire ───────────────────────────────────────────────────────

    @classmethod
    def log(cls, request, action, target=None, details=None):
        """
        Méthode de convenience pour créer un log depuis n'importe quelle view.

        Usage :
            AuditLog.log(request, AuditLog.Action.VIEW, target=document, details={'page': 1})
        """
        user = request.user if request.user.is_authenticated else None
        username = user.username if user else request.data.get('username', '—')

        target_model = ''
        target_id = ''
        target_label = ''

        if target is not None:
            target_model = target.__class__.__name__
            target_id = str(target.pk)
            target_label = str(target)

        return cls.objects.create(
            user=user,
            username_snapshot=username,
            action=action,
            target_model=target_model,
            target_id=target_id,
            target_label=target_label,
            ip_address=cls._get_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            details=details or {},
        )

    @staticmethod
    def _get_ip(request):
        """Récupère l'IP réelle même derrière Nginx."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

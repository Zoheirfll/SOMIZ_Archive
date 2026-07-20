from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from accounts.models import User
from audit.models import AuditLog

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'nom', 'prenom', 'role', 'is_active', 'last_login']
    list_filter = ['role', 'is_active']
    search_fields = ['username', 'nom', 'prenom']
    ordering = ['nom']

    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Informations', {'fields': ('nom', 'prenom', 'role')}),
        ('Sécurité', {'fields': ('failed_login_attempts', 'locked_until', 'last_login_ip')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'nom', 'prenom', 'role', 'password1', 'password2'),
        }),
    )

    # Les mutations faites depuis /django-admin/ contournent nos vues DRF
    # (accounts/admin_views.py) : on les trace ici pour ne pas casser la
    # traçabilité RGPD/loi 18-07 quand un superuser passe par cette porte.
    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        action = AuditLog.Action.MODIFY_USER if change else AuditLog.Action.CREATE_USER
        AuditLog.log(request, action, target=obj, details={'via': 'django-admin'})

    def delete_model(self, request, obj):
        AuditLog.log(
            request, AuditLog.Action.DELETE_USER, target=obj,
            details={'via': 'django-admin', 'username': obj.username},
        )
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            AuditLog.log(
                request, AuditLog.Action.DELETE_USER, target=obj,
                details={'via': 'django-admin', 'username': obj.username, 'bulk': True},
            )
        super().delete_queryset(request, queryset)
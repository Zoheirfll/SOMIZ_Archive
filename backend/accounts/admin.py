from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from accounts.models import User

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
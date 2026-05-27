from django.contrib import admin
from audit.models import AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['timestamp', 'username_snapshot', 'action', 'target_label', 'ip_address']
    list_filter = ['action']
    search_fields = ['username_snapshot', 'target_label']
    readonly_fields = ['user', 'username_snapshot', 'action', 'target_model',
                      'target_id', 'target_label', 'ip_address', 'user_agent',
                      'timestamp', 'details']
    ordering = ['-timestamp']

    def has_add_permission(self, request):
        return False  # Les logs ne se créent pas manuellement

    def has_delete_permission(self, request, obj=None):
        return False  # Les logs ne se suppriment pas
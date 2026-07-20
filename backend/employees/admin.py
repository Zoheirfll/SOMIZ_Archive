from django.contrib import admin
from employees.models import Employee, EmployeeDocument, EmployeeDocumentFile
from audit.models import AuditLog


class AuditedModelAdminMixin:
    """
    Trace dans AuditLog toute mutation faite depuis /django-admin/, qui
    contourne les vues DRF (employees/views.py) où ce logging est déjà fait.
    """
    audit_create_action = None
    audit_modify_action = None
    audit_delete_action = None

    def _label(self, obj):
        return str(obj)

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        action = self.audit_modify_action if change else self.audit_create_action
        AuditLog.log(request, action, target=obj, details={'via': 'django-admin'})

    def delete_model(self, request, obj):
        AuditLog.log(
            request, self.audit_delete_action, target=obj,
            details={'via': 'django-admin', 'label': self._label(obj)},
        )
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            AuditLog.log(
                request, self.audit_delete_action, target=obj,
                details={'via': 'django-admin', 'label': self._label(obj), 'bulk': True},
            )
        super().delete_queryset(request, queryset)


@admin.register(Employee)
class EmployeeAdmin(AuditedModelAdminMixin, admin.ModelAdmin):
    list_display = ['matricule', 'nom', 'prenom', 'departement', 'poste', 'statut', 'dossier_complet']
    list_filter = ['statut', 'departement']
    search_fields = ['matricule', 'nom', 'prenom']
    ordering = ['nom']
    readonly_fields = ['id', 'created_at', 'updated_at']

    audit_create_action = AuditLog.Action.CREATE_EMP
    audit_modify_action = AuditLog.Action.MODIFY_EMP
    audit_delete_action = AuditLog.Action.DELETE_EMP

@admin.register(EmployeeDocument)
class EmployeeDocumentAdmin(AuditedModelAdminMixin, admin.ModelAdmin):
    list_display = ['employee', 'type_doc', 'version', 'is_active', 'uploaded_at', 'uploaded_by']
    list_filter = ['type_doc', 'is_active']
    search_fields = ['employee__matricule', 'employee__nom']
    readonly_fields = ['id', 'uploaded_at', 'version']

    audit_create_action = AuditLog.Action.UPLOAD
    audit_modify_action = AuditLog.Action.MODIFY_DOC
    audit_delete_action = AuditLog.Action.DELETE_DOC

@admin.register(EmployeeDocumentFile)
class EmployeeDocumentFileAdmin(AuditedModelAdminMixin, admin.ModelAdmin):
    list_display = ['document', 'file_name', 'ordre', 'file_size_kb', 'is_active', 'uploaded_at']
    list_filter = ['is_active']
    search_fields = ['document__employee__matricule', 'file_name']
    readonly_fields = ['id', 'uploaded_at', 'file_size', 'mime_type']

    audit_create_action = AuditLog.Action.UPLOAD
    audit_modify_action = AuditLog.Action.MODIFY_DOC
    audit_delete_action = AuditLog.Action.DELETE_DOC

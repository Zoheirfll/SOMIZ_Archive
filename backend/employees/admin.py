from django.contrib import admin
from employees.models import Employee, EmployeeDocument, EmployeeDocumentFile

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['matricule', 'nom', 'prenom', 'departement', 'poste', 'statut', 'dossier_complet']
    list_filter = ['statut', 'departement']
    search_fields = ['matricule', 'nom', 'prenom']
    ordering = ['nom']
    readonly_fields = ['id', 'created_at', 'updated_at']

@admin.register(EmployeeDocument)
class EmployeeDocumentAdmin(admin.ModelAdmin):
    list_display = ['employee', 'type_doc', 'version', 'is_active', 'uploaded_at', 'uploaded_by']
    list_filter = ['type_doc', 'is_active']
    search_fields = ['employee__matricule', 'employee__nom']
    readonly_fields = ['id', 'uploaded_at', 'version']

@admin.register(EmployeeDocumentFile)
class EmployeeDocumentFileAdmin(admin.ModelAdmin):
    list_display = ['document', 'file_name', 'ordre', 'file_size_kb', 'is_active', 'uploaded_at']
    list_filter = ['is_active']
    search_fields = ['document__employee__matricule', 'file_name']
    readonly_fields = ['id', 'uploaded_at', 'file_size', 'mime_type']
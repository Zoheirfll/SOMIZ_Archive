from django.contrib import admin
from employees.models import Employee, EmployeeDocument

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['matricule', 'nom', 'prenom', 'departement', 'poste', 'statut', 'dossier_complet']
    list_filter = ['statut', 'departement']
    search_fields = ['matricule', 'nom', 'prenom']
    ordering = ['nom']
    readonly_fields = ['id', 'created_at', 'updated_at']

@admin.register(EmployeeDocument)
class EmployeeDocumentAdmin(admin.ModelAdmin):
    list_display = ['employee', 'type_document', 'version', 'is_active', 'uploaded_at', 'uploaded_by']
    list_filter = ['type_document', 'is_active']
    search_fields = ['employee__matricule', 'employee__nom']
    readonly_fields = ['id', 'uploaded_at', 'version']
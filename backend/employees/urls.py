# apps/employees/urls.py
from django.urls import path
from employees.views import (
    EmployeeListCreateView,
    EmployeeDetailView,
    DocumentListUploadView,
    DocumentViewerView,
    FileViewerView, 
    FileDeleteView,
    DocumentDeleteView,
    employee_search,
    EmployeeBulkDeleteView,
)
from employees.import_views import EmployeeImportView, EmployeeImportTemplateView

urlpatterns = [
    # Employés
    path('employees/', EmployeeListCreateView.as_view(), name='employee-list'),
    path('employees/search/', employee_search, name='employee-search'),
    path('employees/<uuid:pk>/', EmployeeDetailView.as_view(), name='employee-detail'),
    # Documents (sous-ressource d'un employé)
    path('employees/<uuid:emp_id>/documents/', DocumentListUploadView.as_view(), name='doc-list-upload'),
    # Viewer inline sécurisé + suppression
    path('documents/<uuid:doc_id>/view/', DocumentViewerView.as_view(), name='doc-view'),
    path('documents/<uuid:doc_id>/', DocumentDeleteView.as_view(), name='doc-delete'),
    
    # Nouveaux — fichiers individuels
    path('files/<uuid:file_id>/view/', FileViewerView.as_view(), name='file-view'),
    path('files/<uuid:file_id>/', FileDeleteView.as_view(), name='file-delete'),
    
    path('employees/import/', EmployeeImportView.as_view(), name='employee-import'),
path('employees/import/template/', EmployeeImportTemplateView.as_view(), name='employee-import-template'),

path('employees/bulk-delete/', EmployeeBulkDeleteView.as_view(), name='employee-bulk-delete'),

]

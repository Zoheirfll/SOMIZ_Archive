# apps/employees/urls.py
from django.urls import path
from employees.views import (
    EmployeeListCreateView,
    EmployeeDetailView,
    EmployeePhotoView,
    EmployeeChampsPersonnalisesView,
    DocumentListUploadView,
    DocumentViewerView,
    FileViewerView,
    FileDetailView,
    DocumentDeleteView,
    employee_search,
    EmployeeBulkDeleteView,
    ContratListCreateView,
    ContratDetailView,
    ContratDocumentListUploadView,
)
from employees.import_views import EmployeeImportView, EmployeeImportTemplateView

urlpatterns = [
    # Employés
    path('employees/', EmployeeListCreateView.as_view(), name='employee-list'),
    path('employees/search/', employee_search, name='employee-search'),
    path('employees/import/', EmployeeImportView.as_view(), name='employee-import'),
    path('employees/import/template/', EmployeeImportTemplateView.as_view(), name='employee-import-template'),
    path('employees/bulk-delete/', EmployeeBulkDeleteView.as_view(), name='employee-bulk-delete'),
    path('employees/<uuid:pk>/', EmployeeDetailView.as_view(), name='employee-detail'),
    path('employees/<uuid:pk>/photo/', EmployeePhotoView.as_view(), name='employee-photo'),
    path('employees/<uuid:pk>/champs/', EmployeeChampsPersonnalisesView.as_view(), name='employee-champs'),

    # Documents (sous-ressource d'un employé)
    path('employees/<uuid:emp_id>/documents/', DocumentListUploadView.as_view(), name='doc-list-upload'),

    # Contrats (sous-ressource d'un employé)
    path('employees/<uuid:emp_id>/contrats/', ContratListCreateView.as_view(), name='contrat-list'),

    # Contrat — détail + dossier
    path('contrats/<uuid:pk>/', ContratDetailView.as_view(), name='contrat-detail'),
    path('contrats/<uuid:contrat_id>/documents/', ContratDocumentListUploadView.as_view(), name='contrat-doc-list'),

    # Viewer inline sécurisé + suppression
    path('documents/<uuid:doc_id>/view/', DocumentViewerView.as_view(), name='doc-view'),
    path('documents/<uuid:doc_id>/', DocumentDeleteView.as_view(), name='doc-delete'),

    # Fichiers individuels
    path('files/<uuid:file_id>/view/', FileViewerView.as_view(), name='file-view'),
    path('files/<uuid:file_id>/', FileDetailView.as_view(), name='file-detail'),
]

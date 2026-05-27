# apps/employees/urls.py
from django.urls import path
from employees.views import (
    EmployeeListCreateView,
    EmployeeDetailView,
    DocumentListUploadView,
    DocumentViewerView,
    DocumentDeleteView,
    employee_search,
)

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
]

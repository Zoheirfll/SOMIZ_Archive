from django.urls import path
from employees.referentiel_views import (
    DirectionListCreateView, DirectionDetailView,
    DepartementListCreateView, DepartementDetailView,
    ServiceListCreateView, ServiceDetailView,
    PosteListCreateView, PosteDetailView,
    TypeContratListCreateView, TypeContratDetailView,
    CategorieListCreateView, CategorieDetailView,
    TypeDocumentListCreateView, TypeDocumentDetailView,
)

urlpatterns = [
    path('directions/', DirectionListCreateView.as_view()),
    path('directions/<uuid:pk>/', DirectionDetailView.as_view()),
    path('departements/', DepartementListCreateView.as_view()),
    path('departements/<uuid:pk>/', DepartementDetailView.as_view()),
    path('services/', ServiceListCreateView.as_view()),
    path('services/<uuid:pk>/', ServiceDetailView.as_view()),
    path('postes/', PosteListCreateView.as_view()),
    path('postes/<uuid:pk>/', PosteDetailView.as_view()),
    path('types-contrat/', TypeContratListCreateView.as_view()),
    path('types-contrat/<uuid:pk>/', TypeContratDetailView.as_view()),
    path('categories/', CategorieListCreateView.as_view()),
    path('categories/<uuid:pk>/', CategorieDetailView.as_view()),
    path('types-documents/', TypeDocumentListCreateView.as_view()),
    path('types-documents/<uuid:pk>/', TypeDocumentDetailView.as_view()),
]
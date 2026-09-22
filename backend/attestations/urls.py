from django.urls import path

from .views import (
    DemandeAttestationListCreateView, DemandeAttestationDetailView,
    DemandeAttestationStatutView, DemandeAttestationScanView,
    AttestationTemplateConfigView, AttestationApercuView, AttestationStatsView,
)

urlpatterns = [
    path('demandes/', DemandeAttestationListCreateView.as_view()),
    path('demandes/<uuid:pk>/', DemandeAttestationDetailView.as_view()),
    path('demandes/<uuid:pk>/statut/', DemandeAttestationStatutView.as_view()),
    path('demandes/<uuid:pk>/scan/', DemandeAttestationScanView.as_view()),
    path('demandes/<uuid:pk>/apercu/', AttestationApercuView.as_view()),
    path('config/', AttestationTemplateConfigView.as_view()),
    path('stats/', AttestationStatsView.as_view()),
]

from django.urls import path

from .views import (
    DemandeAttestationListCreateView, DemandeAttestationDetailView,
    DemandeAttestationStatutView, DemandeAttestationScanView,
    AttestationTemplateConfigView, AttestationApercuView, AttestationStatsView,
)

urlpatterns = [
    path('demandes/', DemandeAttestationListCreateView.as_view()),
    # <str:ref> : la référence encodée pour l'URL (ex. "00001-26" pour
    # "00001/26") — voir ReferenceLookupMixin dans views.py, pas un pk.
    path('demandes/<str:ref>/', DemandeAttestationDetailView.as_view()),
    path('demandes/<str:ref>/statut/', DemandeAttestationStatutView.as_view()),
    path('demandes/<str:ref>/scan/', DemandeAttestationScanView.as_view()),
    path('demandes/<str:ref>/apercu/', AttestationApercuView.as_view()),
    path('config/', AttestationTemplateConfigView.as_view()),
    path('stats/', AttestationStatsView.as_view()),
]

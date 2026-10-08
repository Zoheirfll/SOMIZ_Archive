from django.urls import path

from .views import (
    ConsultationFichierImprimerView, ConsultationFichierTelechargerView, ConsultationFichierVoirView,
    ConsultationStatsView,
    DemandeConsultationBulkView,
    DemandeConsultationDetailView, DemandeConsultationListCreateView,
    DemandeConsultationProlongerView, DemandeConsultationRejeterView, DemandeConsultationRevoquerView,
    DemandeConsultationValiderView,
)

urlpatterns = [
    path('demandes/', DemandeConsultationListCreateView.as_view()),
    path('stats/', ConsultationStatsView.as_view()),
    # Doit précéder <str:ref>/ pour ne pas être capturé comme une référence.
    path('demandes/bulk/', DemandeConsultationBulkView.as_view()),
    path('demandes/<str:ref>/', DemandeConsultationDetailView.as_view()),
    path('demandes/<str:ref>/valider/', DemandeConsultationValiderView.as_view()),
    path('demandes/<str:ref>/rejeter/', DemandeConsultationRejeterView.as_view()),
    path('demandes/<str:ref>/revoquer/', DemandeConsultationRevoquerView.as_view()),
    path('demandes/<str:ref>/prolonger/', DemandeConsultationProlongerView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/voir/', ConsultationFichierVoirView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/telecharger/', ConsultationFichierTelechargerView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/imprimer/', ConsultationFichierImprimerView.as_view()),
]

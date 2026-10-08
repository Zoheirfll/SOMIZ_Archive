from django.urls import path

from .views import (
    ConsultationFichierTelechargerView, ConsultationFichierVoirView,
    DemandeConsultationDetailView, DemandeConsultationListCreateView,
    DemandeConsultationRejeterView, DemandeConsultationRevoquerView,
    DemandeConsultationValiderView,
)

urlpatterns = [
    path('demandes/', DemandeConsultationListCreateView.as_view()),
    path('demandes/<str:ref>/', DemandeConsultationDetailView.as_view()),
    path('demandes/<str:ref>/valider/', DemandeConsultationValiderView.as_view()),
    path('demandes/<str:ref>/rejeter/', DemandeConsultationRejeterView.as_view()),
    path('demandes/<str:ref>/revoquer/', DemandeConsultationRevoquerView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/voir/', ConsultationFichierVoirView.as_view()),
    path('demandes/<str:ref>/fichiers/<uuid:fichier_id>/telecharger/', ConsultationFichierTelechargerView.as_view()),
]

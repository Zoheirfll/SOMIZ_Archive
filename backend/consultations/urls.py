from django.urls import path

from .views import (
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
]

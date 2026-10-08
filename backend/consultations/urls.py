from django.urls import path

from .views import DemandeConsultationDetailView, DemandeConsultationListCreateView

urlpatterns = [
    path('demandes/', DemandeConsultationListCreateView.as_view()),
    path('demandes/<str:ref>/', DemandeConsultationDetailView.as_view()),
]

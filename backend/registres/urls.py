from django.urls import path

from .views import (
    MouvementAnnulerView, MouvementDetailView, MouvementRetourView, MouvementsView,
    ReceptionAnnulerView, ReceptionClasserView, ReceptionDetailView, ReceptionsView,
)

urlpatterns = [
    path('mouvements/', MouvementsView.as_view()),
    path('mouvements/<str:ref>/', MouvementDetailView.as_view()),
    path('mouvements/<str:ref>/retour/', MouvementRetourView.as_view()),
    path('mouvements/<str:ref>/annuler/', MouvementAnnulerView.as_view()),
    path('receptions/', ReceptionsView.as_view()),
    path('receptions/<str:ref>/', ReceptionDetailView.as_view()),
    path('receptions/<str:ref>/classer/', ReceptionClasserView.as_view()),
    path('receptions/<str:ref>/annuler/', ReceptionAnnulerView.as_view()),
]

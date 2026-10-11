from django.urls import path

from .views import (
    MouvementAnnulerView, MouvementDetailView, MouvementRetourView, MouvementsView,
)

urlpatterns = [
    path('mouvements/', MouvementsView.as_view()),
    path('mouvements/<str:ref>/', MouvementDetailView.as_view()),
    path('mouvements/<str:ref>/retour/', MouvementRetourView.as_view()),
    path('mouvements/<str:ref>/annuler/', MouvementAnnulerView.as_view()),
]

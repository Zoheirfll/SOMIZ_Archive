# backend/reporting/urls.py
from django.urls import path

from reporting.views import (
    ObjectifDetailView, ObjectifsView, RapportMensuelFichierView, RapportRHView, RapportsMensuelsView,
)

urlpatterns = [
    path('rh/<slug:page>/', RapportRHView.as_view(), name='reporting-rh'),
    path('objectifs/', ObjectifsView.as_view(), name='reporting-objectifs'),
    path('objectifs/<str:code>/', ObjectifDetailView.as_view(), name='reporting-objectif'),
    path('rapports-mensuels/', RapportsMensuelsView.as_view(), name='reporting-rapports'),
    path('rapports-mensuels/<int:pk>/fichier/', RapportMensuelFichierView.as_view(), name='reporting-rapport-fichier'),
]

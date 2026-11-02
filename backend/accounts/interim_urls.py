from django.urls import path

from .interim_views import InterimCandidatsView, InterimDeciderView, InterimListCreateView, InterimTerminerView

urlpatterns = [
    path('', InterimListCreateView.as_view(), name='interim-list'),
    path('candidats/', InterimCandidatsView.as_view(), name='interim-candidats'),
    path('<uuid:pk>/decider/', InterimDeciderView.as_view(), name='interim-decider'),
    path('<uuid:pk>/terminer/', InterimTerminerView.as_view(), name='interim-terminer'),
]

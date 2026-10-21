from django.urls import path

from .views import (
    AnnulerView, CongeApercuView, CongeStatsView, CongeTemplateConfigApercuView,
    CongeTemplateConfigView, DefaultCongeLogoView, DemandeCongeDetailView,
    DemandeCongeListCreateView, InterrompreView,
    MotifCongeDetailView, MotifCongeListCreateView, MotifPieceDetailView, MotifPieceListCreateView,
    ObservationsView, ParametreCongeView, PieceJointeFichierView, PiecesJointesView,
    RecupereeView, RejeterView, ScanView, SoldeCorrectionView, SoldeInitialView, SoldeView,
    ValiderView,
)

urlpatterns = [
    path('demandes/', DemandeCongeListCreateView.as_view()),
    # <str:ref> : référence encodée pour l'URL (« 00001-26 » pour « 00001/26 »).
    path('demandes/<str:ref>/', DemandeCongeDetailView.as_view()),
    path('demandes/<str:ref>/valider/', ValiderView.as_view()),
    path('demandes/<str:ref>/rejeter/', RejeterView.as_view()),
    path('demandes/<str:ref>/recuperee/', RecupereeView.as_view()),
    path('demandes/<str:ref>/annuler/', AnnulerView.as_view()),
    path('demandes/<str:ref>/interrompre/', InterrompreView.as_view()),
    path('demandes/<str:ref>/observations/', ObservationsView.as_view()),
    path('demandes/<str:ref>/scan/', ScanView.as_view()),
    path('demandes/<str:ref>/apercu/', CongeApercuView.as_view()),
    path('demandes/<str:ref>/pieces/', PiecesJointesView.as_view()),
    path('demandes/<str:ref>/pieces/<int:pk>/', PieceJointeFichierView.as_view()),
    path('config/', CongeTemplateConfigView.as_view()),
    path('config/apercu/', CongeTemplateConfigApercuView.as_view()),
    path('config/logo-defaut/', DefaultCongeLogoView.as_view()),
    path('stats/', CongeStatsView.as_view()),
    path('soldes/<str:matricule>/', SoldeView.as_view()),
    path('soldes/<str:matricule>/initial/', SoldeInitialView.as_view()),
    path('soldes/<str:matricule>/correction/', SoldeCorrectionView.as_view()),
    path('motifs/', MotifCongeListCreateView.as_view()),
    path('motifs/<int:pk>/', MotifCongeDetailView.as_view()),
    path('motifs/<int:pk>/pieces/', MotifPieceListCreateView.as_view()),
    path('motifs/pieces/<int:pk>/', MotifPieceDetailView.as_view()),
    path('parametres/', ParametreCongeView.as_view()),
]

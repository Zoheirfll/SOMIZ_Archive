from django.urls import path

from .views import (
    NotificationListView, NotificationCompteurView,
    NotificationMarquerLueView, NotificationToutLireView,
)

urlpatterns = [
    path('', NotificationListView.as_view()),
    path('compteur/', NotificationCompteurView.as_view()),
    path('tout-lire/', NotificationToutLireView.as_view()),
    path('<uuid:pk>/lue/', NotificationMarquerLueView.as_view()),
]

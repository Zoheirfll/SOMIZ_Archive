from django.urls import path
from accounts.admin_views import UserListCreateView, UserUpdateView

urlpatterns = [
    path('', UserListCreateView.as_view(), name='user-list'),
    path('<uuid:pk>/', UserUpdateView.as_view(), name='user-update'),
]
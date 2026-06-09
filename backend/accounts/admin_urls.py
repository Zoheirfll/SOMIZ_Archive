from django.urls import path
from accounts.admin_views import UserListCreateView, UserUpdateView
from accounts.views import AdminResetPasswordView


urlpatterns = [
    path('', UserListCreateView.as_view(), name='user-list'),
    path('<uuid:pk>/', UserUpdateView.as_view(), name='user-update'),
    path('<uuid:pk>/reset-password/', AdminResetPasswordView.as_view(), name='user-reset-password'),
]
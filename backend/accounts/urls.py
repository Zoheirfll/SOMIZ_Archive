from django.urls import path
from accounts.views import LoginView, LogoutView, UserMeView, ChangePasswordView
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', UserMeView.as_view(), name='auth-me'),
     path('change-password/', ChangePasswordView.as_view(), name='change-password'),
]
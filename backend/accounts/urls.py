from django.urls import path
from accounts.views import (
    LoginView, LogoutView, UserMeView, ChangePasswordView,
    CookieTokenRefreshView, ConsentView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', CookieTokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', UserMeView.as_view(), name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('consent/', ConsentView.as_view(), name='auth-consent'),
]
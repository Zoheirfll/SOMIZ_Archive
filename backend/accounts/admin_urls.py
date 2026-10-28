from django.urls import path
from accounts.admin_views import (
    UserListCreateView, UserUpdateView, EmployeeGrantsView,
    PropositionCompteListView, PropositionCompteValiderView, PropositionCompteRefuserView,
)
from accounts.views import AdminResetPasswordView


urlpatterns = [
    path('propositions/', PropositionCompteListView.as_view(), name='proposition-list'),
    path('propositions/<uuid:pk>/valider/', PropositionCompteValiderView.as_view(), name='proposition-valider'),
    path('propositions/<uuid:pk>/refuser/', PropositionCompteRefuserView.as_view(), name='proposition-refuser'),
    path('', UserListCreateView.as_view(), name='user-list'),
    path('<uuid:pk>/', UserUpdateView.as_view(), name='user-update'),
    path('<uuid:pk>/reset-password/', AdminResetPasswordView.as_view(), name='user-reset-password'),
    path('<uuid:pk>/employee-grants/', EmployeeGrantsView.as_view(), name='user-employee-grants'),
]
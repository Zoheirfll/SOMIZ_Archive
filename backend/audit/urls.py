from django.urls import path
from audit.views import AuditLogListView, AdminStatsView

urlpatterns = [
    path('audit-logs/', AuditLogListView.as_view(), name='audit-logs'),
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),
]
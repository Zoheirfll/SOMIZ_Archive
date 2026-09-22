from django.urls import path
from audit.views import AuditLogListView, AuditLogActionsView, AdminStatsView, StatsDetailView, StatsExportView

urlpatterns = [
    path('audit-logs/actions/', AuditLogActionsView.as_view(), name='audit-logs-actions'),
    path('audit-logs/', AuditLogListView.as_view(), name='audit-logs'),
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),
    path('stats-detail/', StatsDetailView.as_view(), name='stats-detail'),
    path('stats-export.xlsx/', StatsExportView.as_view(), name='stats-export'),
]

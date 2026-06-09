from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include([
        path('auth/', include('accounts.urls')),
        path('', include('employees.urls')),
        path('reporting/', include('audit.urls')),
        path('admin-users/', include('accounts.admin_urls')),
        path('ref/', include('employees.referentiel_urls')),
        path('api/ref/import/<str:model>/', __import__('employees.import_views', fromlist=['ReferentielImportView']).ReferentielImportView.as_view()),
        path('api/ref/import/<str:model>/template/', __import__('employees.import_views', fromlist=['ReferentielImportTemplateView']).ReferentielImportTemplateView.as_view()),
    ])),
    # React — doit être en dernier
    re_path(r'^(?!api/|django-admin/|static/).*$', TemplateView.as_view(template_name='index.html')),
]
from django.contrib import admin
from django.urls import path, include
from django.views.generic import TemplateView
from django.conf.urls.static import static
from django.conf import settings

urlpatterns = [
    path('django-admin/', admin.site.urls),
    path('api/', include([
        path('auth/', include('accounts.urls')),
        path('', include('employees.urls')),
        path('reporting/', include('audit.urls')),
        path('admin-users/', include('accounts.admin_urls')),
        path('ref/', include('employees.referentiel_urls')),
        
        
])),
        
]


from django.urls import path
from ocr.views import OcrGlobalSearchView

urlpatterns = [
    path('search/', OcrGlobalSearchView.as_view(), name='ocr-global-search'),
]

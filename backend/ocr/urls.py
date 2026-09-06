from django.urls import path
from ocr.views import OcrSuggestionListView, OcrSuggestionActionView, OcrGlobalSearchView

urlpatterns = [
    path('employees/<str:emp_id>/suggestions/', OcrSuggestionListView.as_view(), name='ocr-suggestions-list'),
    path(
        'suggestions/<int:ocr_result_id>/<int:field_index>/<str:action>/',
        OcrSuggestionActionView.as_view(), name='ocr-suggestion-action'
    ),
    path('search/', OcrGlobalSearchView.as_view(), name='ocr-global-search'),
]

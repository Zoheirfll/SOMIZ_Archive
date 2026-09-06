from rest_framework import serializers


class OcrSuggestionSerializer(serializers.Serializer):
    ocr_result_id = serializers.IntegerField()
    field_index = serializers.IntegerField()
    champ_code = serializers.CharField()
    valeur = serializers.CharField()
    confiance = serializers.FloatField()
    document_id = serializers.UUIDField()
    file_id = serializers.UUIDField()

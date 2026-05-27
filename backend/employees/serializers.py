"""
apps/employees/serializers.py
Serializers Django REST Framework
"""

import magic  # python-magic pour validation MIME réelle
from django.conf import settings
from rest_framework import serializers

from employees.models import Employee, EmployeeDocument


# ─── DOCUMENT ────────────────────────────────────────────────────────────────

class EmployeeDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(
        source='uploaded_by.full_name', read_only=True
    )
    type_document_label = serializers.CharField(
        source='get_type_document_display', read_only=True
    )
    file_size_kb = serializers.FloatField(read_only=True)

    class Meta:
        model = EmployeeDocument
        fields = [
            'id', 'type_document', 'type_document_label',
            'file_name', 'file_size', 'file_size_kb', 'mime_type',
            'version', 'is_active',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at',
            'notes',
        ]
        read_only_fields = [
            'id', 'file_size', 'mime_type', 'version',
            'uploaded_by', 'uploaded_at',
        ]


class DocumentUploadSerializer(serializers.ModelSerializer):
    """Serializer pour l'upload — valide le fichier en profondeur."""

    file = serializers.FileField(write_only=True)

    class Meta:
        model = EmployeeDocument
        fields = ['type_document', 'file', 'notes']

    def validate_file(self, file):
        # 1. Taille max
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if file.size > max_size:
            raise serializers.ValidationError(
                f"Fichier trop lourd. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo."
            )

        # 2. Validation MIME réelle (pas juste l'extension)
        file.seek(0)
        mime = magic.from_buffer(file.read(2048), mime=True)
        file.seek(0)

        if mime not in settings.ALLOWED_MIME_TYPES:
            raise serializers.ValidationError(
                f"Type de fichier non autorisé ({mime}). "
                f"Acceptés : PDF, JPEG, PNG, TIFF."
            )

        return file

    def create(self, validated_data):
        file = validated_data['file']
        validated_data['file_name'] = file.name
        validated_data['file_size'] = file.size

        file.seek(0)
        validated_data['mime_type'] = magic.from_buffer(file.read(2048), mime=True)
        file.seek(0)

        return super().create(validated_data)


# ─── EMPLOYEE ─────────────────────────────────────────────────────────────────

class EmployeeListSerializer(serializers.ModelSerializer):
    dossier_complet = serializers.BooleanField(read_only=True)
    taux_completude = serializers.IntegerField(read_only=True)
    nb_documents = serializers.SerializerMethodField()
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    service_nom = serializers.CharField(source='service.nom', read_only=True)
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'direction_nom', 'departement_nom', 'service_nom',
            'poste_nom', 'type_contrat_nom',
            'statut', 'dossier_complet', 'taux_completude', 'nb_documents',
        ]

    def get_nb_documents(self, obj):
        return obj.documents.filter(is_active=True).count()

class EmployeeDetailSerializer(serializers.ModelSerializer):
    documents = EmployeeDocumentSerializer(
        many=True, read_only=True, source='documents_actifs'
    )
    dossier_complet = serializers.BooleanField(read_only=True)
    taux_completude = serializers.IntegerField(read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.full_name', read_only=True
    )
    documents_manquants = serializers.SerializerMethodField()

    # Noms des référentiels
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    service_nom = serializers.CharField(source='service.nom', read_only=True)
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'statut',
            'direction', 'direction_nom',
            'departement', 'departement_nom',
            'service', 'service_nom',
            'poste', 'poste_nom',
            'type_contrat', 'type_contrat_nom',
            'categorie', 'categorie_nom',
            'dossier_complet', 'taux_completude',
            'documents', 'documents_manquants',
            'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_documents_manquants(self, obj):
        tous = set(EmployeeDocument.TypeDocument.values)
        presents = set(
            obj.documents.filter(is_active=True).values_list('type_document', flat=True)
        )
        manquants = tous - presents
        return [
            {
                'code': t,
                'label': EmployeeDocument.TypeDocument(t).label,
                'required': t in EmployeeDocument.REQUIRED_TYPES,
            }
            for t in sorted(manquants)
        ]

class EmployeeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'statut',
            'direction', 'departement', 'service',
            'poste', 'type_contrat', 'categorie',
        ]
    read_only_fields = ['id']  # ← Et ça
    def validate_matricule(self, value):
        return value.strip().upper()

    def validate_nom(self, value):
        return value.strip().upper()

    def validate_prenom(self, value):
        return value.strip().capitalize()
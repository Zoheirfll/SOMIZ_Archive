"""
apps/employees/serializers.py
Serializers Django REST Framework
"""

import magic  # python-magic pour validation MIME réelle
from django.conf import settings
from rest_framework import serializers


from employees.models import Employee, EmployeeDocument, EmployeeDocumentFile, TypeDocument, Contrat


# ─── DOCUMENT ────────────────────────────────────────────────────────────────

class EmployeeDocumentFileSerializer(serializers.ModelSerializer):
    file_size_kb = serializers.FloatField(read_only=True)

    class Meta:
        model = EmployeeDocumentFile
        fields = [
            'id', 'file_name', 'file_size', 'file_size_kb',
            'mime_type', 'ordre', 'is_active', 'uploaded_at',
        ]
        read_only_fields = ['id', 'file_size', 'mime_type', 'uploaded_at']


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(
        source='uploaded_by.full_name', read_only=True
    )
    type_document = serializers.CharField(source='type_doc.code', read_only=True)
    type_document_label = serializers.CharField(source='type_doc.nom', read_only=True)
    type_doc_id = serializers.UUIDField(source='type_doc.id', read_only=True)
    obligatoire = serializers.BooleanField(source='type_doc.obligatoire', read_only=True)
    file_size_kb = serializers.FloatField(read_only=True)
    nb_fichiers = serializers.IntegerField(read_only=True)
    fichiers = EmployeeDocumentFileSerializer(many=True, read_only=True)

    class Meta:
        model = EmployeeDocument
        fields = [
            'id', 'type_doc', 'type_doc_id',
            'type_document', 'type_document_label', 'obligatoire',
            'nb_fichiers', 'file_size_kb', 'fichiers',
            'version', 'is_active', 'contrat',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at',
            'notes',
        ]
        read_only_fields = ['id', 'version', 'uploaded_by', 'uploaded_at']


# ─── CONTRAT ─────────────────────────────────────────────────────────────────

class ContratListSerializer(serializers.ModelSerializer):
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    nb_documents = serializers.IntegerField(read_only=True)
    employee_id = serializers.UUIDField(source='employee.id', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_nom = serializers.CharField(source='employee.full_name', read_only=True)
    employee_statut = serializers.CharField(source='employee.statut', read_only=True)

    class Meta:
        model = Contrat
        fields = [
            'id', 'numero_contrat',
            'employee_id', 'employee_matricule', 'employee_nom', 'employee_statut',
            'type_contrat', 'type_contrat_nom',
            'date_debut', 'date_fin', 'statut',
            'nb_documents', 'created_at',
        ]


class ContratDetailSerializer(serializers.ModelSerializer):
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    nb_documents = serializers.IntegerField(read_only=True)
    employee_id = serializers.UUIDField(source='employee.id', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_nom = serializers.CharField(source='employee.full_name', read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True, source='documents_actifs')

    class Meta:
        model = Contrat
        fields = [
            'id', 'numero_contrat',
            'employee_id', 'employee_matricule', 'employee_nom',
            'type_contrat', 'type_contrat_nom',
            'date_debut', 'date_fin', 'statut', 'notes',
            'nb_documents', 'documents',
            'created_at', 'updated_at',
        ]


class ContratCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contrat
        fields = [
            'numero_contrat', 'type_contrat',
            'date_debut', 'date_fin', 'statut', 'notes',
        ]

    def validate_numero_contrat(self, value):
        v = value.strip().upper()
        if not v:
            raise serializers.ValidationError("Le N° contrat ne peut pas être vide.")
        return v


class DocumentUploadSerializer(serializers.Serializer):
    """
    Upload de plusieurs fichiers pour un type de document.
    On hérite de Serializer (pas ModelSerializer) car
    on ne mappe pas directement un modèle — on crée
    EmployeeDocument + N EmployeeDocumentFile.
    """
    type_doc = serializers.PrimaryKeyRelatedField(
        queryset=TypeDocument.objects.filter(is_active=True)
    )
    files = serializers.ListField(
        child=serializers.FileField(),
        min_length=1,
        max_length=10,
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_files(self, files):
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        for file in files:
            if file.size > max_size:
                raise serializers.ValidationError(
                    f"{file.name} trop lourd. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo."
                )
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            if mime not in settings.ALLOWED_MIME_TYPES:
                raise serializers.ValidationError(
                    f"{file.name} : type non autorisé ({mime})."
                )
        return files


# ─── EMPLOYEE ─────────────────────────────────────────────────────────────────

class EmployeeListSerializer(serializers.ModelSerializer):
    """
    Champs calculés (nb_documents, numero_contrat_actif, dossier_complet,
    taux_completude) reposent sur des annotations SQL faites dans
    EmployeeListCreateView.get_queryset() — évite le N+1 (une requête par
    ligne) qu'auraient causé des SerializerMethodField/properties par employé.
    """
    dossier_complet = serializers.SerializerMethodField()
    taux_completude = serializers.SerializerMethodField()
    nb_documents = serializers.IntegerField(read_only=True)
    numero_contrat_actif = serializers.CharField(read_only=True)
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    service_nom = serializers.CharField(source='service.nom', read_only=True)
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)

    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'numero_contrat_actif', 'nom', 'prenom',
            'direction_nom', 'departement_nom', 'service_nom',
            'poste_nom', 'type_contrat_nom',
            'statut', 'dossier_complet', 'taux_completude', 'nb_documents',
        ]

    def get_dossier_complet(self, obj):
        total_obligatoires = self.context.get('types_obligatoires_total', 0)
        if total_obligatoires == 0:
            return True
        return obj.nb_types_obligatoires_presents >= total_obligatoires

    def get_taux_completude(self, obj):
        total = self.context.get('types_total', 0)
        if total == 0:
            return 0
        return round(obj.nb_types_presents / total * 100)

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
        tous = TypeDocument.objects.filter(is_active=True)
        presents = set(
            obj.documents.filter(is_active=True).values_list('type_doc_id', flat=True)
        )
        manquants = tous.exclude(id__in=presents)
        return [
            {
            'id': str(t.id),
            'code': t.code,
            'label': t.nom,
            'required': t.obligatoire,
        }
        for t in manquants
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
        read_only_fields = ['id']
    def validate_matricule(self, value):
        return value.strip().upper()

    def validate_nom(self, value):
        return value.strip().upper()

    def validate_prenom(self, value):
        return value.strip().capitalize()
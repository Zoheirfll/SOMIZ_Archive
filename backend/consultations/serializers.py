from django.db import transaction
from rest_framework import serializers

from .models import DemandeConsultation
from .reference import generate_reference


class DemandeConsultationSerializer(serializers.ModelSerializer):
    statut_effectif = serializers.CharField(read_only=True)
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True, default=None)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    type_demande_label = serializers.CharField(source='get_type_demande_display', read_only=True)
    fichiers = serializers.SerializerMethodField()

    class Meta:
        model = DemandeConsultation
        fields = [
            'id', 'reference', 'type_demande', 'type_demande_label', 'description',
            'employee', 'employee_nom', 'employee_matricule',
            'statut', 'statut_effectif', 'motif_rejet',
            'demandeur', 'demandeur_nom', 'traite_par', 'traite_par_nom',
            'created_at', 'date_validation', 'date_echeance', 'date_echeance_initiale',
            'nb_prolongations', 'telechargement_autorise', 'fichiers',
        ]
        read_only_fields = fields

    def get_employee_nom(self, obj):
        return f"{obj.employee.prenom} {obj.employee.nom}" if obj.employee_id else None

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None

    def get_fichiers(self, obj):
        """Métadonnées des fichiers livrés. Le demandeur ne les voit que
        tant que la consultation est ouverte ; un traiteur les voit toujours."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is None or not (user.can_manage_consultations or obj.est_active()):
            return []
        return [
            {
                'id': str(f.id), 'file_name': f.file_name, 'mime_type': f.mime_type,
                'file_size': f.file_size, 'origine': f.origine,
                'purge': f.supprime_le is not None,
            }
            for f in obj.fichiers.all()
        ]


class DemandeConsultationCreateSerializer(serializers.ModelSerializer):
    description = serializers.CharField(max_length=2000)

    class Meta:
        model = DemandeConsultation
        fields = ['id', 'type_demande', 'description', 'employee']
        read_only_fields = ['id']
        extra_kwargs = {'employee': {'required': False, 'allow_null': True}}

    def validate_description(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Décrivez ce que vous souhaitez consulter.")
        return value

    def validate_employee(self, value):
        user = self.context['request'].user
        if value is not None and not user.can_access_employee(value):
            raise serializers.ValidationError("Cet employé n'est pas dans votre périmètre.")
        return value

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)

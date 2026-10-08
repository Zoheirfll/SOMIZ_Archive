from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from .models import DemandeConsultation
from .reference import generate_reference


class DemandeConsultationSerializer(serializers.ModelSerializer):
    statut_effectif = serializers.CharField(read_only=True)
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True, default=None)
    # Champs de vérification affichés sur la fiche (mêmes que les attestations) :
    # le traiteur confirme l'identité/l'affectation sans rouvrir la fiche employé.
    employee_date_naissance = serializers.DateField(source='employee.date_naissance', read_only=True, default=None)
    employee_date_embauche = serializers.DateField(source='employee.date_embauche', read_only=True, default=None)
    employee_direction_nom = serializers.CharField(source='employee.direction.nom', read_only=True, default=None)
    employee_departement_nom = serializers.CharField(source='employee.departement.nom', read_only=True, default=None)
    employee_service_nom = serializers.CharField(source='employee.service.nom', read_only=True, default=None)
    employee_poste_nom = serializers.CharField(source='employee.poste.nom', read_only=True, default=None)
    employee_type_contrat_nom = serializers.CharField(source='employee.type_contrat.nom', read_only=True, default=None)
    employee_categorie_nom = serializers.CharField(source='employee.categorie.nom', read_only=True, default=None)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    demandeur_role = serializers.CharField(source='demandeur.role', read_only=True)
    demandeur_libelle_role = serializers.CharField(source='demandeur.libelle_role', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    type_demande_label = serializers.CharField(source='get_type_demande_display', read_only=True)
    fichiers = serializers.SerializerMethodField()
    duree_accordee_heures = serializers.SerializerMethodField()

    class Meta:
        model = DemandeConsultation
        fields = [
            'id', 'reference', 'type_demande', 'type_demande_label', 'description', 'importance',
            'employee', 'employee_nom', 'employee_matricule',
            'employee_date_naissance', 'employee_date_embauche',
            'employee_direction_nom', 'employee_departement_nom', 'employee_service_nom',
            'employee_poste_nom', 'employee_type_contrat_nom', 'employee_categorie_nom',
            'statut', 'statut_effectif', 'motif_rejet',
            'demandeur', 'demandeur_nom', 'demandeur_role', 'demandeur_libelle_role',
            'traite_par', 'traite_par_nom',
            'created_at', 'date_validation', 'date_echeance', 'date_echeance_initiale',
            'nb_prolongations', 'telechargement_autorise', 'impression_autorisee', 'fichiers',
            'duree_souhaitee_heures', 'telechargement_souhaite', 'impression_souhaitee',
            'duree_accordee_heures',
        ]
        read_only_fields = fields

    def get_duree_accordee_heures(self, obj):
        """Durée initialement accordée à la validation (hors prolongations),
        à comparer à la durée souhaitée par le demandeur."""
        if not (obj.date_validation and obj.date_echeance_initiale):
            return None
        return round((obj.date_echeance_initiale - obj.date_validation).total_seconds() / 3600)

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
        fields = [
            'id', 'type_demande', 'description', 'importance', 'employee',
            'duree_souhaitee_heures', 'telechargement_souhaite', 'impression_souhaitee',
        ]
        read_only_fields = ['id']
        extra_kwargs = {'employee': {'required': False, 'allow_null': True}}

    def validate_duree_souhaitee_heures(self, value):
        mini = settings.CONSULTATION_DUREE_MIN_HEURES
        maxi = settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES
        if not mini <= value <= maxi:
            raise serializers.ValidationError(f"La durée doit être comprise entre {mini} h et {maxi} h.")
        return value

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

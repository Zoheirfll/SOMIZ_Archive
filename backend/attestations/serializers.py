from django.db import transaction
from rest_framework import serializers

from .models import DemandeAttestation, AttestationTemplateConfig
from .reference import generate_reference


class DemandeAttestationSerializer(serializers.ModelSerializer):
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    contrat_numero = serializers.SerializerMethodField()

    class Meta:
        model = DemandeAttestation
        fields = [
            'id', 'reference', 'employee', 'employee_nom', 'employee_matricule',
            'contrat', 'contrat_numero', 'motif', 'commentaire', 'statut',
            'motif_rejet', 'scan_document', 'demandeur', 'demandeur_nom',
            'traite_par', 'traite_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'statut', 'motif_rejet', 'demandeur', 'traite_par',
            'created_at', 'updated_at',
        ]

    def get_employee_nom(self, obj):
        return f"{obj.employee.prenom} {obj.employee.nom}"

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None

    def get_contrat_numero(self, obj):
        return obj.contrat.numero_contrat if obj.contrat_id else None


class DemandeAttestationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeAttestation
        fields = ['employee', 'contrat', 'motif', 'commentaire']

    def validate_employee(self, value):
        user = self.context['request'].user
        if not user.is_admin and not user.can_access_employee(value):
            raise serializers.ValidationError(
                "Cet employé n'est pas dans votre périmètre."
            )
        return value

    def validate(self, attrs):
        contrat = attrs.get('contrat')
        if contrat and contrat.employee_id != attrs['employee'].id:
            raise serializers.ValidationError(
                {'contrat': "Ce contrat n'appartient pas à l'employé sélectionné."}
            )
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)

    def to_representation(self, instance):
        return DemandeAttestationSerializer(instance, context=self.context).data


class DemandeAttestationStatutSerializer(serializers.ModelSerializer):
    ORDRE = [
        DemandeAttestation.Statut.RECUE,
        DemandeAttestation.Statut.IMPRIMEE,
        DemandeAttestation.Statut.SIGNEE,
        DemandeAttestation.Statut.PRETE,
        DemandeAttestation.Statut.RECUPEREE,
    ]

    class Meta:
        model = DemandeAttestation
        fields = ['statut', 'motif_rejet']

    def validate(self, attrs):
        instance = self.instance
        nouveau = attrs.get('statut')
        if nouveau == DemandeAttestation.Statut.REJETEE:
            if instance.statut == DemandeAttestation.Statut.RECUPEREE:
                raise serializers.ValidationError("Une demande déjà récupérée ne peut plus être rejetée.")
            if not attrs.get('motif_rejet', '').strip():
                raise serializers.ValidationError({'motif_rejet': "Motif de rejet requis."})
            return attrs

        try:
            idx_actuel = self.ORDRE.index(instance.statut)
            idx_nouveau = self.ORDRE.index(nouveau)
        except ValueError:
            raise serializers.ValidationError("Transition de statut invalide.")
        if idx_nouveau != idx_actuel + 1:
            suivant = self.ORDRE[idx_actuel + 1] if idx_actuel + 1 < len(self.ORDRE) else None
            raise serializers.ValidationError(
                f"Impossible de passer de '{instance.statut}' à '{nouveau}' — "
                f"le statut suivant attendu est '{suivant}'."
            )
        return attrs


class AttestationTemplateConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttestationTemplateConfig
        fields = [
            'id', 'societe_nom', 'societe_soustitre', 'societe_capital', 'holding',
            'adresse', 'ville', 'telephone', 'fax', 'telex',
            'signataire_titre', 'signataire_nom', 'texte_intro', 'logo',
        ]
        read_only_fields = ['id']

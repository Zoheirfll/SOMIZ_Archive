from rest_framework import serializers

from employees.models import Contrat

from .models import MouvementArchive, ReceptionDocument


def _verifier_ordre_dates(debut, fin, message):
    if debut and fin and fin < debut:
        raise serializers.ValidationError(message)


def _nom_saisisseur(obj):
    return f"{obj.saisi_par.nom} {obj.saisi_par.prenom}".strip() if obj.saisi_par_id else ''


class MouvementArchiveSerializer(serializers.ModelSerializer):
    slug = serializers.SerializerMethodField()
    saisi_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = MouvementArchive
        fields = [
            'id', 'slug', 'reference', 'employee', 'nom_libre', 'beneficiaire', 'fonction',
            'service', 'numero_contrat', 'type_documents', 'nombre_documents',
            'date_depart', 'date_retour', 'observation', 'is_active', 'motif_annulation',
            'saisi_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'is_active', 'motif_annulation', 'created_at', 'updated_at',
        ]

    def get_slug(self, obj):
        return obj.reference.replace('/', '-')

    def get_saisi_par_nom(self, obj):
        return _nom_saisisseur(obj)

    def validate_nombre_documents(self, valeur):
        if valeur < 1:
            raise serializers.ValidationError("Le nombre de documents doit être au moins 1.")
        return valeur

    def validate_employee(self, employee):
        if employee is not None and not self.context['request'].user.can_access_employee(employee):
            raise serializers.ValidationError("Employé hors de votre périmètre.")
        return employee

    def validate(self, data):
        instance = self.instance
        employee = data.get('employee', getattr(instance, 'employee', None))
        nom_libre = data.get('nom_libre', getattr(instance, 'nom_libre', ''))
        if employee is None and not (nom_libre or '').strip():
            raise serializers.ValidationError("Indiquez un employé ou un nom.")
        _verifier_ordre_dates(
            data.get('date_depart', getattr(instance, 'date_depart', None)),
            data.get('date_retour', getattr(instance, 'date_retour', None)),
            "La date de retour ne peut pas précéder la date de départ.",
        )
        # Copie des informations de l'employé lié si le client ne les fournit pas.
        if employee is not None and 'employee' in data:
            contrat = Contrat.objects.filter(employee=employee).order_by('-date_debut').first()
            data.setdefault('fonction', employee.poste.nom if employee.poste_id else '')
            data.setdefault('service', employee.service.nom if employee.service_id else '')
            data.setdefault('numero_contrat', contrat.numero_contrat if contrat else '')
        return data


class ReceptionDocumentSerializer(serializers.ModelSerializer):
    slug = serializers.SerializerMethodField()
    saisi_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = ReceptionDocument
        fields = [
            'id', 'slug', 'reference', 'type_document', 'nombre', 'expediteur',
            'date_reception', 'date_classement', 'observation', 'is_active',
            'motif_annulation', 'saisi_par_nom', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference', 'is_active', 'motif_annulation', 'created_at', 'updated_at',
        ]

    def get_slug(self, obj):
        return obj.reference.replace('/', '-')

    def get_saisi_par_nom(self, obj):
        return _nom_saisisseur(obj)

    def validate_nombre(self, valeur):
        if valeur < 1:
            raise serializers.ValidationError("Le nombre de documents doit être au moins 1.")
        return valeur

    def validate(self, data):
        instance = self.instance
        _verifier_ordre_dates(
            data.get('date_reception', getattr(instance, 'date_reception', None)),
            data.get('date_classement', getattr(instance, 'date_classement', None)),
            "La date de classement ne peut pas précéder la date de réception.",
        )
        return data

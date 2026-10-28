import magic
from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from .models import (
    CongeTemplateConfig, DemandeConge, MotifConge, MotifPiece, MouvementConge, ParametreConge,
    PieceJointeConge, TypeConge,
)
from .reference import generate_reference
from .services import COMPTEURS, CongeError, exercice_courant, exercice_suivant, valider_format_exercice
from .workflow import trouver_chevauchement

REFERENCE_REGEX = r'^\d{5}/\d{2}$'
TAILLE_SCAN_MAX = 20 * 1024 * 1024
TAILLE_PIECE_MAX = 20 * 1024 * 1024


def _verifier_fichier(value, taille_max):
    # MIME réel (python-magic), jamais l'extension ni le Content-Type client.
    tete = value.read(2048)
    value.seek(0)
    mime = magic.from_buffer(tete, mime=True)
    if mime not in settings.ALLOWED_MIME_TYPES:
        raise serializers.ValidationError("Type de fichier non autorisé.")
    if value.size > taille_max:
        raise serializers.ValidationError("Fichier trop volumineux (20 Mo maximum).")
    return mime


def _valider_exercice(value):
    """Format AAAA/AAAA et au plus l'anticipé (exercice suivant)."""
    if not value:
        return ''
    try:
        valider_format_exercice(value)
    except CongeError as exc:
        raise serializers.ValidationError(str(exc))
    if value > exercice_suivant(exercice_courant()):
        raise serializers.ValidationError("Exercice trop lointain : au plus l'exercice anticipé.")
    return value


def _verifier_type_motif(attrs):
    """Cohérence type / motif / durée fixe (commune demandeur et traiteur)."""
    motif, type_conge = attrs.get('motif'), attrs.get('type_conge')
    if motif is None:
        return
    if motif.type_conge != type_conge:
        raise serializers.ValidationError({'motif': "Ce motif ne correspond pas au type de congé choisi."})
    if motif.nb_jours_fixe and attrs.get('nb_jours') != motif.nb_jours_fixe:
        raise serializers.ValidationError(
            {'nb_jours': f"Le motif « {motif.nom} » impose {motif.nb_jours_fixe} jour(s)."}
        )


def _contrat_numero(obj):
    """N° de contrat du titre : celui de la demande, sinon le plus récent de l'employé."""
    if obj.contrat_id:
        return obj.contrat.numero_contrat
    from employees.models import Contrat
    return Contrat.objects.filter(employee_id=obj.employee_id).order_by(
        '-date_debut', '-id',
    ).values_list('numero_contrat', flat=True).first()


class DemandeCongeSerializer(serializers.ModelSerializer):
    employee_nom = serializers.SerializerMethodField()
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_date_embauche = serializers.DateField(source='employee.date_embauche', read_only=True, default=None)
    employee_direction_nom = serializers.CharField(source='employee.direction.nom', read_only=True, default=None)
    employee_departement_nom = serializers.CharField(source='employee.departement.nom', read_only=True, default=None)
    employee_service_nom = serializers.CharField(source='employee.service.nom', read_only=True, default=None)
    employee_poste_nom = serializers.CharField(source='employee.poste.nom', read_only=True, default=None)
    employee_type_contrat_nom = serializers.CharField(source='employee.type_contrat.nom', read_only=True, default=None)
    demandeur_nom = serializers.CharField(source='demandeur.full_name', read_only=True)
    demandeur_role = serializers.CharField(source='demandeur.role', read_only=True)
    demandeur_libelle_role = serializers.CharField(source='demandeur.libelle_role', read_only=True)
    traite_par_nom = serializers.SerializerMethodField()
    contrat_numero = serializers.SerializerMethodField()
    motif_nom = serializers.CharField(source='motif.nom', read_only=True, default=None)
    motif_nb_jours_fixe = serializers.IntegerField(source='motif.nb_jours_fixe', read_only=True, default=None)
    annulee_par_nom = serializers.SerializerMethodField()
    interrompue_par_nom = serializers.SerializerMethodField()
    pieces_jointes = serializers.SerializerMethodField()
    conge_termine = serializers.BooleanField(read_only=True)

    class Meta:
        model = DemandeConge
        fields = [
            'id', 'reference', 'conge_termine', 'employee', 'employee_nom', 'employee_matricule',
            'employee_date_embauche', 'employee_direction_nom', 'employee_departement_nom',
            'employee_service_nom', 'employee_poste_nom', 'employee_type_contrat_nom',
            'contrat', 'contrat_numero',
            'date_depart', 'date_retour', 'nb_jours', 'adresse_conge', 'commentaire', 'importance',
            'statut', 'motif_rejet', 'type_conge', 'motif', 'motif_nom', 'motif_nb_jours_fixe', 'exercice',
            'date_etablissement', 'observations', 'ventilation', 'categorie_exercice', 'pieces_jointes',
            'signataire_nom', 'signataire_titre', 'signataire_interim', 'validateur_nom',
            'motif_annulation', 'annulee_par_nom', 'date_annulation',
            'date_rappel', 'jours_effectifs', 'motif_interruption', 'interrompue_par_nom', 'date_interruption',
            'scan_document', 'demandeur', 'demandeur_nom', 'demandeur_role', 'demandeur_libelle_role',
            'traite_par', 'traite_par_nom',
            'created_at', 'date_prete', 'date_recuperee', 'date_document', 'updated_at',
        ]
        read_only_fields = fields

    def get_employee_nom(self, obj):
        return f"{obj.employee.prenom} {obj.employee.nom}"

    def get_traite_par_nom(self, obj):
        return obj.traite_par.full_name if obj.traite_par_id else None

    def get_annulee_par_nom(self, obj):
        return obj.annulee_par.full_name if obj.annulee_par_id else None

    def get_interrompue_par_nom(self, obj):
        return obj.interrompue_par.full_name if obj.interrompue_par_id else None

    def get_contrat_numero(self, obj):
        return _contrat_numero(obj)

    def get_pieces_jointes(self, obj):
        return PieceJointeSerializer(obj.pieces_jointes.all(), many=True).data


class DemandeCongeCreateSerializer(serializers.ModelSerializer):
    # Type, motif et exercice : proposés par le demandeur, corrigeables par le
    # traiteur. Champs du traiteur (observations, débit, signataire…) absents
    # de `fields` : un demandeur ne peut jamais les fixer, même dans le body.
    motif = serializers.PrimaryKeyRelatedField(queryset=MotifConge.objects.filter(is_active=True))

    class Meta:
        model = DemandeConge
        fields = ['employee', 'contrat', 'type_conge', 'motif', 'exercice', 'date_depart', 'date_retour',
                  'nb_jours', 'adresse_conge', 'commentaire', 'importance']
        extra_kwargs = {
            'adresse_conge': {'allow_blank': False},
            'type_conge': {'required': True, 'allow_blank': False},
            'exercice': {'required': False},
        }

    def validate_exercice(self, value):
        return _valider_exercice(value)

    def validate_employee(self, value):
        user = self.context['request'].user
        if not user.is_admin and not user.can_access_employee(value):
            raise serializers.ValidationError("Cet employé n'est pas dans votre périmètre.")
        return value

    def validate(self, attrs):
        employee = attrs['employee']
        contrat = attrs.get('contrat')
        if contrat and contrat.employee_id != employee.id:
            raise serializers.ValidationError({'contrat': "Ce contrat n'appartient pas à l'employé sélectionné."})
        depart, retour = attrs['date_depart'], attrs['date_retour']
        if retour <= depart:
            raise serializers.ValidationError(
                {'date_retour': "La date de retour doit être postérieure à la date de départ."}
            )
        conflit = trouver_chevauchement(employee, depart, retour)
        if conflit:
            raise serializers.ValidationError(
                {'date_depart': f"Cette période chevauche la demande {conflit.reference} de cet employé."}
            )
        _verifier_type_motif(attrs)
        if attrs['type_conge'] != TypeConge.CP:
            attrs['exercice'] = ''  # l'exercice ne concerne que le congé payé
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            validated_data['reference'] = generate_reference()
            validated_data['demandeur'] = self.context['request'].user
            return super().create(validated_data)

    def to_representation(self, instance):
        return DemandeCongeSerializer(instance, context=self.context).data


class ValiderSerializer(serializers.Serializer):
    """Saisie du traiteur à la validation. `context['demande']` = la demande."""
    type_conge = serializers.ChoiceField(choices=TypeConge.choices)
    motif = serializers.PrimaryKeyRelatedField(queryset=MotifConge.objects.filter(is_active=True))
    date_etablissement = serializers.DateField()
    nb_jours = serializers.IntegerField(min_value=1, max_value=365)
    date_depart = serializers.DateField()
    date_retour = serializers.DateField()
    # Exercice de départ (CP) : vide = le plus ancien ayant des jours.
    exercice = serializers.CharField(required=False, allow_blank=True, default='')
    adresse_conge = serializers.CharField(max_length=255)
    observations = serializers.CharField(required=False, allow_blank=True, default='')
    reference = serializers.RegexField(REFERENCE_REGEX, required=False)
    signataire_nom = serializers.CharField(required=False, max_length=150)
    signataire_titre = serializers.CharField(required=False, allow_blank=True, max_length=150)
    signataire_interim = serializers.BooleanField(required=False)

    def validate_reference(self, value):
        qs = DemandeConge.objects.filter(reference=value)
        demande = self.context.get('demande')
        if demande is not None:
            qs = qs.exclude(pk=demande.pk)
        if qs.exists():
            raise serializers.ValidationError("Cette référence est déjà utilisée.")
        return value

    def validate_exercice(self, value):
        return _valider_exercice(value)

    def validate(self, attrs):
        if attrs['date_retour'] <= attrs['date_depart']:
            raise serializers.ValidationError(
                {'date_retour': "La date de retour doit être postérieure à la date de départ."}
            )
        _verifier_type_motif(attrs)
        if attrs['type_conge'] != TypeConge.CP:
            attrs['exercice'] = ''
        # Signataire : valeurs de la configuration (titulaire ou intérim) sauf saisie explicite.
        if not attrs.get('signataire_nom'):
            config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
            interim = config.signataire_interim and bool(config.signataire_interim_nom.strip())
            attrs['signataire_nom'] = config.signataire_interim_nom.strip() if interim else config.signataire_nom
            attrs['signataire_titre'] = attrs.get('signataire_titre') or config.signataire_titre
            attrs['signataire_interim'] = interim
        else:
            attrs.setdefault('signataire_titre', '')
            attrs.setdefault('signataire_interim', False)
        return attrs


class RejeterSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=1000)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif de rejet requis.")
        return value.strip()


class AnnulerSerializer(serializers.Serializer):
    """Confirmation renforcée : le traiteur doit retaper la référence du titre."""
    motif = serializers.CharField(max_length=1000)
    reference_confirmation = serializers.CharField()

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif d'annulation requis.")
        return value.strip()

    def validate(self, attrs):
        demande = self.context['demande']
        if attrs['reference_confirmation'].strip() != demande.reference:
            raise serializers.ValidationError(
                {'reference_confirmation': "La référence saisie ne correspond pas à ce titre."}
            )
        return attrs


class InterrompreSerializer(serializers.Serializer):
    date_rappel = serializers.DateField()
    motif = serializers.CharField(max_length=1000)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Motif d'interruption requis.")
        return value.strip()


class ObservationsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeConge
        fields = ['observations']

    def validate(self, attrs):
        if self.instance.statut not in (DemandeConge.Statut.RECUE, DemandeConge.Statut.PRETE):
            raise serializers.ValidationError(
                "Les observations ne sont plus modifiables une fois le titre récupéré, annulé ou interrompu."
            )
        return attrs


class CongeScanSerializer(serializers.ModelSerializer):
    class Meta:
        model = DemandeConge
        fields = ['scan_document']

    def validate_scan_document(self, value):
        _verifier_fichier(value, TAILLE_SCAN_MAX)
        return value


class PieceJointeSerializer(serializers.ModelSerializer):
    """Lecture seule : jamais l'URL du fichier, le téléchargement passe par l'API."""
    class Meta:
        model = PieceJointeConge
        fields = ['id', 'libelle', 'piece', 'nom_fichier', 'taille', 'mime_type', 'created_at']
        read_only_fields = fields


class PieceJointeUploadSerializer(serializers.Serializer):
    fichier = serializers.FileField()
    piece = serializers.PrimaryKeyRelatedField(queryset=MotifPiece.objects.filter(is_active=True),
                                               required=False, allow_null=True)
    libelle = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')

    def validate_fichier(self, value):
        self._mime = _verifier_fichier(value, TAILLE_PIECE_MAX)
        return value

    def validate(self, attrs):
        demande = self.context['demande']
        piece = attrs.get('piece')
        if piece is not None and piece.motif_id != demande.motif_id:
            raise serializers.ValidationError({'piece': "Cette pièce ne correspond pas au motif de la demande."})
        libelle = (attrs.get('libelle') or '').strip() or (piece.libelle if piece else '')
        if not libelle:
            raise serializers.ValidationError({'libelle': "Indiquez la nature de la pièce."})
        attrs['libelle'] = libelle
        attrs['mime_type'] = self._mime
        return attrs


class MouvementCongeSerializer(serializers.ModelSerializer):
    auteur_nom = serializers.SerializerMethodField()
    demande_reference = serializers.CharField(source='demande.reference', read_only=True, default=None)
    nature_libelle = serializers.CharField(source='get_nature_display', read_only=True)

    class Meta:
        model = MouvementConge
        fields = ['id', 'nature', 'nature_libelle', 'demande_reference',
                  'exercice', 'd_droit', 'd_consomme', 'd_droit_initial', 'd_cp_consomme', 'd_retrait_cs',
                  'avant', 'apres', 'motif', 'auteur_nom', 'created_at']
        read_only_fields = fields

    def get_auteur_nom(self, obj):
        return obj.auteur.full_name if obj.auteur_id else 'Système'


def _valider_cles_exercice(valeurs):
    for exercice in valeurs:
        _valider_exercice(exercice)
    return valeurs


class SoldeInitialSerializer(serializers.Serializer):
    """`exercices` : {"2024/2025": jours restants, ...}."""
    exercices = serializers.DictField(child=serializers.IntegerField(min_value=0, max_value=999), default=dict)
    droit_initial = serializers.IntegerField(min_value=0, default=0)
    cp_consomme = serializers.IntegerField(min_value=0, default=0)
    retrait_cs = serializers.IntegerField(min_value=0, default=0)
    motif = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_exercices(self, value):
        return _valider_cles_exercice(value)


class SoldeCorrectionSerializer(serializers.Serializer):
    """`exercices` : {exercice: variation signée des jours restants}."""
    exercices = serializers.DictField(child=serializers.IntegerField(min_value=-999, max_value=999), default=dict)
    droit_initial = serializers.IntegerField(required=False, default=0)
    cp_consomme = serializers.IntegerField(required=False, default=0)
    retrait_cs = serializers.IntegerField(required=False, default=0)
    motif = serializers.CharField(max_length=1000)

    def validate_exercices(self, value):
        return _valider_cles_exercice(value)

    def validate_motif(self, value):
        if not value.strip():
            raise serializers.ValidationError("Un motif est obligatoire pour corriger un solde.")
        return value.strip()

    def validate(self, attrs):
        if not any(attrs['exercices'].values()) and not any(attrs.get(c) for c in COMPTEURS):
            raise serializers.ValidationError("Aucune correction à appliquer.")
        return attrs


class MotifPieceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MotifPiece
        fields = ['id', 'motif', 'libelle', 'is_active']

    def validate_libelle(self, value):
        if not value.strip():
            raise serializers.ValidationError("Libellé requis.")
        return value.strip()


class MotifCongeSerializer(serializers.ModelSerializer):
    pieces = serializers.SerializerMethodField()

    class Meta:
        model = MotifConge
        fields = ['id', 'nom', 'type_conge', 'nb_jours_fixe', 'is_active', 'pieces']

    def get_pieces(self, obj):
        return MotifPieceSerializer(obj.pieces.all(), many=True).data

    def validate(self, attrs):
        nom = attrs.get('nom', getattr(self.instance, 'nom', None))
        type_conge = attrs.get('type_conge', getattr(self.instance, 'type_conge', None))
        qs = MotifConge.objects.filter(nom__iexact=nom, type_conge=type_conge)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError({'nom': "Ce motif existe déjà pour ce type de congé."})
        return attrs


class ParametreCongeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreConge
        fields = ['droit_annuel_jours']

    def validate_droit_annuel_jours(self, value):
        if not 1 <= value <= 90:
            raise serializers.ValidationError("Le droit annuel doit être compris entre 1 et 90 jours.")
        return value


class CongeTemplateConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CongeTemplateConfig
        fields = [
            'id', 'societe_nom', 'societe_soustitre', 'societe_capital', 'holding',
            'adresse', 'ville', 'telephone', 'fax', 'telex',
            'signataire_titre', 'signataire_nom',
            'signataire_interim', 'signataire_interim_nom', 'logo', 'mode_test',
        ]
        read_only_fields = ['id']

    def validate(self, attrs):
        interim = attrs.get('signataire_interim', self.instance.signataire_interim if self.instance else False)
        nom = attrs.get('signataire_interim_nom', self.instance.signataire_interim_nom if self.instance else '')
        if interim and not (nom or '').strip():
            raise serializers.ValidationError({'signataire_interim_nom': "Nom du signataire intérimaire requis."})
        if not interim:
            attrs['signataire_interim_nom'] = ''
        return attrs

"""
employees/referentiel_views.py
CRUD pour les référentiels : Direction, Département, Service, Poste, TypeContrat, Catégorie
"""

import os
from django.conf import settings
from django.db import transaction
from rest_framework import generics, serializers, status
from rest_framework.response import Response
from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from rest_framework.views import APIView
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument,
    EmployeeDocument, EmployeeDocumentFile,
    ChampPersonnalise, SystemFieldLabel,
    Pole, Cellule,
)


class TypeDocumentDestroyMixin:
    """Un TypeDocument reste bloqué (PROTECT) tant que des EmployeeDocument le
    référencent, même ceux déjà archivés (is_active=False) par un admin. On ne
    bloque réellement que s'il reste des documents ACTIFS ; les archivés sont
    purgés définitivement (fichiers + lignes) avant la suppression, avec trace
    d'audit — ils sont déjà hors du dossier employé, donc sans valeur légale
    à conserver une fois le type lui-même supprimé."""

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        actifs = instance.documents.filter(is_active=True).count()
        if actifs > 0:
            return Response(
                {"error": "Impossible de supprimer — des documents actifs utilisent encore ce type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        archives = EmployeeDocument.objects.filter(type_doc=instance, is_active=False)
        nb_archives = archives.count()
        if nb_archives:
            file_paths = list(
                EmployeeDocumentFile.objects.filter(document__in=archives)
                .values_list('file', flat=True)
            )
            with transaction.atomic():
                archives.delete()
                AuditLog.log(
                    request, AuditLog.Action.DELETE_DOC,
                    target=instance,
                    details={'purge_documents_archives': nb_archives},
                )
                instance.delete()
            for path in file_paths:
                if path:
                    full_path = os.path.join(settings.MEDIA_ROOT, path)
                    if os.path.isfile(full_path):
                        try:
                            os.remove(full_path)
                        except OSError:
                            pass
            return Response(status=status.HTTP_204_NO_CONTENT)

        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── SERIALIZERS ──────────────────────────────────────────────────────────────

class DirectionSerializer(serializers.ModelSerializer):
    nb_departements = serializers.SerializerMethodField()
    nb_poles = serializers.SerializerMethodField()
    nb_cellules = serializers.SerializerMethodField()
    class Meta:
        model = Direction
        fields = [
            'id', 'nom', 'code', 'description', 'is_active',
            'nb_departements', 'nb_poles', 'nb_cellules',
        ]
    def get_nb_departements(self, obj):
        # Total (directs + regroupes sous un Pole de cette Direction) —
        # inchange par l'ajout des Poles/Cellules, pour ne pas casser les
        # ecrans existants (Parametres) qui affichent deja ce total.
        return obj.departements.filter(is_active=True).count()
    def get_nb_poles(self, obj):
        return obj.poles.filter(is_active=True).count()
    def get_nb_cellules(self, obj):
        return obj.cellules.filter(is_active=True).count()


class PoleSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    nb_departements = serializers.SerializerMethodField()
    class Meta:
        model = Pole
        fields = ['id', 'direction', 'direction_nom', 'nom', 'code', 'description', 'is_active', 'nb_departements']
    def get_nb_departements(self, obj):
        return obj.departements.filter(is_active=True).count()


class DepartementSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    pole_nom = serializers.CharField(source='pole.nom', read_only=True, default=None)
    nb_services = serializers.SerializerMethodField()
    class Meta:
        model = Departement
        fields = ['id', 'direction', 'direction_nom', 'pole', 'pole_nom', 'nom', 'code', 'description', 'is_active', 'nb_services']
    def get_nb_services(self, obj):
        return obj.services.filter(is_active=True).count()

    def validate(self, attrs):
        direction = attrs.get('direction', getattr(self.instance, 'direction', None))
        pole = attrs.get('pole', getattr(self.instance, 'pole', None))
        if pole is not None and direction is not None and pole.direction_id != direction.id:
            raise serializers.ValidationError(
                {"pole": "Ce Pôle n'appartient pas à la Direction sélectionnée."}
            )
        return attrs


class ServiceSerializer(serializers.ModelSerializer):
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    direction_nom = serializers.CharField(source='departement.direction.nom', read_only=True)
    class Meta:
        model = Service
        fields = ['id', 'departement', 'departement_nom', 'direction_nom', 'nom', 'code', 'description', 'is_active']


class CelluleSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True, default=None)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True, default=None)
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = Cellule
        fields = [
            'id', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
        ]
    def get_nb_employes(self, obj):
        return obj.employees.count()

    def validate(self, attrs):
        direction = attrs.get('direction', getattr(self.instance, 'direction', None))
        departement = attrs.get('departement', getattr(self.instance, 'departement', None))
        if bool(direction) == bool(departement):
            raise serializers.ValidationError(
                "Une Cellule doit être rattachée à exactement une Direction OU un Département."
            )
        return attrs


class PosteSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = Poste
        fields = ['id', 'nom', 'code', 'description', 'is_active', 'nb_employes']
    def get_nb_employes(self, obj):
        return obj.employees.count()


class TypeContratSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = TypeContrat
        fields = ['id', 'nom', 'description', 'is_active', 'nb_employes']
    def get_nb_employes(self, obj):
        return obj.employees.count()


class CategorieSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = Categorie
        fields = ['id', 'nom', 'description', 'is_active', 'nb_employes']
    def get_nb_employes(self, obj):
        return obj.employees.count()


# ─── VIEWS ────────────────────────────────────────────────────────────────────

class ReferentielSearchMixin:
    """Filtre la queryset sur ?q= (recherche nom/code, insensible à la casse).
    Appliqué avant pagination — recherche donc sur l'ensemble des données,
    pas seulement la page courante affichée côté frontend."""

    search_fields = ['nom', 'code']

    def filter_search(self, qs):
        q = self.request.query_params.get('q', '').strip()
        if q:
            from django.db.models import Q
            condition = Q()
            for field in self.search_fields:
                condition |= Q(**{f'{field}__icontains': q})
            qs = qs.filter(condition)
        return qs


class DirectionListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = DirectionSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        # Restreint au périmètre d'un CONSULTANT scopé (ex. filtre page
        # Employés) — ADMIN et CONSULTANT non scopé voient tout, inchangé.
        # ?all=1 ignore le périmètre (utilisé par l'Organigramme pour
        # afficher l'arbre complet — le périmètre y est appliqué côté
        # frontend uniquement pour griser les nœuds hors accès).
        if self.request.query_params.get('all') == '1':
            qs = Direction.objects.all()
        else:
            qs = self.request.user.accessible_directions_qs()
        return self.filter_search(qs)

class DirectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DirectionSerializer
    permission_classes = [IsAdmin]
    queryset = Direction.objects.all()


class PoleListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = PoleSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Pole.objects.select_related('direction').all()
        else:
            qs = self.request.user.accessible_poles_qs().select_related('direction')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        return self.filter_search(qs)

class PoleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PoleSerializer
    permission_classes = [IsAdmin]
    queryset = Pole.objects.select_related('direction')

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.departements.exists():
            return Response(
                {"error": "Impossible de supprimer — des départements sont encore rattachés à ce Pôle."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class DepartementListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = DepartementSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Departement.objects.select_related('direction', 'pole').all()
        else:
            qs = self.request.user.accessible_departements_qs().select_related('direction', 'pole')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        pole = self.request.query_params.get('pole')
        if pole:
            qs = qs.filter(pole=pole)
        return self.filter_search(qs)

class DepartementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DepartementSerializer
    permission_classes = [IsAdmin]
    queryset = Departement.objects.select_related('direction', 'pole')


class ServiceListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = ServiceSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Service.objects.select_related('departement__direction').all()
        else:
            qs = self.request.user.accessible_services_qs().select_related('departement__direction')
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement=departement)
        return self.filter_search(qs)

class ServiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [IsAdmin]
    queryset = Service.objects.select_related('departement__direction')


class CelluleListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = CelluleSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Cellule.objects.select_related('direction', 'departement').all()
        else:
            qs = self.request.user.accessible_cellules_qs().select_related('direction', 'departement')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement=departement)
        return self.filter_search(qs)

class CelluleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CelluleSerializer
    permission_classes = [IsAdmin]
    queryset = Cellule.objects.select_related('direction', 'departement')


class PosteListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = PosteSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Poste.objects.all())

class PosteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PosteSerializer
    permission_classes = [IsAdmin]
    queryset = Poste.objects.all()


class TypeContratListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = TypeContratSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(TypeContrat.objects.all())

class TypeContratDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TypeContratSerializer
    permission_classes = [IsAdmin]
    queryset = TypeContrat.objects.all()


class CategorieListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = CategorieSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Categorie.objects.all())

class CategorieDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CategorieSerializer
    permission_classes = [IsAdmin]
    queryset = Categorie.objects.all()

class TypeDocumentSerializer(serializers.ModelSerializer):
    nb_documents = serializers.SerializerMethodField()
    parent_nom = serializers.CharField(source='parent.nom', read_only=True)
    is_categorie = serializers.BooleanField(read_only=True)
    class Meta:
        model = TypeDocument
        fields = [
            'id', 'nom', 'code', 'obligatoire', 'is_active', 'ordre',
            'nb_documents', 'parent', 'parent_nom', 'is_categorie',
        ]
    def get_nb_documents(self, obj):
        return obj.documents.filter(is_active=True).count()

    def validate(self, attrs):
        # Une catégorie (qui a des sous-types) n'est jamais uploadable
        # directement — son propre "obligatoire" n'a donc aucun effet sur le
        # calcul de complétude (voir sous_types__isnull=True partout ailleurs)
        # et ne doit pas rester à True en base, pour ne pas induire l'admin
        # en erreur en pensant que ça impose encore une exigence.
        if self.instance and self.instance.sous_types.exists():
            attrs['obligatoire'] = False
        return attrs

    def validate_parent(self, value):
        if value is None:
            return value
        if self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError("Un type ne peut pas être sa propre catégorie parente.")
        if value.parent_id is not None:
            raise serializers.ValidationError(
                "Une catégorie parente ne peut pas elle-même avoir un parent (2 niveaux maximum)."
            )
        if self.instance and self.instance.sous_types.exists():
            raise serializers.ValidationError(
                "Ce type a déjà des sous-types — il ne peut pas devenir lui-même un sous-type."
            )
        return value

class TypeDocumentListCreateView(generics.ListCreateAPIView):
    serializer_class = TypeDocumentSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.method == 'POST':
            return TypeDocument.objects.select_related('parent').all()
        # Restreint au périmètre d'un CONSULTANT scopé sur les types de
        # documents — ADMIN et CONSULTANT non scopé voient tout, inchangé.
        return self.request.user.accessible_types_documents_qs().select_related('parent')

class TypeDocumentDetailView(TypeDocumentDestroyMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TypeDocumentSerializer
    permission_classes = [IsAdmin]
    queryset = TypeDocument.objects.select_related('parent').all()

# Codes réservés aux champs structurels d'Employee — voir SYSTEM_FIELDS
# (frontend/src/pages/Parametres.jsx) et les colonnes CSV fixes
# (EmployeeImportView.REQUIRED_COLS/OPTIONAL_COLS). Un ChampPersonnalise
# portant un de ces codes entrerait en collision avec l'import CSV
# dynamique (EmployeeImportView.champs_actifs matche par code.lower()) et
# écraserait silencieusement la colonne structurelle correspondante.
RESERVED_CHAMP_CODES = {
    'matricule', 'numero_contrat', 'nom', 'prenom',
    'date_naissance', 'date_embauche', 'statut',
    'direction', 'departement', 'service',
    'poste', 'type_contrat', 'categorie',
}


class ChampPersonnaliseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampPersonnalise
        fields = ['id', 'nom', 'code', 'type_champ', 'ordre', 'is_active']

    def validate_code(self, value):
        if value.strip().lower() in RESERVED_CHAMP_CODES:
            raise serializers.ValidationError(
                "Ce code est réservé à un champ système (voir la colonne du même nom "
                "dans l'import CSV) — choisissez un code différent."
            )
        return value


class ChampPersonnaliseListCreateView(generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = ChampPersonnalise.objects.all()


class ChampPersonnaliseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ChampPersonnaliseSerializer
    permission_classes = [IsAdmin]
    queryset = ChampPersonnalise.objects.all()


class SystemFieldLabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemFieldLabel
        fields = ['code', 'label']


class SystemFieldLabelListView(generics.ListAPIView):
    """
    GET /ref/system-field-labels/ — libellés personnalisés des champs
    système (seulement ceux qui ont été renommés au moins une fois).
    """
    serializer_class = SystemFieldLabelSerializer
    permission_classes = [IsAdminOrConsultant]
    queryset = SystemFieldLabel.objects.all()


class SystemFieldLabelUpdateView(APIView):
    """
    PUT /ref/system-field-labels/<code>/ — renomme (ou réinitialise si
    label vide) le libellé affiché d'un champ système. Ne touche jamais au
    champ réel sur Employee — purement cosmétique côté Paramètres/fiche
    employé.
    """
    permission_classes = [IsAdmin]

    def put(self, request, code):
        label = (request.data.get('label') or '').strip()
        if not label:
            SystemFieldLabel.objects.filter(code=code).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        obj, _ = SystemFieldLabel.objects.update_or_create(
            code=code, defaults={'label': label}
        )
        return Response(SystemFieldLabelSerializer(obj).data)

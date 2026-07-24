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
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument,
    EmployeeDocument, EmployeeDocumentFile
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
    class Meta:
        model = Direction
        fields = ['id', 'nom', 'code', 'description', 'is_active', 'nb_departements']
    def get_nb_departements(self, obj):
        return obj.departements.filter(is_active=True).count()


class DepartementSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    nb_services = serializers.SerializerMethodField()
    class Meta:
        model = Departement
        fields = ['id', 'direction', 'direction_nom', 'nom', 'code', 'description', 'is_active', 'nb_services']
    def get_nb_services(self, obj):
        return obj.services.filter(is_active=True).count()


class ServiceSerializer(serializers.ModelSerializer):
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    direction_nom = serializers.CharField(source='departement.direction.nom', read_only=True)
    class Meta:
        model = Service
        fields = ['id', 'departement', 'departement_nom', 'direction_nom', 'nom', 'code', 'description', 'is_active']


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

class DirectionListCreateView(generics.ListCreateAPIView):
    serializer_class = DirectionSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        # Restreint au périmètre d'un CONSULTANT scopé (ex. filtre page
        # Employés) — ADMIN et CONSULTANT non scopé voient tout, inchangé.
        return self.request.user.accessible_directions_qs()

class DirectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DirectionSerializer
    permission_classes = [IsAdmin]
    queryset = Direction.objects.all()


class DepartementListCreateView(generics.ListCreateAPIView):
    serializer_class = DepartementSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        qs = self.request.user.accessible_departements_qs().select_related('direction')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        return qs

class DepartementDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DepartementSerializer
    permission_classes = [IsAdmin]
    queryset = Departement.objects.select_related('direction')


class ServiceListCreateView(generics.ListCreateAPIView):
    serializer_class = ServiceSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        qs = self.request.user.accessible_services_qs().select_related('departement__direction')
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement=departement)
        return qs

class ServiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [IsAdmin]
    queryset = Service.objects.select_related('departement__direction')


class PosteListCreateView(generics.ListCreateAPIView):
    serializer_class = PosteSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = Poste.objects.all()

class PosteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PosteSerializer
    permission_classes = [IsAdmin]
    queryset = Poste.objects.all()


class TypeContratListCreateView(generics.ListCreateAPIView):
    serializer_class = TypeContratSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = TypeContrat.objects.all()

class TypeContratDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TypeContratSerializer
    permission_classes = [IsAdmin]
    queryset = TypeContrat.objects.all()


class CategorieListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorieSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = Categorie.objects.all()

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
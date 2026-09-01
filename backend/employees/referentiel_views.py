"""
employees/referentiel_views.py
CRUD pour les référentiels : Direction, Département, Service, Poste, TypeContrat, Catégorie
"""

import os
import re
from django.conf import settings
from django.db import transaction
from rest_framework import generics, serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from rest_framework.views import APIView
from employees.models import (
    Direction, Departement, Service, Poste,
    TypeContrat, Categorie, TypeDocument,
    EmployeeDocument, EmployeeDocumentFile,
    ChampPersonnalise, SystemFieldLabel,
    Pole, Cellule, Section, Echelle,
)


class ReferentielPagination(PageNumberPagination):
    """Les référentiels ont deux usages distincts : tableau CRUD paginé
    (`/parametres`, qui envoie explicitement `?page=`) et dropdowns/cascades
    (formulaire employé, filtres...) qui s'attendent à recevoir la liste
    complète en un seul appel. Sans `?page=` dans la requête, on désactive
    la pagination (retourne tout) plutôt que de tronquer silencieusement à
    PAGE_SIZE=25 — c'est ce qui rendait certains postes impossibles à
    sélectionner dans la liste déroulante "Fonction" (au-delà des 25
    premiers, triés par nom)."""

    page_size = 25

    def paginate_queryset(self, queryset, request, view=None):
        if 'page' not in request.query_params:
            return None
        return super().paginate_queryset(queryset, request, view)


def _delete_type_document(request, instance):
    """Supprime un TypeDocument avec ses règles propres — factorisé pour être
    réutilisé par la suppression unitaire (TypeDocumentDestroyMixin) et la
    suppression en masse (ReferentielBulkDeleteView). Un TypeDocument reste
    bloqué (PROTECT) tant que des EmployeeDocument le référencent, même ceux
    déjà archivés (is_active=False) par un admin. On ne bloque réellement que
    s'il reste des documents ACTIFS ; les archivés sont purgés définitivement
    (fichiers + lignes) avant la suppression, avec trace d'audit — ils sont
    déjà hors du dossier employé, donc sans valeur légale à conserver une
    fois le type lui-même supprimé.

    Retourne un message d'erreur (str) si la suppression est bloquée, sinon
    None (l'instance a bien été supprimée)."""
    actifs = instance.documents.filter(is_active=True).count()
    if actifs > 0:
        return "Impossible de supprimer — des documents actifs utilisent encore ce type."

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
        return None

    instance.delete()
    return None


class TypeDocumentDestroyMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        erreur = _delete_type_document(request, instance)
        if erreur:
            return Response({"error": erreur}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── SERIALIZERS ──────────────────────────────────────────────────────────────

class DirectionSerializer(serializers.ModelSerializer):
    nb_departements = serializers.SerializerMethodField()
    nb_poles = serializers.SerializerMethodField()
    nb_cellules = serializers.SerializerMethodField()
    nb_sections = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Direction
        fields = [
            'id', 'nom', 'code', 'description', 'is_active',
            'nb_departements', 'nb_poles', 'nb_cellules', 'nb_sections',
            'responsable', 'responsable_nom',
        ]
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None
    def get_nb_departements(self, obj):
        # Total (directs + regroupes sous un Pole de cette Direction) —
        # inchange par l'ajout des Poles/Cellules, pour ne pas casser les
        # ecrans existants (Parametres) qui affichent deja ce total.
        return obj.departements.filter(is_active=True).count()
    def get_nb_poles(self, obj):
        return obj.poles.filter(is_active=True).count()
    def get_nb_cellules(self, obj):
        return obj.cellules.filter(is_active=True).count()
    def get_nb_sections(self, obj):
        return obj.sections.filter(is_active=True).count()


class PoleSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    nb_departements = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Pole
        fields = [
            'id', 'direction', 'direction_nom', 'nom', 'code', 'description', 'is_active',
            'nb_departements', 'responsable', 'responsable_nom',
        ]
    def get_nb_departements(self, obj):
        return obj.departements.filter(is_active=True).count()
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None


class DepartementSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    pole_nom = serializers.CharField(source='pole.nom', read_only=True, default=None)
    nb_services = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Departement
        fields = [
            'id', 'direction', 'direction_nom', 'pole', 'pole_nom', 'nom', 'code', 'description', 'is_active',
            'nb_services', 'responsable', 'responsable_nom',
        ]
    def get_nb_services(self, obj):
        return obj.services.filter(is_active=True).count()
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None

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
    nb_employes = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Service
        fields = [
            'id', 'departement', 'departement_nom', 'direction_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        return obj.employees.count()
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None


class CelluleSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True, default=None)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True, default=None)
    nb_employes = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Cellule
        fields = [
            'id', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        return obj.employees.count()
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None

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

    pagination_class = ReferentielPagination : ces référentiels sont des listes de sélection
    (dropdowns, cascades Direction→Département→Service...) que le frontend
    charge intégralement et filtre côté client — avec la pagination DRF par
    défaut (PAGE_SIZE=25), toute liste dépassant 25 lignes (ex. Postes) était
    tronquée silencieusement (`pos.data.results` ne contenait que la 1ère
    page), rendant certains éléments impossibles à sélectionner dans les
    formulaires."""

    search_fields = ['nom', 'code']
    pagination_class = ReferentielPagination

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


class SectionSerializer(serializers.ModelSerializer):
    direction_nom = serializers.CharField(source='direction.nom', read_only=True, default=None)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True, default=None)
    nb_employes = serializers.SerializerMethodField()
    responsable_nom = serializers.SerializerMethodField()
    class Meta:
        model = Section
        fields = [
            'id', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        return obj.employees.count()
    def get_responsable_nom(self, obj):
        return f"{obj.responsable.prenom} {obj.responsable.nom}" if obj.responsable_id else None

    def validate(self, attrs):
        direction = attrs.get('direction', getattr(self.instance, 'direction', None))
        departement = attrs.get('departement', getattr(self.instance, 'departement', None))
        if bool(direction) == bool(departement):
            raise serializers.ValidationError(
                "Une Section doit être rattachée à exactement une Direction OU un Département."
            )
        return attrs


class SectionListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = SectionSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        if self.request.query_params.get('all') == '1':
            qs = Section.objects.select_related('direction', 'departement').all()
        else:
            qs = self.request.user.accessible_sections_qs().select_related('direction', 'departement')
        direction = self.request.query_params.get('direction')
        if direction:
            qs = qs.filter(direction=direction)
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement=departement)
        return self.filter_search(qs)

class SectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SectionSerializer
    permission_classes = [IsAdmin]
    queryset = Section.objects.select_related('direction', 'departement')


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


class EchelleSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()
    class Meta:
        model = Echelle
        fields = ['id', 'nom', 'description', 'is_active', 'nb_employes']
    def get_nb_employes(self, obj):
        if not hasattr(obj, 'historiqueechelle_periodes'):
            return 0
        return obj.historiqueechelle_periodes.filter(date_fin__isnull=True).count()


class EchelleListCreateView(ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = EchelleSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Echelle.objects.all())

class EchelleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EchelleSerializer
    permission_classes = [IsAdmin]
    queryset = Echelle.objects.all()

class TypeDocumentSerializer(serializers.ModelSerializer):
    nb_documents = serializers.SerializerMethodField()
    parent_nom = serializers.CharField(source='parent.nom', read_only=True)
    is_categorie = serializers.BooleanField(read_only=True)
    class Meta:
        model = TypeDocument
        fields = [
            'id', 'nom', 'code', 'obligatoire', 'is_active', 'ordre', 'couleur',
            'nb_documents', 'parent', 'parent_nom', 'is_categorie', 'champ_source',
        ]
    def get_nb_documents(self, obj):
        return obj.documents.filter(is_active=True).count()

    def validate(self, attrs):
        # Une catégorie (qui a des sous-types) n'est jamais uploadable
        # directement — son propre "obligatoire" n'a donc aucun effet sur le
        # calcul de complétude (voir sous_types__isnull=True partout ailleurs)
        # et ne doit pas rester à True en base, pour ne pas induire l'admin
        # en erreur en pensant que ça impose encore une exigence. Même
        # raisonnement pour champ_source : une catégorie n'est jamais
        # elle-même sélectionnable comme document, donc jamais "source"
        # d'un champ.
        if self.instance and self.instance.sous_types.exists():
            attrs['obligatoire'] = False
            attrs['champ_source'] = ''
        return attrs

    def validate_couleur(self, value):
        if not value:
            return value
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise serializers.ValidationError("Couleur invalide — attendu un code hexadécimal, ex. #166534.")
        return value.lower()

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
    pagination_class = ReferentielPagination
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
    'date_naissance', 'date_embauche', 'date_debut_contrat', 'date_fin_contrat', 'statut',
    'direction', 'pole', 'departement', 'section', 'service', 'cellule',
    'poste', 'type_contrat', 'categorie', 'echelle',
}


class ChampPersonnaliseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampPersonnalise
        fields = ['id', 'nom', 'code', 'type_champ', 'ordre', 'is_active', 'is_systeme', 'categorie']
        read_only_fields = ['is_systeme']

    def validate_code(self, value):
        if value.strip().lower() in RESERVED_CHAMP_CODES:
            raise serializers.ValidationError(
                "Ce code est réservé à un champ système (voir la colonne du même nom "
                "dans l'import CSV) — choisissez un code différent."
            )
        return value

    def validate(self, attrs):
        # Un champ système (is_systeme=True) n'est jamais créable via ce
        # serializer (is_systeme est read_only) — ici on protège l'édition :
        # seule `categorie` peut changer sur une instance existante is_systeme.
        instance = getattr(self, 'instance', None)
        if instance is not None and instance.is_systeme:
            mutable = set(attrs.keys()) - {'categorie'}
            if mutable:
                raise serializers.ValidationError(
                    "Un champ système ne peut avoir que sa catégorie modifiée "
                    "(nom, code, type, ordre et statut restent figés)."
                )
        return attrs


class ChampPersonnaliseListCreateView(generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseSerializer
    pagination_class = ReferentielPagination
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = ChampPersonnalise.objects.all()


class ChampPersonnaliseDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ChampPersonnaliseSerializer
    permission_classes = [IsAdmin]
    queryset = ChampPersonnalise.objects.all()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_systeme:
            return Response(
                {"detail": "Un champ système ne peut pas être supprimé."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class SystemFieldLabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemFieldLabel
        fields = ['code', 'label', 'ordre']


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
            existing = SystemFieldLabel.objects.filter(code=code).first()
            # Un ordre personnalisé (voir ChampsOrdreReorderView) doit survivre
            # à une réinitialisation du libellé — seule la ligne entière est
            # purgée quand plus rien de custom n'y est attaché.
            if existing and existing.ordre is not None:
                existing.label = ''
                existing.save(update_fields=['label'])
                return Response(SystemFieldLabelSerializer(existing).data)
            SystemFieldLabel.objects.filter(code=code).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        obj, _ = SystemFieldLabel.objects.update_or_create(
            code=code, defaults={'label': label}
        )
        return Response(SystemFieldLabelSerializer(obj).data)


class ChampsOrdreReorderView(APIView):
    """
    PUT /ref/champs-personnalises/reorder/ — réordonne en une seule requête
    tous les champs de l'onglet Paramètres > "Champs personnalisés",
    système et personnalisés mélangés (ADMIN only). Body :
    {"order": [{"type": "system", "code": "matricule"}, {"type": "custom", "id": "<uuid>"}, ...]}
    dans l'ordre final souhaité (liste complète) — réassigne un `ordre`
    séquentiel (pas de round-trip diff avec l'ancien ordre).
    """
    permission_classes = [IsAdmin]

    def put(self, request):
        order = request.data.get('order') or []
        for idx, entry in enumerate(order):
            if not isinstance(entry, dict):
                continue
            ordre = idx * 10
            if entry.get('type') == 'system':
                code = entry.get('code')
                if not code:
                    continue
                existing = SystemFieldLabel.objects.filter(code=code).first()
                if existing:
                    existing.ordre = ordre
                    existing.save(update_fields=['ordre'])
                else:
                    SystemFieldLabel.objects.create(code=code, label='', ordre=ordre)
            elif entry.get('type') == 'custom':
                champ_id = entry.get('id')
                if champ_id:
                    ChampPersonnalise.objects.filter(id=champ_id).update(ordre=ordre)
        return Response({'ok': True})


class ReferentielBulkDeleteView(APIView):
    """
    POST /api/ref/bulk-delete/{model}/
    Body : {"ids": ["<uuid>", ...]}
    Supprime plusieurs éléments d'un référentiel en une seule requête
    (bouton "Supprimer la sélection" de /parametres). Réutilise exactement
    les mêmes règles de protection que la suppression individuelle
    (DetailView.destroy) pour chaque modèle — un Pôle avec des départements
    rattachés, un TypeDocument avec des documents actifs, restent bloqués
    ligne par ligne plutôt que d'échouer tout le lot.
    """
    permission_classes = [IsAdmin]

    MODELS = {
        'directions': Direction,
        'poles': Pole,
        'departements': Departement,
        'services': Service,
        'cellules': Cellule,
        'sections': Section,
        'postes': Poste,
        'types-contrat': TypeContrat,
        'categories': Categorie,
        'echelles': Echelle,
        'types-documents': TypeDocument,
        'champs-personnalises': ChampPersonnalise,
    }

    MAX_IDS = 500

    def post(self, request, model):
        if model not in self.MODELS:
            return Response({'error': f'Modèle inconnu : {model}'}, status=400)

        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids:
            return Response({'error': 'Aucun élément sélectionné.'}, status=400)
        if len(ids) > self.MAX_IDS:
            return Response(
                {'error': f'Trop d\'éléments sélectionnés (maximum {self.MAX_IDS} par lot).'},
                status=400,
            )

        ModelClass = self.MODELS[model]
        objets = {str(o.pk): o for o in ModelClass.objects.filter(pk__in=ids)}

        nb_supprimes = 0
        erreurs = []

        for id_ in ids:
            instance = objets.get(str(id_))
            if not instance:
                erreurs.append({'id': id_, 'nom': '—', 'erreur': 'Introuvable'})
                continue

            if model == 'poles' and instance.departements.exists():
                erreurs.append({
                    'id': id_, 'nom': instance.nom,
                    'erreur': 'Des départements sont encore rattachés à ce Pôle.',
                })
                continue

            if model == 'types-documents':
                erreur = _delete_type_document(request, instance)
                if erreur:
                    erreurs.append({'id': id_, 'nom': instance.nom, 'erreur': erreur})
                else:
                    nb_supprimes += 1
                continue

            instance.delete()
            nb_supprimes += 1

        return Response({
            'nb_supprimes': nb_supprimes,
            'nb_erreurs': len(erreurs),
            'erreurs': erreurs,
        })

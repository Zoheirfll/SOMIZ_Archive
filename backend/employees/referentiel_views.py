"""
employees/referentiel_views.py
CRUD pour les référentiels : Direction, Département, Service, Poste, TypeContrat, Catégorie
"""

import os
import re
from django.conf import settings
from django.db import transaction
from django.db.models import ProtectedError
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
    ChampPersonnalise, ChampPersonnaliseOption, SystemFieldLabel,
    Pole, Cellule, Section, Echelle, MotifArchivage,
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
            AuditLog.log(
                request, AuditLog.Action.DELETE_REF, target=instance,
                details={'model': 'TypeDocument', 'nom': instance.nom},
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

    AuditLog.log(
        request, AuditLog.Action.DELETE_REF, target=instance,
        details={'model': 'TypeDocument', 'nom': instance.nom},
    )
    instance.delete()
    return None


class TypeDocumentDestroyMixin:
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        erreur = _delete_type_document(request, instance)
        if erreur:
            return Response({"error": erreur}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _ref_label(instance):
    return getattr(instance, 'nom', None) or str(instance)


def _ref_snapshot(instance):
    """Capture générique par réflexion (même technique que
    ReferentielMergeView._reassigner) — évite d'énumérer les champs propres
    à chaque modèle de référentiel pour calculer un diff avant/après."""
    return {
        f.name: str(getattr(instance, f.attname, None))
        for f in instance._meta.fields
        if f.name not in ('id', 'created_at')
    }


class ReferentielAuditMixin:
    """Trace les créations/modifications/suppressions de référentiel dans
    le journal d'audit (CREATE_REF/MODIFY_REF/DELETE_REF) — jusqu'ici seules
    les mutations Employee/Document/User étaient tracées, pas les
    référentiels (Direction, TypeDocument, Catégorie...), voir securite.md
    point 38. À appliquer à toute nouvelle vue CRUD de référentiel."""

    def perform_create(self, serializer):
        instance = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_REF, target=instance,
            details={'model': instance.__class__.__name__, 'nom': _ref_label(instance)},
        )

    def perform_update(self, serializer):
        avant = _ref_snapshot(serializer.instance)
        instance = serializer.save()
        apres = _ref_snapshot(instance)
        diff = {k: {'de': avant.get(k), 'vers': v} for k, v in apres.items() if avant.get(k) != v}
        if diff:
            AuditLog.log(
                self.request, AuditLog.Action.MODIFY_REF, target=instance,
                details={'model': instance.__class__.__name__, 'nom': _ref_label(instance), 'champs': diff},
            )

    def perform_destroy(self, instance):
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_REF, target=instance,
            details={'model': instance.__class__.__name__, 'nom': _ref_label(instance)},
        )
        instance.delete()


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
            'id', 'slug', 'nom', 'code', 'description', 'is_active',
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
            'id', 'slug', 'direction', 'direction_nom', 'nom', 'code', 'description', 'is_active',
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
            'id', 'slug', 'direction', 'direction_nom', 'pole', 'pole_nom', 'nom', 'code', 'description', 'is_active',
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
            'id', 'slug', 'departement', 'departement_nom', 'direction_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        # Ne compte que les employés Actif — voir CLAUDE.md section Archivage.
        return obj.employees.filter(statut='actif').count()
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
            'id', 'slug', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        # Ne compte que les employés Actif — voir CLAUDE.md section Archivage.
        return obj.employees.filter(statut='actif').count()
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
        fields = ['id', 'nom', 'description', 'is_active', 'duree_indeterminee', 'nb_employes']
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

    def finalize_response(self, request, response, *args, **kwargs):
        # Ces référentiels (Direction, Poste, TypeContrat...) changent rarement
        # et sont rechargés à chaque ouverture de formulaire/filtre — un court
        # cache HTTP évite de les retélécharger en boucle. `private` car le
        # contenu dépend du périmètre CONSULTANT de l'utilisateur (pas un cache
        # partageable par un proxy intermédiaire).
        response = super().finalize_response(request, response, *args, **kwargs)
        if request.method == 'GET':
            response['Cache-Control'] = 'private, max-age=60'
        return response

    def filter_search(self, qs):
        q = self.request.query_params.get('q', '').strip()
        if q:
            from django.db.models import Q
            condition = Q()
            for field in self.search_fields:
                condition |= Q(**{f'{field}__icontains': q})
            qs = qs.filter(condition)
        # Résolution exacte "slug -> objet" — utilisée par le frontend pour
        # retrouver l'objet complet correspondant à un query param lisible
        # (ex. /employees?direction=<slug>), sans jamais exposer l'UUID.
        slug = self.request.query_params.get('slug', '').strip()
        if slug:
            qs = qs.filter(slug=slug)
        return qs


class DirectionListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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

class DirectionDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DirectionSerializer
    permission_classes = [IsAdmin]
    queryset = Direction.objects.all()


class PoleListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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
            qs = qs.filter(direction__slug=direction)
        return self.filter_search(qs)

class PoleDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class DepartementListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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
            qs = qs.filter(direction__slug=direction)
        pole = self.request.query_params.get('pole')
        if pole:
            qs = qs.filter(pole__slug=pole)
        return self.filter_search(qs)

class DepartementDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DepartementSerializer
    permission_classes = [IsAdmin]
    queryset = Departement.objects.select_related('direction', 'pole')


class ServiceListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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
            qs = qs.filter(departement__slug=departement)
        return self.filter_search(qs)

class ServiceDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ServiceSerializer
    permission_classes = [IsAdmin]
    queryset = Service.objects.select_related('departement__direction')


class CelluleListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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
            qs = qs.filter(direction__slug=direction)
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement__slug=departement)
        return self.filter_search(qs)

class CelluleDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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
            'id', 'slug', 'direction', 'direction_nom', 'departement', 'departement_nom',
            'nom', 'code', 'description', 'is_active', 'nb_employes',
            'responsable', 'responsable_nom',
        ]
    def get_nb_employes(self, obj):
        # Ne compte que les employés Actif — voir CLAUDE.md section Archivage.
        return obj.employees.filter(statut='actif').count()
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


class SectionListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
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
            qs = qs.filter(direction__slug=direction)
        departement = self.request.query_params.get('departement')
        if departement:
            qs = qs.filter(departement__slug=departement)
        return self.filter_search(qs)

class SectionDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SectionSerializer
    permission_classes = [IsAdmin]
    queryset = Section.objects.select_related('direction', 'departement')


class PosteListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = PosteSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Poste.objects.all())

class PosteDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PosteSerializer
    permission_classes = [IsAdmin]
    queryset = Poste.objects.all()


class TypeContratListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = TypeContratSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(TypeContrat.objects.all())

class TypeContratDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TypeContratSerializer
    permission_classes = [IsAdmin]
    queryset = TypeContrat.objects.all()


class CategorieListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = CategorieSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Categorie.objects.all())

class CategorieDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class EchelleListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = EchelleSerializer
    search_fields = ['nom']
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(Echelle.objects.all())

class EchelleDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = EchelleSerializer
    permission_classes = [IsAdmin]
    queryset = Echelle.objects.all()


class MotifSerializer(serializers.ModelSerializer):
    nb_employes = serializers.SerializerMethodField()
    nb_demandes = serializers.SerializerMethodField()
    class Meta:
        model = MotifArchivage
        fields = ['id', 'nom', 'categorie', 'description', 'is_active', 'nb_employes', 'nb_demandes']
        read_only_fields = ['categorie']
    def get_nb_employes(self, obj):
        return obj.employees.count()
    def get_nb_demandes(self, obj):
        return obj.demandes_attestation.count()

    def validate_nom(self, value):
        # `categorie` en read_only (fixée par la vue, pas par le payload,
        # voir MotifArchivageListCreateView.perform_create) : le validateur
        # unique_together auto-généré par DRF ne peut pas s'appuyer dessus
        # (absente de validated_data) et laisse passer un doublon jusqu'à
        # la contrainte DB — IntegrityError brute, 500 nu côté client.
        # Vérification explicite ici, scopée à la bonne catégorie (celle de
        # l'instance en édition, celle de la vue à la création).
        categorie = self.instance.categorie if self.instance else getattr(self.context.get('view'), 'categorie', None)
        qs = MotifArchivage.objects.filter(nom__iexact=value.strip(), categorie=categorie)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un motif avec ce nom existe déjà dans cet espace.")
        return value


class MotifDestroyMixin:
    """Un motif referme par PROTECT depuis Employee.motif_archivage (SET_NULL,
    jamais bloquant) ou DemandeAttestation.motif (PROTECT, une demande garde
    toujours la trace du motif exact utilisé — voir CLAUDE.md) — seul ce
    second cas peut bloquer la suppression. `perform_destroy` (via
    ReferentielAuditMixin, qui journalise avant `.delete()`) tourne dans une
    transaction : si `.delete()` échoue, l'entrée d'audit déjà écrite est
    annulée avec le reste, pas de trace d'une suppression qui n'a pas eu
    lieu."""
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        try:
            with transaction.atomic():
                self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {"error": "Impossible de supprimer — des demandes d'attestation utilisent encore ce motif."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MotifArchivageListCreateView(ReferentielAuditMixin, ReferentielSearchMixin, generics.ListCreateAPIView):
    serializer_class = MotifSerializer
    search_fields = ['nom']
    categorie = MotifArchivage.Categorie.ARCHIVAGE
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        return self.filter_search(MotifArchivage.objects.filter(categorie=self.categorie))
    def perform_create(self, serializer):
        instance = serializer.save(categorie=self.categorie)
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_REF, target=instance,
            details={'model': instance.__class__.__name__, 'nom': _ref_label(instance)},
        )

class MotifArchivageDetailView(MotifDestroyMixin, ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MotifSerializer
    permission_classes = [IsAdmin]
    queryset = MotifArchivage.objects.filter(categorie=MotifArchivage.Categorie.ARCHIVAGE)


class MotifAttestationListCreateView(MotifArchivageListCreateView):
    categorie = MotifArchivage.Categorie.ATTESTATION

class MotifAttestationDetailView(MotifDestroyMixin, ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = MotifSerializer
    permission_classes = [IsAdmin]
    queryset = MotifArchivage.objects.filter(categorie=MotifArchivage.Categorie.ATTESTATION)

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
        # Plus de saisie manuelle — un nouveau type est ajouté en fin de sa
        # fratrie (TypeDocumentListCreateView.perform_create), le classement
        # se change ensuite uniquement via les flèches ↑/↓ du tableau
        # (/ref/types-documents/reorder/, qui écrit directement en base).
        read_only_fields = ['ordre']
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

    def validate_nom(self, value):
        qs = TypeDocument.objects.filter(nom__iexact=value.strip())
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Un type de document avec ce nom existe déjà.")
        return value

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

class TypeDocumentListCreateView(ReferentielAuditMixin, generics.ListCreateAPIView):
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

    def perform_create(self, serializer):
        # Plus de saisie manuelle de l'ordre à la création (voir
        # TypeDocumentSerializer.ordre, read_only) — un nouveau type
        # rejoint la fin de son groupe de fratrie (racine, ou sous-types
        # de la même catégorie), même convention "paliers de 10" que
        # TypesDocumentsReorderView. Le classement fin reste ensuite piloté
        # par les flèches ↑/↓ (/ref/types-documents/reorder/). L'audit log
        # (CREATE_REF) reste géré ici, comme le ferait ReferentielAuditMixin,
        # puisqu'on ne peut pas laisser le mixin appeler serializer.save()
        # sans l'argument ordre.
        parent = serializer.validated_data.get('parent')
        siblings = TypeDocument.objects.filter(parent=parent)
        last_ordre = siblings.order_by('-ordre').values_list('ordre', flat=True).first() or 0
        instance = serializer.save(ordre=last_ordre + 10)
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_REF, target=instance,
            details={'model': instance.__class__.__name__, 'nom': _ref_label(instance)},
        )

class TypeDocumentDetailView(TypeDocumentDestroyMixin, ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class ChampPersonnaliseOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChampPersonnaliseOption
        fields = ['id', 'champ', 'valeur', 'ordre', 'is_active']
        read_only_fields = ['champ']


class ChampPersonnaliseSerializer(serializers.ModelSerializer):
    options = ChampPersonnaliseOptionSerializer(many=True, read_only=True)

    class Meta:
        model = ChampPersonnalise
        fields = [
            'id', 'nom', 'code', 'type_champ', 'ordre', 'is_active',
            'is_systeme', 'categorie', 'ocr_pattern', 'options',
            'condition_champ', 'condition_valeur',
        ]
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
        # seules `categorie` et `ocr_pattern` peuvent changer sur une
        # instance existante is_systeme (le motif OCR reste configurable
        # même pour un champ système, ex. date_naissance).
        instance = getattr(self, 'instance', None)
        if instance is not None and instance.is_systeme:
            mutable = set(attrs.keys()) - {'categorie', 'ocr_pattern'}
            if mutable:
                raise serializers.ValidationError(
                    "Un champ système ne peut avoir que sa catégorie et son motif "
                    "OCR modifiés (nom, code, type, ordre et statut restent figés)."
                )

        condition_champ = attrs.get(
            'condition_champ', getattr(instance, 'condition_champ', None)
        )
        condition_valeur = attrs.get(
            'condition_valeur', getattr(instance, 'condition_valeur', '')
        )
        if condition_champ is not None and instance is not None and condition_champ.id == instance.id:
            raise serializers.ValidationError(
                {'condition_champ': "Un champ ne peut pas dépendre de lui-même."}
            )
        if condition_champ is not None and not condition_valeur.strip():
            raise serializers.ValidationError(
                {'condition_valeur': "Une valeur requise est obligatoire quand un champ conditionnel est choisi."}
            )
        if condition_champ is None:
            attrs['condition_valeur'] = ''
        return attrs


class ChampPersonnaliseListCreateView(ReferentielAuditMixin, generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseSerializer
    pagination_class = ReferentielPagination
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    queryset = ChampPersonnalise.objects.all()


class ChampPersonnaliseDetailView(ReferentielAuditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class ChampPersonnaliseOptionListCreateView(generics.ListCreateAPIView):
    serializer_class = ChampPersonnaliseOptionSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return ChampPersonnaliseOption.objects.filter(champ_id=self.kwargs['champ_id'])

    def perform_create(self, serializer):
        serializer.save(champ_id=self.kwargs['champ_id'])


class ChampPersonnaliseOptionDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ChampPersonnaliseOptionSerializer
    permission_classes = [IsAdmin]
    queryset = ChampPersonnaliseOption.objects.all()


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
    queryset = SystemFieldLabel.objects.order_by('code')


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


class TypeDocumentReorderView(APIView):
    """
    PUT /ref/types-documents/reorder/ — réordonne un groupe de types en une
    seule requête (ADMIN only). Body : {"order": ["<uuid>", "<uuid>", ...]}
    dans l'ordre final souhaité — réassigne un `ordre` séquentiel par
    paliers de 10 (même convention que ChampsOrdreReorderView).

    Toujours un seul groupe de fratrie à la fois : soit les catégories/
    types racine entre eux, soit les sous-types d'une même catégorie entre
    eux (jamais les deux mélangés — c'est le frontend, via handleMoveType/
    getRefColumns, qui calcule ce sous-ensemble avant d'appeler cet
    endpoint). Contourne volontairement TypeDocumentSerializer.validate_ordre
    (l'unicité entre types n'a de sens que pour une saisie manuelle isolée
    dans le formulaire d'édition, pas ici où toute la séquence est
    recalculée d'un coup).
    """
    permission_classes = [IsAdmin]

    def put(self, request):
        order = request.data.get('order') or []
        for idx, type_id in enumerate(order):
            TypeDocument.objects.filter(id=type_id).update(ordre=idx * 10)
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
        'motifs-archivage': MotifArchivage,
        'motifs-attestation': MotifArchivage,
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

            try:
                with transaction.atomic():
                    AuditLog.log(
                        request, AuditLog.Action.DELETE_REF, target=instance,
                        details={'model': ModelClass.__name__, 'nom': _ref_label(instance)},
                    )
                    instance.delete()
            except ProtectedError:
                # Seul motifs-attestation est concerné aujourd'hui
                # (DemandeAttestation.motif, on_delete=PROTECT) — message
                # générique pour rester valable si un futur modèle référencé
                # ici gagne aussi une FK protégée.
                erreurs.append({
                    'id': id_, 'nom': instance.nom,
                    'erreur': "Des éléments dépendent encore de cette entrée.",
                })
                continue
            nb_supprimes += 1

        return Response({
            'nb_supprimes': nb_supprimes,
            'nb_erreurs': len(erreurs),
            'erreurs': erreurs,
        })


class ReferentielMergeView(APIView):
    """
    POST /api/ref/merge/{model}/
    Body : {"target_id": "<uuid>", "source_ids": ["<uuid>", ...]}
    Fusionne plusieurs entrées de référentiel en doublon (ex. "Personnal"
    et "Personnel", créées séparément par erreur de saisie/typo à
    l'import) en réassignant génériquement, via l'API de réflexion Django
    (model._meta.get_fields()), toutes les relations FK/M2M qui
    pointaient vers chaque source pour qu'elles pointent vers la cible,
    puis supprime les sources. Générique : ne nécessite pas d'énumérer
    chaque modèle appelant (Employee, Departement, Service, User.scope_*,
    Historique*, etc.) — un nouveau champ FK/M2M ajouté ailleurs dans
    l'app vers un de ces référentiels est automatiquement couvert. Ne
    couvre PAS TypeDocument/ChampPersonnalise (hiérarchie et règles
    propres, hors scope — voir ReferentielBulkDeleteView pour ces
    modèles).
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
        'motifs-archivage': MotifArchivage,
        'motifs-attestation': MotifArchivage,
    }

    MAX_SOURCES = 500

    def _reassigner(self, ModelClass, source, target):
        """Réassigne vers `target` toutes les relations FK/M2M entrantes
        qui pointaient vers `source`. Retourne le nombre de réassignations
        effectuées."""
        nb = 0
        for field in ModelClass._meta.get_fields():
            if getattr(field, 'one_to_many', False):
                # Reverse FK : field.field est la ForeignKey réelle
                # définie sur field.related_model, pointant vers ModelClass.
                related_model = field.related_model
                fk_name = field.field.name
                nb += related_model.objects.filter(**{fk_name: source}).update(**{fk_name: target})
            elif getattr(field, 'many_to_many', False) and getattr(field, 'auto_created', False):
                # Reverse M2M : field.field est le ManyToManyField réel
                # défini sur field.related_model (ex. User.scope_directions).
                related_model = field.related_model
                m2m_name = field.field.name
                for obj in related_model.objects.filter(**{m2m_name: source}):
                    manager = getattr(obj, m2m_name)
                    manager.add(target)
                    manager.remove(source)
                    nb += 1
        return nb

    def post(self, request, model):
        if model not in self.MODELS:
            return Response({'error': f'Modèle inconnu : {model}'}, status=400)

        ModelClass = self.MODELS[model]
        target_id = request.data.get('target_id')
        source_ids = request.data.get('source_ids')

        if not target_id:
            return Response({'error': 'target_id requis.'}, status=400)
        if not isinstance(source_ids, list) or not source_ids:
            return Response({'error': 'source_ids requis (liste non vide).'}, status=400)
        if len(source_ids) > self.MAX_SOURCES:
            return Response({'error': f'Trop de sources (maximum {self.MAX_SOURCES}).'}, status=400)
        if str(target_id) in {str(s) for s in source_ids}:
            return Response({'error': 'La cible ne peut pas être aussi une source.'}, status=400)

        target = ModelClass.objects.filter(pk=target_id).first()
        if not target:
            return Response({'error': 'Cible introuvable.'}, status=404)
        sources = list(ModelClass.objects.filter(pk__in=source_ids))
        if len(sources) != len(set(str(s) for s in source_ids)):
            return Response({'error': 'Une ou plusieurs sources sont introuvables.'}, status=404)

        # motifs-archivage et motifs-attestation partagent le même modèle
        # (MotifArchivage.categorie) — empêche de fusionner un motif d'un
        # espace vers l'autre par erreur (cible/sources doivent tous
        # appartenir à la catégorie de l'onglet appelé).
        if model in ('motifs-archivage', 'motifs-attestation'):
            categorie_attendue = 'archivage' if model == 'motifs-archivage' else 'attestation'
            if target.categorie != categorie_attendue or any(s.categorie != categorie_attendue for s in sources):
                return Response(
                    {'error': "Cible et sources doivent appartenir au même espace (Archivage / Attestation)."},
                    status=400,
                )

        try:
            with transaction.atomic():
                nb_total = 0
                sources_info = []
                for source in sources:
                    sources_info.append({'id': str(source.pk), 'nom': source.nom})
                    nb_total += self._reassigner(ModelClass, source, target)
                    source.delete()
        except Exception:
            return Response(
                {'error': "Fusion impossible : une contrainte empêche cette réassignation (ex. doublon créé sous la même cible)."},
                status=400,
            )

        AuditLog.objects.create(
            user=request.user,
            username_snapshot=request.user.username,
            action=AuditLog.Action.MERGE_REFERENTIEL,
            target_model=ModelClass.__name__,
            target_label=f"Fusion — {len(sources_info)} élément(s) vers \"{target.nom}\"",
            ip_address=AuditLog._get_ip(request),
            details={
                'model': model,
                'target': {'id': str(target.pk), 'nom': target.nom},
                'sources': sources_info,
                'nb_reassignes': nb_total,
            },
        )

        return Response({'nb_reassignes': nb_total, 'sources_supprimees': sources_info})

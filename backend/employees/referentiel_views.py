"""
employees/referentiel_views.py
CRUD pour les référentiels : Direction, Département, Service, Poste, TypeContrat, Catégorie
"""

from rest_framework import generics, serializers
from accounts.permissions import IsAdmin, IsAdminOrConsultant
from employees.models import Direction, Departement, Service, Poste, TypeContrat, Categorie


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
        return Direction.objects.all()

class DirectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DirectionSerializer
    permission_classes = [IsAdmin]
    queryset = Direction.objects.all()


class DepartementListCreateView(generics.ListCreateAPIView):
    serializer_class = DepartementSerializer
    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]
    def get_queryset(self):
        qs = Departement.objects.select_related('direction')
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
        qs = Service.objects.select_related('departement__direction')
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
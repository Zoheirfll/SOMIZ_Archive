from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import generics, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdmin
from audit.models import AuditLog
from employees.models import Employee, EmployeeAccessGrant, TypeDocument

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    scope_directions_nom = serializers.SerializerMethodField()
    scope_poles_nom = serializers.SerializerMethodField()
    scope_departements_nom = serializers.SerializerMethodField()
    scope_services_nom = serializers.SerializerMethodField()
    scope_cellules_nom = serializers.SerializerMethodField()
    scope_types_documents_nom = serializers.SerializerMethodField()
    employee_grants_count = serializers.SerializerMethodField()

    def get_employee_grants_count(self, obj):
        return obj.employee_grants.count()

    def get_scope_directions_nom(self, obj):
        return list(obj.scope_directions.values_list('nom', flat=True))

    def get_scope_poles_nom(self, obj):
        return list(obj.scope_poles.values_list('nom', flat=True))

    def get_scope_departements_nom(self, obj):
        return list(obj.scope_departements.values_list('nom', flat=True))

    def get_scope_services_nom(self, obj):
        return list(obj.scope_services.values_list('nom', flat=True))

    def get_scope_cellules_nom(self, obj):
        return list(obj.scope_cellules.values_list('nom', flat=True))

    def get_scope_types_documents_nom(self, obj):
        return list(obj.scope_types_documents.values_list('nom', flat=True))

    class Meta:
        model = User
        fields = [
            'id', 'username', 'nom', 'prenom', 'role', 'is_active', 'last_login',
            'scope_directions', 'scope_directions_nom',
            'scope_poles', 'scope_poles_nom',
            'scope_departements', 'scope_departements_nom',
            'scope_services', 'scope_services_nom',
            'scope_cellules', 'scope_cellules_nom',
            'scope_types_documents', 'scope_types_documents_nom',
            'employee_grants_count',
        ]
        read_only_fields = ['id', 'last_login']

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ['id', 'username', 'nom', 'prenom', 'role', 'password']
        read_only_fields = ['id']

    def validate_password(self, value):
        # min_length=10 ci-dessus déjà couvert par MinimumLengthValidator, mais
        # on passe aussi par validate_password() pour appliquer les autres
        # règles configurées (UserAttributeSimilarityValidator, CommonPassword...).
        temp_user = User(
            username=self.initial_data.get('username', ''),
            nom=self.initial_data.get('nom', ''),
            prenom=self.initial_data.get('prenom', ''),
        )
        try:
            validate_password(value, user=temp_user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdmin]
    queryset = User.objects.all().order_by('nom')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_USER, target=user,
            details={'username': user.username, 'role': user.role},
        )

class UserUpdateView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def perform_update(self, serializer):
        target = self.get_object()
        data = serializer.validated_data
        # Empêche de désactiver ou de rétrograder le dernier ADMIN actif
        is_demoting = (
            target.role == 'ADMIN' and
            (data.get('role', target.role) != 'ADMIN' or data.get('is_active', True) is False)
        )
        if is_demoting:
            remaining_admins = User.objects.filter(role='ADMIN', is_active=True).exclude(pk=target.pk).count()
            if remaining_admins == 0:
                raise ValidationError("Impossible : c'est le dernier compte ADMIN actif.")

        def _scope_snapshot(u):
            return {
                'role': u.role, 'is_active': u.is_active,
                'scope_directions': sorted(str(i) for i in u.scope_directions.values_list('id', flat=True)),
                'scope_poles': sorted(str(i) for i in u.scope_poles.values_list('id', flat=True)),
                'scope_departements': sorted(str(i) for i in u.scope_departements.values_list('id', flat=True)),
                'scope_services': sorted(str(i) for i in u.scope_services.values_list('id', flat=True)),
                'scope_cellules': sorted(str(i) for i in u.scope_cellules.values_list('id', flat=True)),
                'scope_types_documents': sorted(str(i) for i in u.scope_types_documents.values_list('id', flat=True)),
            }

        before = _scope_snapshot(target)
        updated = serializer.save()
        after = _scope_snapshot(updated)
        if before != after:
            AuditLog.log(
                self.request, AuditLog.Action.MODIFY_USER, target=updated,
                details={'before': before, 'after': after},
            )

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError("Impossible de supprimer votre propre compte.")
        if instance.role == 'ADMIN':
            remaining_admins = User.objects.filter(
                role='ADMIN', is_active=True
            ).exclude(pk=instance.pk).count()
            if remaining_admins == 0:
                raise ValidationError("Impossible : c'est le dernier compte ADMIN actif.")
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_USER, target=instance,
            details={'username': instance.username, 'role': instance.role},
        )
        instance.delete()


class EmployeeAccessGrantSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    employee = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all())
    employee_nom = serializers.CharField(source='employee.nom', read_only=True)
    employee_prenom = serializers.CharField(source='employee.prenom', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    type_doc = serializers.PrimaryKeyRelatedField(
        queryset=TypeDocument.objects.all(), allow_null=True, required=False
    )
    type_doc_nom = serializers.CharField(source='type_doc.nom', read_only=True, default=None)

    def validate_type_doc(self, value):
        if value is not None and value.is_categorie:
            raise serializers.ValidationError(
                "Impossible d'accorder un accès sur une catégorie — choisissez un type de document précis."
            )
        return value


class EmployeeGrantsView(APIView):
    """
    GET/PUT /api/admin-users/<id>/employee-grants/ — périmètre "employés
    spécifiques" d'un compte CONSULTANT (ADMIN only). PUT remplace
    l'ensemble des grants en une requête (même pattern que le périmètre
    organisationnel, voir UserUpdateView.perform_update).
    """
    permission_classes = [IsAdmin]

    def _target(self, pk):
        return generics.get_object_or_404(User, pk=pk)

    def get(self, request, pk):
        target = self._target(pk)
        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc')
        return Response({'grants': EmployeeAccessGrantSerializer(grants, many=True).data})

    def put(self, request, pk):
        target = self._target(pk)
        serializer = EmployeeAccessGrantSerializer(data=request.data.get('grants', []), many=True)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            EmployeeAccessGrant.objects.filter(user=target).delete()
            created = [
                EmployeeAccessGrant(
                    user=target,
                    employee=row['employee'],
                    type_doc=row.get('type_doc'),
                    granted_by=request.user,
                )
                for row in serializer.validated_data
            ]
            # unique_together (user, employee, type_doc) : dédoublonner les
            # lignes identiques envoyées par erreur par le frontend plutôt
            # que de laisser bulk_create lever une IntegrityError.
            seen = set()
            deduped = []
            for grant in created:
                key = (grant.employee_id, grant.type_doc_id)
                if key not in seen:
                    seen.add(key)
                    deduped.append(grant)
            EmployeeAccessGrant.objects.bulk_create(deduped)

        AuditLog.log(
            request, AuditLog.Action.MODIFY_USER, target=target,
            details={
                'action': 'employee_grants',
                'grants': [
                    {
                        'employee': g.employee.matricule,
                        'type_doc': g.type_doc.nom if g.type_doc_id else 'dossier complet',
                    }
                    for g in deduped
                ],
            },
        )

        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc')
        return Response({'grants': EmployeeAccessGrantSerializer(grants, many=True).data})
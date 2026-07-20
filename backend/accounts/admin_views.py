from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsAdmin
from audit.models import AuditLog

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'nom', 'prenom', 'role', 'is_active', 'last_login']
        read_only_fields = ['id', 'last_login']

class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)

    class Meta:
        model = User
        fields = ['username', 'nom', 'prenom', 'role', 'password']

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

class UserUpdateView(generics.UpdateAPIView):
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
                from rest_framework.exceptions import ValidationError
                raise ValidationError("Impossible : c'est le dernier compte ADMIN actif.")

        before = {'role': target.role, 'is_active': target.is_active}
        updated = serializer.save()
        after = {'role': updated.role, 'is_active': updated.is_active}
        if before != after:
            AuditLog.log(
                self.request, AuditLog.Action.MODIFY_USER, target=updated,
                details={'before': before, 'after': after},
            )
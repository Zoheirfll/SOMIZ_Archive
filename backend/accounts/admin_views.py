from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import generics, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsAdmin, visible_accounts
from audit.models import AuditLog
from employees.models import ChampPersonnalise, Employee, EmployeeAccessGrant, TypeDocument

User = get_user_model()

# Comptes ADMIN / GESTIONNAIRE = personnel de l'entreprise : liés à leur fiche
# employé (2026-10-31, securite.md point 55). Obligatoire à la création, au
# passage à l'un de ces rôles, et un compte lié ne peut plus être délié ; les
# comptes existants sans fiche restent utilisables (signalés « Sans fiche » sur
# /users) jusqu'à régularisation. SUPERADMIN exempté (compte de secours).
ROLES_FICHE_OBLIGATOIRE = ('ADMIN', 'GESTIONNAIRE')
MSG_FICHE_OBLIGATOIRE = "Un compte Administrateur ou Gestionnaire doit être lié à la fiche employé de son titulaire."


class FicheEmployeMixin:
    """Champ `employee` (fiche liée) partagé par la création et la
    modification de compte, + `employee_info` en lecture."""

    def get_employee_info(self, obj):
        e = obj.employee
        if e is None:
            return None
        return {'id': str(e.id), 'matricule': e.matricule, 'nom': e.nom, 'prenom': e.prenom, 'statut': e.statut}

    def validate_employee(self, value):
        if value is None:
            return None
        if value.statut != Employee.Statut.ACTIF:
            raise serializers.ValidationError("Cette fiche n'est pas active (employé sorti) : impossible d'y lier un compte.")
        autre = User.objects.filter(employee=value)
        if self.instance is not None:
            autre = autre.exclude(pk=self.instance.pk)
        autre = autre.first()
        if autre:
            raise serializers.ValidationError(f"Cette fiche est déjà liée au compte « {autre.username} ».")
        return value

    def _verifier_fiche(self, attrs):
        instance = self.instance
        role = attrs.get('role', instance.role if instance else None)
        employee = attrs['employee'] if 'employee' in attrs else (instance.employee if instance else None)
        if role in ROLES_FICHE_OBLIGATOIRE and employee is None:
            creation = instance is None
            changement_role = instance is not None and instance.role != role
            deliaison = instance is not None and 'employee' in attrs and instance.employee_id
            if creation or changement_role or deliaison:
                raise serializers.ValidationError({'employee': MSG_FICHE_OBLIGATOIRE})
        if 'employee' in attrs and employee is not None:
            # Identité reprise de la fiche : pas d'écart nom/prénom entre le compte et le dossier RH.
            attrs['nom'], attrs['prenom'] = employee.nom, employee.prenom
        return attrs


class UserSerializer(FicheEmployeMixin, serializers.ModelSerializer):
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True,
    )
    employee_info = serializers.SerializerMethodField()
    scope_directions_nom = serializers.SerializerMethodField()
    scope_poles_nom = serializers.SerializerMethodField()
    scope_departements_nom = serializers.SerializerMethodField()
    scope_services_nom = serializers.SerializerMethodField()
    scope_cellules_nom = serializers.SerializerMethodField()
    scope_sections_nom = serializers.SerializerMethodField()
    scope_types_documents_nom = serializers.SerializerMethodField()
    scope_champs_personnels_nom = serializers.SerializerMethodField()
    employee_grants_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    fonction = serializers.CharField(read_only=True)

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by_id else None

    def get_updated_by_name(self, obj):
        return obj.updated_by.full_name if obj.updated_by_id else None

    def get_employee_grants_count(self, obj):
        # Nombre d'EMPLOYÉS distincts avec un grant, pas de lignes (un
        # employé peut avoir plusieurs lignes, une par type de document).
        return obj.employee_grants.values('employee_id').distinct().count()

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

    def get_scope_sections_nom(self, obj):
        return list(obj.scope_sections.values_list('nom', flat=True))

    def get_scope_types_documents_nom(self, obj):
        return list(obj.scope_types_documents.values_list('nom', flat=True))

    def get_scope_champs_personnels_nom(self, obj):
        return list(obj.scope_champs_personnels.values_list('nom', flat=True))

    class Meta:
        model = User
        fields = [
            'id', 'username', 'nom', 'prenom', 'fonction', 'role', 'libelle_role', 'charge_attestation',
            'charge_consultation', 'charge_registre', 'charge_conge', 'acces_statistiques',
            'peut_demander_attestation', 'peut_demander_consultation', 'peut_demander_conge',
            'is_active', 'last_login',
            'scope_directions', 'scope_directions_nom',
            'scope_poles', 'scope_poles_nom',
            'scope_departements', 'scope_departements_nom',
            'scope_services', 'scope_services_nom',
            'scope_cellules', 'scope_cellules_nom',
            'scope_sections', 'scope_sections_nom',
            'scope_types_documents', 'scope_types_documents_nom',
            'scope_champs_personnels', 'scope_champs_personnels_nom',
            'employee_grants_count', 'employee', 'employee_info',
            'created_by_name', 'updated_by_name', 'date_joined', 'updated_at',
        ]
        read_only_fields = ['id', 'last_login', 'date_joined', 'updated_at']

    def validate_role(self, value):
        # Même règle qu'à la création — voir UserCreateSerializer.validate_role.
        if value == 'SUPERADMIN':
            raise serializers.ValidationError(
                "Le rôle Super-administrateur ne peut pas être attribué depuis cette interface."
            )
        # Seul un SUPERADMIN peut attribuer/conserver le rôle ADMIN — un
        # ADMIN ordinaire ne doit pas pouvoir se promouvoir ni promouvoir
        # quelqu'un d'autre à ADMIN (il ne peut créer/gérer que des
        # CONSULTANT). Un compte déjà ADMIN reste modifiable sur ses autres
        # champs par un ADMIN sans que ce garde-fou ne bloque (valeur
        # inchangée).
        already_admin = self.instance and self.instance.role == 'ADMIN'
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if value == 'ADMIN' and not already_admin and not (user and user.is_superadmin):
            raise serializers.ValidationError(
                "Seul un Super-administrateur peut attribuer le rôle Administrateur."
            )
        return value

    def validate_username(self, value):
        # La connexion (LoginView, UserManager.get_by_natural_key) est
        # désormais insensible à la casse ("Admin"/"admin" identiques) — deux
        # comptes qui ne different que par la casse seraient donc ambigus à
        # la connexion (l'un des deux deviendrait injoignable). La contrainte
        # `unique=True` du modèle reste sensible à la casse côté DB, d'où
        # cette vérification explicite en plus.
        qs = User.objects.filter(username__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Cet identifiant est déjà utilisé.")
        return value

    def validate(self, attrs):
        # charge_attestation n'a de sens que pour un ADMIN (voir
        # User.can_manage_attestations) — un compte qui n'est pas/plus
        # ADMIN ne doit jamais le garder coché, sinon il resterait "chargé"
        # silencieusement si son rôle change plus tard vers ADMIN sans
        # repasser par ce champ.
        role = attrs.get('role', self.instance.role if self.instance else None)
        if role != 'ADMIN':
            attrs['charge_attestation'] = False
            attrs['charge_consultation'] = False
            attrs['charge_registre'] = False
            attrs['charge_conge'] = False
        # Statistiques RH : ADMIN ou CONSULTANT (2026-11-01).
        if role not in ('ADMIN', 'CONSULTANT'):
            attrs['acces_statistiques'] = False
        # peut_demander_* : pendant demandeur, pour GESTIONNAIRE/CONSULTANT
        # uniquement (même logique de remise à zéro en cas de changement de rôle).
        if role not in ('GESTIONNAIRE', 'CONSULTANT'):
            attrs['peut_demander_attestation'] = False
            attrs['peut_demander_consultation'] = False
            attrs['peut_demander_conge'] = False
        return self._verifier_fiche(attrs)

    def validate_charge_consultation(self, value):
        return _reserve_au_superadmin(self, value, self.instance.charge_consultation if self.instance else False)

    def validate_charge_registre(self, value):
        return _reserve_au_superadmin(
            self, value, self.instance.charge_registre if self.instance else False, "aux registres d'archives",
        )

    def validate_charge_attestation(self, value):
        return _reserve_au_superadmin(
            self, value, self.instance.charge_attestation if self.instance else False, "aux attestations de travail",
        )

    def validate_charge_conge(self, value):
        return _reserve_au_superadmin(
            self, value, self.instance.charge_conge if self.instance else False, "aux demandes de congé",
        )

    def validate_acces_statistiques(self, value):
        return _reserve_au_superadmin(
            self, value, self.instance.acces_statistiques if self.instance else False, "aux statistiques RH",
        )


def _reserve_au_superadmin(serializer, value, valeur_actuelle, objet="aux consultations d'archives"):
    """Donner un accès traiteur (consultations d'archives, attestations de
    travail : données confidentielles) est réservé à un SUPERADMIN : sans ce
    garde-fou, un ADMIN ordinaire pourrait se cocher lui-même le drapeau via
    l'API. Une valeur inchangée reste acceptée (PATCH d'autres champs avec le
    formulaire complet)."""
    request = serializer.context.get('request')
    user = getattr(request, 'user', None)
    if value != valeur_actuelle and not (user and user.is_superadmin):
        raise serializers.ValidationError(
            f"Seul un Super-administrateur peut attribuer l'accès {objet}."
        )
    return value


class UserCreateSerializer(FicheEmployeMixin, serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=10)
    employee = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True,
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'nom', 'prenom', 'role', 'libelle_role',
            'charge_attestation', 'charge_consultation', 'charge_registre', 'charge_conge', 'acces_statistiques',
            'peut_demander_attestation', 'peut_demander_consultation', 'peut_demander_conge', 'password',
            'employee',
        ]
        read_only_fields = ['id']

    def validate_charge_consultation(self, value):
        return _reserve_au_superadmin(self, value, False)

    def validate_charge_registre(self, value):
        return _reserve_au_superadmin(self, value, False, "aux registres d'archives")

    def validate_charge_attestation(self, value):
        return _reserve_au_superadmin(self, value, False, "aux attestations de travail")

    def validate_charge_conge(self, value):
        return _reserve_au_superadmin(self, value, False, "aux demandes de congé")

    def validate_acces_statistiques(self, value):
        return _reserve_au_superadmin(self, value, False, "aux statistiques RH")

    def validate_role(self, value):
        # SUPERADMIN ne peut jamais être créé/attribué via l'API — un
        # ADMIN ne doit pas pouvoir se promouvoir ni promouvoir quelqu'un
        # d'autre. Uniquement via `manage.py shell` / accès direct base.
        # Un compte déjà SUPERADMIN reste modifiable sur ses autres champs
        # sans que ce garde-fou ne bloque (valeur inchangée).
        already_superadmin = self.instance and self.instance.role == 'SUPERADMIN'
        if value == 'SUPERADMIN' and not already_superadmin:
            raise serializers.ValidationError(
                "Le rôle Super-administrateur ne peut pas être attribué depuis cette interface."
            )
        # Seul un SUPERADMIN peut créer un compte ADMIN — un ADMIN ordinaire
        # ne peut créer que des comptes CONSULTANT.
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if value == 'ADMIN' and not (user and user.is_superadmin):
            raise serializers.ValidationError(
                "Seul un Super-administrateur peut créer un compte Administrateur."
            )
        return value

    def validate_username(self, value):
        # Même règle que UserSerializer.validate_username — la connexion est
        # insensible à la casse, deux comptes "Admin"/"admin" seraient donc
        # ambigus.
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Cet identifiant est déjà utilisé.")
        return value

    def validate(self, attrs):
        # Même garde-fou qu'en modification (UserSerializer.validate) —
        # charge_attestation ne peut être coché qu'à la création d'un ADMIN.
        if attrs.get('role') != 'ADMIN':
            attrs['charge_attestation'] = False
            attrs['charge_consultation'] = False
            attrs['charge_registre'] = False
            attrs['charge_conge'] = False
        if attrs.get('role') not in ('ADMIN', 'CONSULTANT'):
            attrs['acces_statistiques'] = False
        if attrs.get('role') not in ('GESTIONNAIRE', 'CONSULTANT'):
            attrs['peut_demander_attestation'] = False
            attrs['peut_demander_consultation'] = False
            attrs['peut_demander_conge'] = False
        return self._verifier_fiche(attrs)

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
        request = self.context.get('request')
        creator = getattr(request, 'user', None)
        user = User(created_by=creator, **validated_data)
        user.set_password(password)
        user.save()
        return user

class UserListPagination(PageNumberPagination):
    """25 comptes par page (jusqu'à 100 via `page_size`) ; la réponse ajoute
    `compteurs` : nombre de comptes par rôle pour la recherche en cours (hors
    filtre de rôle), pour les onglets de /users."""
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        reponse = super().get_paginated_response(data)
        reponse.data['compteurs'] = getattr(self, 'compteurs', {})
        return reponse


class UserListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAdmin]
    pagination_class = UserListPagination

    def _recherche(self, qs):
        q = (self.request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(
                Q(username__icontains=q) | Q(nom__icontains=q) | Q(prenom__icontains=q)
                | Q(libelle_role__icontains=q)
            )
        return qs

    def get_queryset(self):
        qs = User.objects.select_related('employee__poste').order_by('nom', 'prenom', 'username')
        # Périmètre de visibilité des comptes : voir visible_accounts.
        qs = visible_accounts(qs, self.request.user)
        qs = self._recherche(qs)
        if self.request.method == 'GET':
            # Compteurs calculés avant le filtre de rôle (un onglet affiche
            # le total de son rôle, quel que soit l'onglet ouvert). order_by()
            # vide : sinon le tri par nom entre dans le GROUP BY et fausse le décompte.
            self.paginator.compteurs = {
                ligne['role']: ligne['n'] for ligne in qs.order_by().values('role').annotate(n=Count('id'))
            }
            roles = [r for r in (self.request.query_params.get('role') or '').split(',') if r]
            if roles:
                qs = qs.filter(role__in=roles)
            if self.request.query_params.get('fiche') == 'sans':
                # Comptes à régulariser : ADMIN/GESTIONNAIRE sans fiche employé liée.
                qs = qs.filter(role__in=ROLES_FICHE_OBLIGATOIRE, employee__isnull=True)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return UserCreateSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_USER, target=user,
            details={
                'username': user.username, 'role': user.role,
                'charge_attestation': user.charge_attestation,
                'charge_consultation': user.charge_consultation,
                'charge_registre': user.charge_registre,
                'peut_demander_attestation': user.peut_demander_attestation,
                'peut_demander_consultation': user.peut_demander_consultation,
                'charge_conge': user.charge_conge,
                'peut_demander_conge': user.peut_demander_conge,
                'acces_statistiques': user.acces_statistiques,
                'employee': user.employee.matricule if user.employee_id else None,
            },
        )

class UserUpdateView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdmin]
    serializer_class = UserSerializer

    def get_queryset(self):
        qs = User.objects.all()
        # Périmètre de visibilité des comptes : voir visible_accounts.
        qs = visible_accounts(qs, self.request.user)
        return qs

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
                # Droits « chargé de… » : attribuer ou retirer un accès à des
                # données confidentielles doit laisser une trace (trou corrigé
                # le 2026-10-11 : seuls rôle, activation et périmètres l'étaient).
                'charge_attestation': u.charge_attestation,
                'charge_consultation': u.charge_consultation,
                'charge_registre': u.charge_registre,
                'peut_demander_attestation': u.peut_demander_attestation,
                'peut_demander_consultation': u.peut_demander_consultation,
                'charge_conge': u.charge_conge,
                'peut_demander_conge': u.peut_demander_conge,
                'acces_statistiques': u.acces_statistiques,
                'employee': u.employee.matricule if u.employee_id else None,
                'scope_directions': sorted(str(i) for i in u.scope_directions.values_list('id', flat=True)),
                'scope_poles': sorted(str(i) for i in u.scope_poles.values_list('id', flat=True)),
                'scope_departements': sorted(str(i) for i in u.scope_departements.values_list('id', flat=True)),
                'scope_services': sorted(str(i) for i in u.scope_services.values_list('id', flat=True)),
                'scope_cellules': sorted(str(i) for i in u.scope_cellules.values_list('id', flat=True)),
                'scope_types_documents': sorted(str(i) for i in u.scope_types_documents.values_list('id', flat=True)),
                'scope_champs_personnels': sorted(str(i) for i in u.scope_champs_personnels.values_list('id', flat=True)),
            }

        before = _scope_snapshot(target)
        updated = serializer.save(updated_by=self.request.user)
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
    champ_personnel = serializers.PrimaryKeyRelatedField(
        queryset=ChampPersonnalise.objects.filter(categorie=ChampPersonnalise.Categorie.PERSONNEL),
        allow_null=True, required=False,
    )
    champ_personnel_nom = serializers.CharField(source='champ_personnel.nom', read_only=True, default=None)

    def validate_type_doc(self, value):
        if value is not None and value.is_categorie:
            raise serializers.ValidationError(
                "Impossible d'accorder un accès sur une catégorie — choisissez un type de document précis."
            )
        return value

    def validate(self, attrs):
        if attrs.get('type_doc') is not None and attrs.get('champ_personnel') is not None:
            raise serializers.ValidationError(
                "Un grant ne peut pas cibler à la fois un type de document et un champ personnel."
            )
        return attrs


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
        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc', 'champ_personnel')
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
                    champ_personnel=row.get('champ_personnel'),
                    granted_by=request.user,
                )
                for row in serializer.validated_data
            ]
            # unique_together (user, employee, type_doc, champ_personnel) :
            # dédoublonner les lignes identiques envoyées par erreur par le
            # frontend plutôt que de laisser bulk_create lever une
            # IntegrityError.
            seen = set()
            deduped = []
            for grant in created:
                key = (grant.employee_id, grant.type_doc_id, grant.champ_personnel_id)
                if key not in seen:
                    seen.add(key)
                    deduped.append(grant)
            EmployeeAccessGrant.objects.bulk_create(deduped)

        def _cible(g):
            if g.type_doc_id:
                return g.type_doc.nom
            if g.champ_personnel_id:
                return f"champ personnel : {g.champ_personnel.nom}"
            return 'dossier complet'

        AuditLog.log(
            request, AuditLog.Action.MODIFY_USER, target=target,
            details={
                'action': 'employee_grants',
                'grants': [
                    {
                        'employee': g.employee.matricule,
                        'type_doc': _cible(g),
                    }
                    for g in deduped
                ],
            },
        )

        grants = EmployeeAccessGrant.objects.filter(user=target).select_related('employee', 'type_doc', 'champ_personnel')
        return Response({'grants': EmployeeAccessGrantSerializer(grants, many=True).data})

# ─── Propositions de compte pour les responsables d'unité (2026-10-28) ──────

class PropositionCompteListView(APIView):
    """GET /api/admin-users/propositions/?statut=en_attente"""
    permission_classes = [IsAdmin]

    def get(self, request):
        from accounts.models import PropositionCompte
        qs = PropositionCompte.objects.select_related('employee', 'decide_par')
        statut = request.query_params.get('statut', PropositionCompte.Statut.EN_ATTENTE)
        if statut != 'tous':
            qs = qs.filter(statut=statut)
        return Response([{
            'id': str(p.id),
            'employee_id': str(p.employee_id),
            'employee_nom': f"{p.employee.prenom} {p.employee.nom}",
            'matricule': p.employee.matricule,
            'unite_type': p.unite_type,
            'unite_nom': p.unite_nom,
            'source': p.source,
            'statut': p.statut,
            'role_attribue': p.role_attribue,
            'motif_refus': p.motif_refus,
            'decide_par': p.decide_par.full_name if p.decide_par_id else None,
            'created_at': p.created_at,
        } for p in qs[:200]])


class PropositionCompteValiderView(APIView):
    """POST /api/admin-users/propositions/<id>/valider/ {role}
    Crée le compte et renvoie le mot de passe temporaire, UNE SEULE FOIS."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from django.shortcuts import get_object_or_404
        from accounts.models import PropositionCompte
        from accounts.propositions import PropositionError, valider_proposition
        proposition = get_object_or_404(PropositionCompte, pk=pk)
        try:
            user, mot_de_passe = valider_proposition(
                request, proposition, role=request.data.get('role', ''),
            )
        except PropositionError as e:
            raise ValidationError({'error': str(e)})
        response = Response({
            'user_id': str(user.id), 'username': user.username,
            'role': user.role, 'mot_de_passe_temporaire': mot_de_passe,
        }, status=201)
        response['Cache-Control'] = 'no-store'
        return response


class PropositionCompteRefuserView(APIView):
    """POST /api/admin-users/propositions/<id>/refuser/ {motif}"""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        from django.shortcuts import get_object_or_404
        from accounts.models import PropositionCompte
        from accounts.propositions import PropositionError, refuser_proposition
        proposition = get_object_or_404(PropositionCompte, pk=pk)
        try:
            refuser_proposition(request, proposition, motif=request.data.get('motif', ''))
        except PropositionError as e:
            raise ValidationError({'error': str(e)})
        return Response({'statut': 'refusee'})


class PropositionCompteRattrapageView(APIView):
    """Responsables désignés AVANT la mise en place des propositions de compte.

    GET  /api/admin-users/propositions/rattrapage/ — aperçu : qui n'a ni compte
         ni proposition (rien n'est créé).
    POST /api/admin-users/propositions/rattrapage/ — crée une proposition par
         responsable listé ; un ADMIN les valide ensuite une à une (aucun compte
         n'est créé ici)."""
    permission_classes = [IsAdmin]

    def get(self, request):
        from accounts.propositions import UNITES, responsables_sans_compte
        return Response([{
            'employee_id': str(emp.pk),
            'employee_nom': f"{emp.prenom} {emp.nom}",
            'matricule': emp.matricule,
            'unites': [{'type': UNITES[u.__class__.__name__], 'nom': u.nom} for u in unites],
        } for emp, unites in responsables_sans_compte()])

    def post(self, request):
        from accounts.propositions import proposer_rattrapage
        return Response({'propositions_creees': proposer_rattrapage(request)}, status=201)

"""
apps/employees/views.py
API Views — CRUD Employés + Upload + Viewer inline sécurisé
"""

import mimetypes
import os
import magic
from datetime import date as date_cls
from django.conf import settings
from django.core.files.base import File
from django.db import transaction
from django.db.models import Q, Count, Exists, OuterRef, Subquery, F
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import StreamingHttpResponse, Http404
from django.utils.encoding import smart_str
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser

from django.shortcuts import get_object_or_404
from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from employees.models import (
    Employee,
    EmployeeDocument,
    EmployeeDocumentFile,
    TypeDocument,
    Contrat,
    ChampPersonnalise,
    EmployeeChampValeur,
    HistoriqueFonction,
    HistoriqueCategorie,
    HistoriqueEchelle,
)
from employees.serializers import (
    EmployeeListSerializer,
    EmployeeDetailSerializer,
    EmployeeCreateUpdateSerializer,
    DocumentUploadSerializer,
    ScanImportSerializer,
    EmployeeDocumentSerializer,
    EmployeeDocumentFileSerializer,
    ContratListSerializer,
    ContratDetailSerializer,
    ContratCreateUpdateSerializer,
    HistoriqueFonctionSerializer,
    HistoriqueCategorieSerializer,
    HistoriqueEchelleSerializer,
)
from employees.pdf_utils import pdf_page_count, extract_pdf_pages, PdfExtractionError


def resolve_employee(raw, queryset=None):
    """Résout un employé à partir du segment d'URL `raw`, qui peut être soit
    un UUID brut (anciens liens), soit le matricule (URL lisible côté
    frontend — volontairement sans le nom, donnée personnelle qui n'a rien à
    faire dans une URL). Le split sur '-' tolère un éventuel suffixe
    cosmétique si jamais un lien de ce format existe encore, le matricule
    lui-même ne contenant jamais de tiret. Lève Http404 si introuvable.
    `queryset` permet de passer un queryset déjà scopé/filtré (sinon
    Employee.objects.all())."""
    qs = queryset if queryset is not None else Employee.objects.all()
    matricule = raw.split('-', 1)[0]
    obj = qs.filter(matricule=matricule).first()
    if obj is None:
        try:
            obj = qs.filter(pk=raw).first()
        except (ValueError, DjangoValidationError):
            obj = None
    if obj is None:
        raise Http404
    return obj


# ─── EMPLOYEES ────────────────────────────────────────────────────────────────

class EmployeeListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/employees/       → Liste paginée (ADMIN + CONSULTANT)
    POST /api/employees/       → Créer un employé (ADMIN only)
    """
    filter_backends = [filters.OrderingFilter]
    ordering_fields = [
    'nom', 'prenom', 'matricule', 'statut',
    'direction__nom', 'departement__nom',
    'service__nom', 'poste__nom', 'type_contrat__nom',
    'date_embauche', 'date_naissance',
    ]
    ordering = ['nom']

    def get_queryset(self):
        latest_contrat = Contrat.objects.filter(
            employee=OuterRef('pk')
        ).order_by('-date_debut', '-id')

        qs = Employee.objects.select_related(
            'direction', 'departement', 'service', 'cellule', 'section', 'poste', 'type_contrat'
        ).prefetch_related(
            'valeurs_personnalisees__champ'
        ).filter(self.request.user.employee_scope_q()).annotate(
            nb_documents=Count(
                'documents', filter=Q(documents__is_active=True), distinct=True
            ),
            nb_types_presents=Count(
                'documents__type_doc',
                filter=Q(documents__is_active=True),
                distinct=True,
            ),
            nb_types_obligatoires_presents=Count(
                'documents__type_doc',
                filter=Q(
                    documents__is_active=True,
                    documents__type_doc__obligatoire=True,
                ),
                distinct=True,
            ),
            numero_contrat_actif=Subquery(latest_contrat.values('numero_contrat')[:1]),
        )

        # Filtres via query params
        q = self.request.query_params.get('q')
        direction = self.request.query_params.get('direction')
        dept = self.request.query_params.get('departement')
        service = self.request.query_params.get('service')
        statut = self.request.query_params.get('statut')
        complet = self.request.query_params.get('dossier_complet')
        type_manquant = self.request.query_params.get('type_manquant')

        if q:
            qs = qs.filter(
                Q(nom__icontains=q) |
                Q(prenom__icontains=q) |
                Q(matricule__icontains=q) |
                Q(Exists(Contrat.objects.filter(
                    employee=OuterRef('pk'), numero_contrat__icontains=q
                )))
            )
        if service:
            qs = qs.filter(service=service)
        if dept:
            qs = qs.filter(departement=dept)
        if direction:
            qs = qs.filter(direction=direction)
        pole = self.request.query_params.get('pole')
        if pole:
            qs = qs.filter(departement__pole=pole)
        cellule = self.request.query_params.get('cellule')
        if cellule:
            qs = qs.filter(cellule=cellule)
        section = self.request.query_params.get('section')
        if section:
            qs = qs.filter(section=section)
        if statut:
            qs = qs.filter(statut=statut)

        if complet is not None:
            types_obligatoires = TypeDocument.objects.filter(
                obligatoire=True, is_active=True, sous_types__isnull=True
            )
            if complet.lower() in ('true', '1'):
                for t in types_obligatoires:
                    qs = qs.filter(documents__type_doc=t, documents__is_active=True)
                qs = qs.distinct()
            elif complet.lower() in ('false', '0'):
                incomplete_ids = qs
                for t in types_obligatoires:
                    incomplete_ids = incomplete_ids.filter(
                        documents__type_doc=t, documents__is_active=True
                    )
                qs = qs.exclude(pk__in=incomplete_ids.values('pk'))

        if type_manquant:
            qs = qs.exclude(
                documents__type_doc__code=type_manquant,
                documents__is_active=True,
            )

        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EmployeeCreateUpdateSerializer
        return EmployeeListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method == 'GET':
            context['types_total'] = TypeDocument.objects.filter(
                is_active=True, sous_types__isnull=True
            ).count()
            context['types_obligatoires_total'] = TypeDocument.objects.filter(
                obligatoire=True, is_active=True, sous_types__isnull=True
            ).count()
        return context

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def perform_create(self, serializer):
        employee = serializer.save(created_by=self.request.user)
        AuditLog.log(
            self.request, AuditLog.Action.CREATE_EMP,
            target=employee,
            details={'matricule': employee.matricule}
        )


class EmployeeAdjacentView(generics.GenericAPIView):
    """
    GET /api/employees/{id}/adjacent/ — employé précédent/suivant trié par
    N° Contrat (numero_contrat_actif du dernier contrat), pour naviguer
    directement depuis la fiche employé sans revenir à la liste. Respecte
    le même périmètre que EmployeeDetailView (404 si l'employé courant est
    hors périmètre — ne pas confirmer son existence).
    """
    permission_classes = [IsAdminOrConsultant]
    queryset = Employee.objects.all()

    def get_queryset(self):
        return self.queryset.filter(self.request.user.employee_scope_q())

    def get(self, request, pk):
        queryset = self.filter_queryset(self.get_queryset())
        employee = resolve_employee(pk, queryset)
        self.check_object_permissions(request, employee)

        latest_contrat = Contrat.objects.filter(
            employee=OuterRef('pk')
        ).order_by('-date_debut', '-id')
        ordered_ids = list(
            queryset.annotate(
                numero_contrat_actif=Subquery(latest_contrat.values('numero_contrat')[:1]),
            )
            .order_by(F('numero_contrat_actif').asc(nulls_last=True), 'nom', 'prenom', 'id')
            .values_list('id', flat=True)
        )
        try:
            idx = ordered_ids.index(employee.id)
        except ValueError:
            idx = None

        def summary(eid):
            if eid is None:
                return None
            e = Employee.objects.only('id', 'nom', 'prenom', 'matricule').get(pk=eid)
            return {'id': str(e.id), 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule}

        prev_id = ordered_ids[idx - 1] if idx not in (None, 0) else None
        next_id = ordered_ids[idx + 1] if idx is not None and idx < len(ordered_ids) - 1 else None
        return Response({'prev': summary(prev_id), 'next': summary(next_id)})


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/employees/{id}/   → Détail + documents (ADMIN + CONSULTANT)
    PATCH  /api/employees/{id}/   → Modifier (ADMIN only)
    DELETE /api/employees/{id}/   → Soft delete (ADMIN only)
    """
    queryset = Employee.objects.prefetch_related('documents', 'valeurs_personnalisees')

    def get_queryset(self):
        # 404 (pas 403) pour un employé hors périmètre — ne pas confirmer
        # son existence à un CONSULTANT qui n'y a pas accès.
        return self.queryset.filter(self.request.user.employee_scope_q())

    def get_object(self):
        queryset = self.filter_queryset(self.get_queryset())
        obj = resolve_employee(self.kwargs['pk'], queryset)
        self.check_object_permissions(self.request, obj)
        return obj

    def get_serializer_class(self):
        if self.request.method in ('PATCH', 'PUT'):
            return EmployeeCreateUpdateSerializer
        return EmployeeDetailSerializer

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        AuditLog.log(
            request, AuditLog.Action.VIEW,
            target=instance,
            details={'action': 'view_employee_file'}
        )
        return super().retrieve(request, *args, **kwargs)

    # Champs d'affectation organisationnelle — un changement sur l'un
    # d'eux constitue un "transfert" tracé séparément dans le détail de
    # l'audit log (voir perform_update), en plus du diff générique.
    TRANSFER_FIELDS = ['direction', 'departement', 'service', 'cellule', 'section']

    # Champs de progression de carrière — un changement crée une nouvelle
    # période dans l'historique dédié (voir HistoriqueFonction/Categorie),
    # en plus du diff générique.
    CARRIERE_AXES = {
        'poste': HistoriqueFonction,
        'categorie': HistoriqueCategorie,
    }

    def perform_update(self, serializer):
        instance = serializer.instance
        # Capturer les libellés AVANT save() : serializer.save() mute
        # `instance` en place (même objet Python), donc après le save on
        # ne peut plus lire les anciennes valeurs depuis `instance`.
        old_affectation = {
            field: (getattr(instance, field).nom if getattr(instance, field, None) else None)
            for field in self.TRANSFER_FIELDS
        }
        old_carriere = {
            field: getattr(instance, field)
            for field in self.CARRIERE_AXES
        }

        employee = serializer.save()

        # Convertir les dates en strings pour que JSON puisse les sérialiser
        details = {}
        for k, v in serializer.validated_data.items():
            if hasattr(v, 'isoformat'):  # date ou datetime
                details[k] = v.isoformat()
            elif hasattr(v, 'pk'):  # ForeignKey — on garde juste l'ID
                details[k] = str(v.pk)
            else:
                details[k] = str(v) if v is not None else None

        new_affectation = {
            field: (getattr(employee, field).nom if getattr(employee, field, None) else None)
            for field in self.TRANSFER_FIELDS
        }
        changed = {
            field: {'de': old_affectation[field], 'vers': new_affectation[field]}
            for field in self.TRANSFER_FIELDS
            if field in serializer.validated_data and old_affectation[field] != new_affectation[field]
        }

        today = date_cls.today()
        for field, model in self.CARRIERE_AXES.items():
            if field not in serializer.validated_data:
                continue
            new_value = getattr(employee, field)
            old_value = old_carriere[field]
            if (old_value.pk if old_value else None) == (new_value.pk if new_value else None):
                continue
            model.objects.filter(
                employee=employee, date_fin__isnull=True
            ).update(date_fin=today)
            if new_value is not None:
                model.objects.create(
                    employee=employee, date_debut=today,
                    created_by=self.request.user,
                    **{field: new_value},
                )
            changed[field] = {
                'de': old_value.nom if old_value else None,
                'vers': new_value.nom if new_value else None,
            }

        if changed:
            details['transfer'] = changed

        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP,
            target=employee,
            details=details
        )

    def perform_destroy(self, instance):
        """Soft delete — on archive, on ne supprime pas."""
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_EMP,
            target=instance,
            details={'matricule': instance.matricule, 'nom': instance.full_name}
        )
        instance.statut = Employee.Statut.ARCHIVE
        instance.save(update_fields=['statut'])


HISTORIQUE_AXES = {
    'fonctions': (HistoriqueFonction, HistoriqueFonctionSerializer),
    'categories': (HistoriqueCategorie, HistoriqueCategorieSerializer),
    'echelles': (HistoriqueEchelle, HistoriqueEchelleSerializer),
}


def _check_no_overlap(model, employee, date_debut, date_fin, exclude_pk=None):
    end = date_fin or date_cls.max
    qs = model.objects.filter(employee=employee)
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    for p in qs:
        p_end = p.date_fin or date_cls.max
        if date_debut <= p_end and p.date_debut <= end:
            raise DRFValidationError(
                "Cette période chevauche une période existante pour cet axe."
            )


class HistoriqueListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/employees/{emp_id}/historique/{axe}/  → Liste des périodes (ADMIN + CONSULTANT scopé)
    POST /api/employees/{emp_id}/historique/{axe}/  → Créer une période (ADMIN only)
    axe ∈ {fonctions, categories, echelles}
    """

    def get_permissions(self):
        return [IsAdmin()] if self.request.method == 'POST' else [IsAdminOrConsultant()]

    def _employee(self):
        employee = resolve_employee(self.kwargs['emp_id'])
        if not self.request.user.can_access_employee(employee):
            raise Http404
        return employee

    def _axe_config(self):
        axe = self.kwargs['axe']
        if axe not in HISTORIQUE_AXES:
            raise Http404
        return HISTORIQUE_AXES[axe]

    def get_serializer_class(self):
        return self._axe_config()[1]

    def get_queryset(self):
        model, _ = self._axe_config()
        return model.objects.filter(employee=self._employee())

    def perform_create(self, serializer):
        model, _ = self._axe_config()
        employee = self._employee()
        _check_no_overlap(
            model, employee,
            serializer.validated_data['date_debut'],
            serializer.validated_data.get('date_fin'),
        )
        instance = serializer.save(employee=employee, created_by=self.request.user)
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=employee,
            details={'action': f'historique_{self.kwargs["axe"]}_create', 'periode_id': str(instance.pk)}
        )


class HistoriqueDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET/PATCH/DELETE /api/historique/{axe}/{pk}/  (ADMIN only for write, ADMIN+CONSULTANT scopé for read)
    """

    def get_permissions(self):
        return [IsAdminOrConsultant()] if self.request.method == 'GET' else [IsAdmin()]

    def _axe_config(self):
        axe = self.kwargs['axe']
        if axe not in HISTORIQUE_AXES:
            raise Http404
        return HISTORIQUE_AXES[axe]

    def get_serializer_class(self):
        return self._axe_config()[1]

    def get_object(self):
        model, _ = self._axe_config()
        instance = get_object_or_404(model, pk=self.kwargs['pk'])
        if not self.request.user.can_access_employee(instance.employee):
            raise Http404
        return instance

    def perform_update(self, serializer):
        model, _ = self._axe_config()
        instance = serializer.instance
        _check_no_overlap(
            model, instance.employee,
            serializer.validated_data.get('date_debut', instance.date_debut),
            serializer.validated_data.get('date_fin', instance.date_fin),
            exclude_pk=instance.pk,
        )
        updated = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=updated.employee,
            details={'action': f'historique_{self.kwargs["axe"]}_update', 'periode_id': str(updated.pk)}
        )

    def perform_destroy(self, instance):
        employee = instance.employee
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP, target=employee,
            details={'action': f'historique_{self.kwargs["axe"]}_delete', 'periode_id': str(instance.pk)}
        )
        instance.delete()


class EmployeePhotoView(APIView):
    """
    GET    /api/employees/{id}/photo/  → Sert la photo inline (ADMIN + CONSULTANT scopé)
    POST   /api/employees/{id}/photo/  → Upload/remplace (ADMIN only)
    DELETE /api/employees/{id}/photo/  → Supprime (ADMIN only)
    """
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAdminOrConsultant()]
        return [IsAdmin()]

    def _get_employee(self, request, pk):
        employee = resolve_employee(pk)
        if not request.user.can_access_employee(employee):
            raise Http404
        return employee

    def get(self, request, pk):
        employee = self._get_employee(request, pk)
        if not employee.photo or not os.path.exists(employee.photo.path):
            raise Http404

        mime = magic.from_file(employee.photo.path, mime=True)
        response = StreamingHttpResponse(
            open(employee.photo.path, 'rb'), content_type=mime
        )
        response['Content-Disposition'] = 'inline; filename="photo"'
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def post(self, request, pk):
        employee = self._get_employee(request, pk)
        file = request.FILES.get('photo')
        if not file:
            return Response({'error': 'Aucune photo fournie.'}, status=status.HTTP_400_BAD_REQUEST)

        max_size = settings.MAX_PHOTO_SIZE_MB * 1024 * 1024
        if file.size > max_size:
            return Response(
                {'error': f'Photo trop lourde. Maximum {settings.MAX_PHOTO_SIZE_MB} Mo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        mime = magic.from_buffer(file.read(2048), mime=True)
        file.seek(0)
        if mime not in settings.ALLOWED_PHOTO_MIME_TYPES:
            return Response(
                {'error': f'Type non autorisé ({mime}). Formats acceptés : JPEG, PNG, WebP.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_path = employee.photo.path if employee.photo else None
        employee.photo = file
        employee.save(update_fields=['photo'])
        if old_path and os.path.isfile(old_path):
            try:
                os.remove(old_path)
            except OSError:
                pass

        AuditLog.log(
            request, AuditLog.Action.MODIFY_EMP,
            target=employee,
            details={'action': 'upload_photo'}
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, pk):
        employee = self._get_employee(request, pk)
        if employee.photo:
            employee.photo.delete(save=False)
            employee.save(update_fields=['photo'])
            AuditLog.log(
                request, AuditLog.Action.MODIFY_EMP,
                target=employee,
                details={'action': 'delete_photo'}
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeChampsPersonnalisesView(APIView):
    """
    PATCH /api/employees/{id}/champs/ — ADMIN uniquement.
    Payload : { "<champ_id>": "valeur", ... } — un upsert par champ actif
    fourni. Un champ omis dans le payload n'est pas touché.
    """
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        employee = resolve_employee(pk)

        champs = {str(c.id): c for c in ChampPersonnalise.objects.filter(is_active=True)}
        details = {}
        for champ_id, valeur in request.data.items():
            champ = champs.get(str(champ_id))
            if not champ:
                continue
            valeur = (valeur or '').strip()
            # EmployeeChampValeur.valeur est un CharField(max_length=500) —
            # rejeter explicitement plutôt que de laisser Postgres lever une
            # erreur non gérée (DataError -> 500) sur une valeur trop longue.
            if len(valeur) > 500:
                return Response(
                    {'error': f"Valeur trop longue pour le champ « {champ.nom} » (500 caractères max)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            obj, _ = EmployeeChampValeur.objects.update_or_create(
                employee=employee, champ=champ,
                defaults={'valeur': valeur},
            )
            details[champ.code] = obj.valeur

        if details:
            AuditLog.log(
                request, AuditLog.Action.MODIFY_EMP,
                target=employee,
                details={'champs_personnalises': details}
            )

        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── DOCUMENTS ────────────────────────────────────────────────────────────────

class DocumentListUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def _get_employee(self, emp_id):
        return resolve_employee(emp_id)

    def get(self, request, emp_id):
        employee = self._get_employee(emp_id)
        if not request.user.can_access_employee(employee):
            raise Http404("Employé introuvable.")
        docs = EmployeeDocument.objects.filter(employee=employee, is_active=True)
        type_ids = request.user.accessible_type_doc_ids_for_employee(employee)
        if type_ids is not None:
            docs = docs.filter(type_doc_id__in=type_ids)
        docs = docs.select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
        serializer = EmployeeDocumentSerializer(docs, many=True)
        return Response(serializer.data)

    def post(self, request, emp_id):
        employee = self._get_employee(emp_id)

        # Récupérer les fichiers — Django les met dans request.FILES
        files = request.FILES.getlist('files')
        type_doc_id = request.data.get('type_doc')
        notes = request.data.get('notes', '')

        if not files:
            return Response(
                {'error': 'Aucun fichier fourni.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DocumentUploadSerializer(data={
            'type_doc': type_doc_id,
            'files': files,
            'notes': notes,
        })

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Créer le conteneur EmployeeDocument
        doc = EmployeeDocument.objects.create(
            employee=employee,
            type_doc=serializer.validated_data['type_doc'],
            uploaded_by=request.user,
            notes=serializer.validated_data.get('notes', ''),
        )

        # Créer un EmployeeDocumentFile pour chaque fichier
        for ordre, file in enumerate(serializer.validated_data['files'], start=1):
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            EmployeeDocumentFile.objects.create(
                document=doc,
                file=file,
                file_name=file.name,
                file_size=file.size,
                mime_type=mime,
                ordre=ordre,
            )

        AuditLog.log(
            request, AuditLog.Action.UPLOAD,
            target=doc,
            details={
                'type': doc.type_doc.code,
                'version': doc.version,
                'nb_fichiers': doc.nb_fichiers,
            }
        )

        return Response(
            EmployeeDocumentSerializer(doc).data,
            status=status.HTTP_201_CREATED
        )


def _scan_import_file_name(source_name, pages):
    """Nom affiché d'un fichier issu du scan/import — garde le nom du
    fichier scanné (cohérent avec l'upload normal, qui conserve toujours
    le nom du fichier choisi, et préserve la traçabilité si le même type
    de document est réimporté plus tard). Pour une part obtenue par
    découpage de pages, ajoute juste la plage de pages entre parenthèses
    pour distinguer les morceaux d'un même fichier source."""
    base, ext = os.path.splitext(source_name)
    ext = ext or '.pdf'
    if pages:
        page_label = f"p{pages[0]}" if len(pages) == 1 else f"p{pages[0]}-{pages[-1]}"
        return f"{base} ({page_label}){ext}"
    return f"{base}{ext}"


class ScanImportView(APIView):
    """
    POST /api/employees/{emp_id}/documents/scan-import/
    Import groupé : plusieurs fichiers scannés (PDF multi-pages et/ou
    images) répartis en groupes, chaque groupe devenant un
    EmployeeDocument du dossier général de l'employé (jamais d'un
    contrat spécifique — un contrat a sa propre page dédiée pour ça).
    Un groupe qui échoue (page hors limites, etc.) n'annule pas les
    autres — chaque groupe est traité indépendamment.
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsAdmin]

    def post(self, request, emp_id):
        employee = resolve_employee(emp_id)

        serializer = ScanImportSerializer(data={
            'files': request.FILES.getlist('files'),
            'plan': request.data.get('plan', ''),
        })
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        created = []
        failed = []

        for group in serializer.validated_data['groups']:
            type_doc = group['type_doc']
            try:
                with transaction.atomic():
                    doc = EmployeeDocument.objects.create(
                        employee=employee,
                        type_doc=type_doc,
                        uploaded_by=request.user,
                        notes=group.get('notes', ''),
                    )
                    for ordre, part in enumerate(group['parts'], start=1):
                        source_file = part['file']
                        if part['is_image'] or part['pages'] is None:
                            source_file.seek(0)
                            file_to_save = source_file
                            file_name = _scan_import_file_name(source_file.name, None)
                        else:
                            total_pages = pdf_page_count(source_file)
                            if list(part['pages']) == list(range(1, total_pages + 1)):
                                source_file.seek(0)
                                file_to_save = source_file
                                file_name = _scan_import_file_name(source_file.name, None)
                            else:
                                extracted = extract_pdf_pages(source_file, part['pages'])
                                file_name = _scan_import_file_name(source_file.name, part['pages'])
                                file_to_save = File(extracted, name=file_name)

                        file_to_save.seek(0)
                        mime = magic.from_buffer(file_to_save.read(2048), mime=True)
                        file_to_save.seek(0)
                        EmployeeDocumentFile.objects.create(
                            document=doc,
                            file=file_to_save,
                            file_name=file_name,
                            file_size=file_to_save.size,
                            mime_type=mime,
                            ordre=ordre,
                        )

                AuditLog.log(
                    request, AuditLog.Action.UPLOAD,
                    target=doc,
                    details={
                        'type': doc.type_doc.code,
                        'version': doc.version,
                        'nb_fichiers': doc.nb_fichiers,
                        'via': 'scan_import',
                    }
                )
                created.append({
                    'type_doc': str(type_doc.id),
                    'type_doc_nom': type_doc.nom,
                    'document_id': str(doc.id),
                })
            except PdfExtractionError as exc:
                failed.append({
                    'type_doc': str(type_doc.id),
                    'type_doc_nom': type_doc.nom,
                    'error': str(exc),
                })

        return Response(
            {'created': created, 'failed': failed},
            status=status.HTTP_201_CREATED
        )


class FileViewerView(APIView):
    """
    GET /api/files/{file_id}/view/
    Sert un fichier individuel en inline.
    """
    permission_classes = [IsAdminOrConsultant]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'consultation'

    def get(self, request, file_id):
        try:
            file_obj = EmployeeDocumentFile.objects.select_related(
                'document__employee', 'document__type_doc'
            ).get(pk=file_id, is_active=True)
        except EmployeeDocumentFile.DoesNotExist:
            raise Http404

        if not request.user.can_access_document(file_obj.document.employee, file_obj.document.type_doc_id):
            raise Http404

        if not file_obj.file or not os.path.exists(file_obj.file.path):
            return Response(
                {'error': 'Fichier introuvable.'},
                status=status.HTTP_404_NOT_FOUND
            )

        AuditLog.log(
            request, AuditLog.Action.VIEW,
            target=file_obj.document,
            details={
                'employee': file_obj.document.employee.matricule,
                'type': file_obj.document.type_doc.code,
                'fichier': file_obj.file_name,
                'ordre': file_obj.ordre,
            }
        )

        mime = file_obj.mime_type or 'application/octet-stream'

        def file_iterator(path, chunk_size=8192):
            with open(path, 'rb') as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        response = StreamingHttpResponse(file_iterator(file_obj.file.path), content_type=mime)
        response['Content-Disposition'] = f'inline; filename="{smart_str(file_obj.file_name)}"'
        response['Content-Length'] = file_obj.file_size or os.path.getsize(file_obj.file.path)
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response['Pragma'] = 'no-cache'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'self'"
        return response


class FileDetailView(APIView):
    """
    PATCH  /api/files/{file_id}/ — renomme le fichier (ADMIN uniquement)
    DELETE /api/files/{file_id}/ — supprime définitivement (ADMIN uniquement)
    """
    permission_classes = [IsAdmin]

    def patch(self, request, file_id):
        try:
            file_obj = EmployeeDocumentFile.objects.get(pk=file_id)
        except EmployeeDocumentFile.DoesNotExist:
            raise Http404

        new_name = (request.data.get('file_name') or '').strip()
        if not new_name:
            return Response({'error': 'Le nom du fichier ne peut pas être vide.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_name) > 255:
            return Response({'error': 'Nom trop long (255 caractères max).'}, status=status.HTTP_400_BAD_REQUEST)

        old_name = file_obj.file_name
        file_obj.file_name = new_name
        file_obj.save(update_fields=['file_name'])

        AuditLog.log(
            request, AuditLog.Action.MODIFY_DOC,
            target=file_obj.document,
            details={'ancien_nom': old_name, 'nouveau_nom': new_name}
        )

        return Response(EmployeeDocumentFileSerializer(file_obj).data)

    def delete(self, request, file_id):
        try:
            file_obj = EmployeeDocumentFile.objects.get(pk=file_id)
        except EmployeeDocumentFile.DoesNotExist:
            raise Http404

        AuditLog.log(
            request, AuditLog.Action.DELETE_DOC,
            target=file_obj.document,
            details={'fichier': file_obj.file_name, 'ordre': file_obj.ordre}
        )

        document = file_obj.document
        file_path = file_obj.file.path if file_obj.file else None
        file_obj.delete()
        if file_path and os.path.isfile(file_path):
            try:
                os.remove(file_path)
            except OSError:
                pass

        # Si plus aucun fichier ne subsiste → supprimer le document aussi
        if not document.fichiers.exists():
            document.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)

class DocumentViewerView(APIView):
    """
    GET /api/documents/{doc_id}/view/
    Sert le fichier en mode INLINE uniquement — jamais en attachment.
    C'est la pièce centrale de la sécurité anti-téléchargement.
    """
    permission_classes = [IsAdminOrConsultant]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'consultation'

    def get(self, request, doc_id):
        try:
            doc = EmployeeDocument.objects.select_related('employee').get(
                pk=doc_id, is_active=True
            )
        except EmployeeDocument.DoesNotExist:
            raise Http404("Document introuvable.")

        if not request.user.can_access_document(doc.employee, doc.type_doc_id):
            raise Http404("Document introuvable.")

        # Le fichier physique vit sur EmployeeDocumentFile (un document peut
        # avoir plusieurs fichiers, ex. recto/verso) — on sert le premier actif.
        file_obj = doc.fichiers.filter(is_active=True).order_by('ordre').first()
        if not file_obj or not file_obj.file or not os.path.exists(file_obj.file.path):
            return Response(
                {'error': 'Fichier physique introuvable sur le serveur.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Log de consultation
        AuditLog.log(
            request, AuditLog.Action.VIEW,
            target=doc,
            details={
                'employee': doc.employee.matricule,
                'type': doc.type_document,
                'version': doc.version,
            }
        )

        # ─── Streaming sécurisé ───────────────────────────────────────────────
        mime = file_obj.mime_type or mimetypes.guess_type(file_obj.file.name)[0] or 'application/octet-stream'

        def file_iterator(path, chunk_size=8192):
            with open(path, 'rb') as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        response = StreamingHttpResponse(
            file_iterator(file_obj.file.path),
            content_type=mime,
        )

        # CRITIQUE : inline, JAMAIS attachment
        response['Content-Disposition'] = f'inline; filename="{smart_str(file_obj.file_name)}"'
        response['Content-Length'] = file_obj.file_size or os.path.getsize(file_obj.file.path)

        # Headers anti-cache et anti-fuite
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
        response['Pragma'] = 'no-cache'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        response['X-Content-Type-Options'] = 'nosniff'

        # Empêche le drag-and-drop depuis l'iframe
        response['Content-Security-Policy'] = "default-src 'self'"

        return response


class DocumentDeleteView(APIView):
    """DELETE /api/documents/{doc_id}/ — ADMIN uniquement"""
    permission_classes = [IsAdmin]

    def delete(self, request, doc_id):
        try:
            doc = EmployeeDocument.objects.get(pk=doc_id)
        except EmployeeDocument.DoesNotExist:
            raise Http404

        AuditLog.log(
            request, AuditLog.Action.DELETE_DOC,
            target=doc,
            details={'type': doc.type_document, 'version': doc.version}
        )

        file_paths = [f.file.path for f in doc.fichiers.all() if f.file]
        doc.delete()
        for path in file_paths:
            if os.path.isfile(path):
                try:
                    os.remove(path)
                except OSError:
                    pass

        return Response(status=status.HTTP_204_NO_CONTENT)


# ─── CONTRATS ─────────────────────────────────────────────────────────────────

class ContratListCreateView(APIView):
    """
    GET  /api/employees/{emp_id}/contrats/  → Liste des contrats (ADMIN + CONSULTANT)
    POST /api/employees/{emp_id}/contrats/  → Créer un contrat (ADMIN only)
    """
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def get(self, request, emp_id):
        employee = resolve_employee(emp_id)
        if not request.user.can_access_employee(employee):
            raise Http404
        contrats = employee.contrats.select_related('type_contrat').order_by('-date_debut', '-id')
        serializer = ContratListSerializer(contrats, many=True)
        return Response(serializer.data)

    def post(self, request, emp_id):
        employee = resolve_employee(emp_id)
        serializer = ContratCreateUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        contrat = serializer.save(employee=employee, created_by=request.user)
        AuditLog.log(
            request, AuditLog.Action.CREATE_EMP,
            target=employee,
            details={'action': 'create_contrat', 'numero_contrat': contrat.numero_contrat}
        )
        return Response(ContratListSerializer(contrat).data, status=status.HTTP_201_CREATED)


class ContratDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/contrats/{id}/  → Détail + documents du contrat
    PATCH  /api/contrats/{id}/  → Modifier (ADMIN only)
    DELETE /api/contrats/{id}/  → Supprimer (ADMIN only)
    """
    queryset = Contrat.objects.select_related('employee', 'type_contrat')

    def get_queryset(self):
        return self.queryset.filter(self.request.user.employee_scope_q(prefix='employee__'))

    def get_serializer_class(self):
        if self.request.method in ('PATCH', 'PUT'):
            return ContratCreateUpdateSerializer
        return ContratDetailSerializer

    def get_permissions(self):
        if self.request.method in ('PATCH', 'PUT', 'DELETE'):
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        AuditLog.log(
            request, AuditLog.Action.VIEW,
            target=instance.employee,
            details={'action': 'view_contrat', 'numero_contrat': instance.numero_contrat}
        )
        return super().retrieve(request, *args, **kwargs)

    def perform_update(self, serializer):
        contrat = serializer.save()
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP,
            target=contrat.employee,
            details={'action': 'modify_contrat', 'numero_contrat': contrat.numero_contrat}
        )

    def perform_destroy(self, instance):
        AuditLog.log(
            self.request, AuditLog.Action.DELETE_EMP,
            target=instance.employee,
            details={'action': 'delete_contrat', 'numero_contrat': instance.numero_contrat}
        )
        instance.delete()


class ContratDocumentListUploadView(APIView):
    """
    GET  /api/contrats/{contrat_id}/documents/  → Documents du contrat
    POST /api/contrats/{contrat_id}/documents/  → Upload vers le dossier du contrat
    """
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def get(self, request, contrat_id):
        contrat = get_object_or_404(Contrat.objects.select_related('employee'), pk=contrat_id)
        if not request.user.can_access_employee(contrat.employee):
            raise Http404
        docs = EmployeeDocument.objects.filter(contrat=contrat, is_active=True)
        type_ids = request.user.accessible_type_doc_ids_for_employee(contrat.employee, contrat_scope=True)
        if type_ids is not None:
            docs = docs.filter(type_doc_id__in=type_ids)
        docs = docs.select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
        serializer = EmployeeDocumentSerializer(docs, many=True)
        return Response(serializer.data)

    def post(self, request, contrat_id):
        contrat = get_object_or_404(Contrat, pk=contrat_id)
        files = request.FILES.getlist('files')
        type_doc_id = request.data.get('type_doc')
        notes = request.data.get('notes', '')

        if not files:
            return Response(
                {'error': 'Aucun fichier fourni.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = DocumentUploadSerializer(data={
            'type_doc': type_doc_id,
            'files': files,
            'notes': notes,
        })
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        doc = EmployeeDocument.objects.create(
            employee=contrat.employee,
            contrat=contrat,
            type_doc=serializer.validated_data['type_doc'],
            uploaded_by=request.user,
            notes=serializer.validated_data.get('notes', ''),
        )

        for ordre, file in enumerate(serializer.validated_data['files'], start=1):
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            EmployeeDocumentFile.objects.create(
                document=doc,
                file=file,
                file_name=file.name,
                file_size=file.size,
                mime_type=mime,
                ordre=ordre,
            )

        AuditLog.log(
            request, AuditLog.Action.UPLOAD,
            target=doc,
            details={
                'contrat': contrat.numero_contrat,
                'type': doc.type_doc.code,
                'version': doc.version,
                'nb_fichiers': doc.nb_fichiers,
            }
        )
        return Response(
            EmployeeDocumentSerializer(doc).data,
            status=status.HTTP_201_CREATED
        )


# ─── RECHERCHE RAPIDE ─────────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdminOrConsultant])
def employee_search(request):
    """
    GET /api/employees/search/?q=dupont
    Recherche rapide pour l'autocomplete (retourne max 10 résultats).
    """
    q = request.query_params.get('q', '').strip()
    if len(q) < 2:
        return Response([])

    latest_contrat = Contrat.objects.filter(employee=OuterRef('pk')).order_by('-date_debut', '-id')
    employees = Employee.objects.select_related(
        'direction', 'departement', 'service', 'poste', 'type_contrat'
    ).annotate(
        nb_documents=Count('documents', filter=Q(documents__is_active=True), distinct=True),
        nb_types_presents=Count('documents__type_doc', filter=Q(documents__is_active=True), distinct=True),
        nb_types_obligatoires_presents=Count(
            'documents__type_doc',
            filter=Q(documents__is_active=True, documents__type_doc__obligatoire=True),
            distinct=True,
        ),
        numero_contrat_actif=Subquery(latest_contrat.values('numero_contrat')[:1]),
    ).filter(
        Q(nom__icontains=q) |
        Q(prenom__icontains=q) |
        Q(matricule__icontains=q) |
        Q(contrats__numero_contrat__icontains=q),
        statut=Employee.Statut.ACTIF
    ).filter(request.user.employee_scope_q()).distinct()[:10]

    context = {
        'types_total': TypeDocument.objects.filter(is_active=True, sous_types__isnull=True).count(),
        'types_obligatoires_total': TypeDocument.objects.filter(
            obligatoire=True, is_active=True, sous_types__isnull=True
        ).count(),
    }
    return Response(EmployeeListSerializer(employees, many=True, context=context).data)

class EmployeeBulkDeleteView(APIView):
    """
    POST /api/employees/bulk-delete/
    action=archive → soft delete
    action=delete  → suppression définitive (irréversible)
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        ids = request.data.get('ids', [])
        action = request.data.get('action', 'archive')

        if not ids:
            return Response(
                {'error': 'Aucun employé sélectionné.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(ids) > 500:
            return Response(
                {'error': 'Maximum 500 employés par opération.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        employees = Employee.objects.filter(id__in=ids)
        nb = employees.count()

        if nb == 0:
            return Response(
                {'error': 'Aucun employé trouvé dans la sélection.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if action == 'delete':
            # Supprimer les fichiers physiques avant cascade DB pour éviter des orphelins
            file_paths = list(
                EmployeeDocumentFile.objects.filter(
                    document__employee__in=employees
                ).values_list('file', flat=True)
            )
            employees.delete()
            for path in file_paths:
                if path:
                    full_path = os.path.join(settings.MEDIA_ROOT, path)
                    if os.path.isfile(full_path):
                        try:
                            os.remove(full_path)
                        except OSError:
                            pass
            AuditLog.objects.create(
                user=request.user,
                username_snapshot=request.user.username,
                action=AuditLog.Action.DELETE_EMP,
                target_model='Employee',
                target_label=f'Suppression définitive — {nb} employé(s)',
                ip_address=AuditLog._get_ip(request),
                details={'ids': ids, 'nb': nb, 'action': 'delete'},
            )
            return Response({'nb_supprimes': nb})
        else:
            # Soft delete — archivage
            employees.update(statut=Employee.Statut.ARCHIVE)
            AuditLog.objects.create(
                user=request.user,
                username_snapshot=request.user.username,
                action=AuditLog.Action.DELETE_EMP,
                target_model='Employee',
                target_label=f'Archivage en masse — {nb} employé(s)',
                ip_address=AuditLog._get_ip(request),
                details={'ids': ids, 'nb': nb, 'action': 'archive'},
            )
            return Response({'nb_archives': nb})


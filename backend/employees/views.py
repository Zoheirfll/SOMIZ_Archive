"""
apps/employees/views.py
API Views — CRUD Employés + Upload + Viewer inline sécurisé
"""

import mimetypes
import os
import magic
from django.db.models import Q
from django.http import StreamingHttpResponse, Http404
from django.utils.encoding import smart_str
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
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
)
from employees.serializers import (
    EmployeeListSerializer,
    EmployeeDetailSerializer,
    EmployeeCreateUpdateSerializer,
    DocumentUploadSerializer,
    EmployeeDocumentSerializer,
    ContratListSerializer,
    ContratDetailSerializer,
    ContratCreateUpdateSerializer,
)



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
    'date_embauche',
    ]
    ordering = ['nom']

    def get_queryset(self):
        qs = Employee.objects.prefetch_related('documents')

        # Filtres via query params
        q = self.request.query_params.get('q')
        dept = self.request.query_params.get('departement')
        service = self.request.query_params.get('service')
        statut = self.request.query_params.get('statut')
        complet = self.request.query_params.get('dossier_complet')

        if q:
            qs = qs.filter(
                Q(nom__icontains=q) |
                Q(prenom__icontains=q) |
                Q(matricule__icontains=q) |
                Q(contrats__numero_contrat__icontains=q)
            ).distinct()
        if service:
            qs = qs.filter(service=service)
        if dept:
            qs = qs.filter(departement=dept)
        if statut:
            qs = qs.filter(statut=statut)

        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return EmployeeCreateUpdateSerializer
        return EmployeeListSerializer

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


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/employees/{id}/   → Détail + documents (ADMIN + CONSULTANT)
    PATCH  /api/employees/{id}/   → Modifier (ADMIN only)
    DELETE /api/employees/{id}/   → Soft delete (ADMIN only)
    """
    queryset = Employee.objects.prefetch_related('documents')

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
            # Log uniquement si ce n'est pas un appel interne
        if not request.query_params.get('no_log'):
            AuditLog.log(
            request, AuditLog.Action.VIEW,
            target=instance,
            details={'action': 'view_employee_file'}
        )
        return super().retrieve(request, *args, **kwargs)

    def perform_update(self, serializer):
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


# ─── DOCUMENTS ────────────────────────────────────────────────────────────────

class DocumentListUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAdminOrConsultant()]

    def _get_employee(self, emp_id):
        try:
            return Employee.objects.get(pk=emp_id)
        except Employee.DoesNotExist:
            raise Http404("Employé introuvable.")

    def get(self, request, emp_id):
        employee = self._get_employee(emp_id)
        docs = EmployeeDocument.objects.filter(
            employee=employee, is_active=True
        ).select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
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

class FileViewerView(APIView):
    """
    GET /api/files/{file_id}/view/
    Sert un fichier individuel en inline.
    """
    permission_classes = [IsAdminOrConsultant]

    def get(self, request, file_id):
        try:
            file_obj = EmployeeDocumentFile.objects.select_related(
                'document__employee', 'document__type_doc'
            ).get(pk=file_id, is_active=True)
        except EmployeeDocumentFile.DoesNotExist:
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


class FileDeleteView(APIView):
    """DELETE /api/files/{file_id}/ — ADMIN uniquement"""
    permission_classes = [IsAdmin]

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
        file_obj.is_active = False
        file_obj.save(update_fields=['is_active'])

        # Si plus aucun fichier actif → archiver le document aussi
        if not file_obj.document.fichiers.filter(is_active=True).exists():
            file_obj.document.is_active = False
            file_obj.document.save(update_fields=['is_active'])

        return Response(status=status.HTTP_204_NO_CONTENT)

class DocumentViewerView(APIView):
    """
    GET /api/documents/{doc_id}/view/
    Sert le fichier en mode INLINE uniquement — jamais en attachment.
    C'est la pièce centrale de la sécurité anti-téléchargement.
    """
    permission_classes = [IsAdminOrConsultant]

    def get(self, request, doc_id):
        try:
            doc = EmployeeDocument.objects.select_related('employee').get(
                pk=doc_id, is_active=True
            )
        except EmployeeDocument.DoesNotExist:
            raise Http404("Document introuvable.")

        # Vérifier que le fichier existe physiquement
        if not doc.file or not os.path.exists(doc.file.path):
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
        mime = doc.mime_type or mimetypes.guess_type(doc.file.name)[0] or 'application/octet-stream'

        def file_iterator(path, chunk_size=8192):
            with open(path, 'rb') as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        response = StreamingHttpResponse(
            file_iterator(doc.file.path),
            content_type=mime,
        )

        # CRITIQUE : inline, JAMAIS attachment
        response['Content-Disposition'] = f'inline; filename="{smart_str(doc.type_document)}.{doc.file.name.split(".")[-1]}"'
        response['Content-Length'] = doc.file_size or os.path.getsize(doc.file.path)

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

        # Soft delete — on garde la trace
        doc.is_active = False
        doc.save(update_fields=['is_active'])

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
        from django.db.models.functions import Cast
        from django.db.models import IntegerField
        employee = get_object_or_404(Employee, pk=emp_id)
        contrats = employee.contrats.select_related('type_contrat').annotate(
            num_int=Cast('numero_contrat', IntegerField())
        ).order_by('-num_int')
        serializer = ContratListSerializer(contrats, many=True)
        return Response(serializer.data)

    def post(self, request, emp_id):
        employee = get_object_or_404(Employee, pk=emp_id)
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
        if not request.query_params.get('no_log'):
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
        contrat = get_object_or_404(Contrat, pk=contrat_id)
        docs = EmployeeDocument.objects.filter(
            contrat=contrat, is_active=True
        ).select_related('uploaded_by', 'type_doc').prefetch_related('fichiers')
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

    employees = Employee.objects.filter(
        Q(nom__icontains=q) |
        Q(prenom__icontains=q) |
        Q(matricule__icontains=q),
        statut=Employee.Statut.ACTIF
    )[:10]

    return Response(EmployeeListSerializer(employees, many=True).data)

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
            # Suppression définitive
            employees.delete()
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


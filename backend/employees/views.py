"""
apps/employees/views.py
API Views — CRUD Employés + Upload + Viewer inline sécurisé
"""

import mimetypes
import os

from django.db.models import Q
from django.http import StreamingHttpResponse, Http404
from django.utils.encoding import smart_str
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser

from accounts.permissions import IsAdmin, IsAdminOrConsultant
from audit.models import AuditLog
from employees.models import Employee, EmployeeDocument
from employees.serializers import (
    EmployeeListSerializer,
    EmployeeDetailSerializer,
    EmployeeCreateUpdateSerializer,
    DocumentUploadSerializer,
    EmployeeDocumentSerializer,
)


# ─── EMPLOYEES ────────────────────────────────────────────────────────────────

class EmployeeListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/employees/       → Liste paginée (ADMIN + CONSULTANT)
    POST /api/employees/       → Créer un employé (ADMIN only)
    """
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['nom', 'matricule', 'departement', 'date_embauche']
    ordering = ['nom']

    def get_queryset(self):
        qs = Employee.objects.prefetch_related('documents')

        # Filtres via query params
        q = self.request.query_params.get('q')
        dept = self.request.query_params.get('departement')
        statut = self.request.query_params.get('statut')
        complet = self.request.query_params.get('dossier_complet')

        if q:
            qs = qs.filter(
                Q(nom__icontains=q) |
                Q(prenom__icontains=q) |
                Q(matricule__icontains=q)
            )
        if dept:
            qs = qs.filter(departement__icontains=dept)
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
        AuditLog.log(
            self.request, AuditLog.Action.MODIFY_EMP,
            target=employee,
            details=serializer.validated_data
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
    """
    GET  /api/employees/{emp_id}/documents/   → Lister les docs (ADMIN + CONSULTANT)
    POST /api/employees/{emp_id}/documents/   → Uploader un doc (ADMIN only)
    """
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
        ).select_related('uploaded_by')
        serializer = EmployeeDocumentSerializer(docs, many=True)
        return Response(serializer.data)

    def post(self, request, emp_id):
        employee = self._get_employee(emp_id)
        serializer = DocumentUploadSerializer(data=request.data)

        if serializer.is_valid():
            doc = serializer.save(
                employee=employee,
                uploaded_by=request.user
            )
            AuditLog.log(
                request, AuditLog.Action.UPLOAD,
                target=doc,
                details={
                    'type': doc.type_document,
                    'version': doc.version,
                    'size_kb': doc.file_size_kb,
                }
            )
            return Response(
                EmployeeDocumentSerializer(doc).data,
                status=status.HTTP_201_CREATED
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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

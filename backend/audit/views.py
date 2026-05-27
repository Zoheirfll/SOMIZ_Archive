"""
apps/audit/views.py
Journal d'audit + statistiques de complétude des dossiers
"""

from django.db.models import Count, Q
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from audit.models import AuditLog
from employees.models import Employee, EmployeeDocument


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = [
            'id', 'username_snapshot', 'action',
            'target_model', 'target_label',
            'ip_address', 'timestamp', 'details'
        ]


class AuditLogListView(APIView):
    """GET /api/admin/audit-logs/?user=&action=&page="""
    permission_classes = [IsAdmin]

    def get(self, request):
        qs = AuditLog.objects.select_related('user').order_by('-timestamp')

        # Filtres
        user_q = request.query_params.get('user')
        action = request.query_params.get('action')
        target = request.query_params.get('target')

        if user_q:
            qs = qs.filter(username_snapshot__icontains=user_q)
        if action:
            qs = qs.filter(action=action)
        if target:
            qs = qs.filter(target_label__icontains=target)

        # Pagination manuelle (50 par page)
        page = int(request.query_params.get('page', 1))
        size = 50
        total = qs.count()
        qs = qs[(page - 1) * size: page * size]

        return Response({
            'total': total,
            'page': page,
            'total_pages': (total // size) + 1,
            'results': AuditLogSerializer(qs, many=True).data,
        })


class AdminStatsView(APIView):
    """
    GET /api/admin/stats/
    Statistiques globales pour le dashboard admin.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        total_emp = Employee.objects.filter(statut='actif').count()

        # Taux de complétude par type de document
        types_requis = ['CNI', 'CONTRAT', 'FICHE_IEP']
        completude = {}
        for t in EmployeeDocument.TypeDocument.values:
            nb = EmployeeDocument.objects.filter(
                type_document=t, is_active=True
            ).values('employee').distinct().count()
            completude[t] = {
                'label': EmployeeDocument.TypeDocument(t).label,
                'nb_employes': nb,
                'pourcentage': round(nb / total_emp * 100, 1) if total_emp else 0,
                'required': t in types_requis,
            }

        # Dossiers complets (les 3 docs obligatoires présents)
        emp_with_all = Employee.objects.filter(statut='actif')
        for t in types_requis:
            emp_with_all = emp_with_all.filter(
                documents__type_document=t,
                documents__is_active=True
            )
        nb_complets = emp_with_all.distinct().count()

        # Activité récente (7 jours)
        from django.utils import timezone
        from datetime import timedelta
        since = timezone.now() - timedelta(days=7)
        activite = AuditLog.objects.filter(
            timestamp__gte=since
        ).values('action').annotate(count=Count('id')).order_by('-count')

        return Response({
            'employes_actifs': total_emp,
            'dossiers_complets': nb_complets,
            'taux_completude_global': round(nb_complets / total_emp * 100, 1) if total_emp else 0,
            'completude_par_type': completude,
            'activite_7_jours': list(activite),
            'total_documents': EmployeeDocument.objects.filter(is_active=True).count(),
        })

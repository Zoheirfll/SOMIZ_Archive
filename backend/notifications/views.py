from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer


class _MesNotificationsMixin:
    """Toujours restreint au compte connecté : la notification d'un autre
    compte renvoie 404, jamais 403 (pas de fuite d'existence)."""
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


class NotificationListView(_MesNotificationsMixin, generics.ListAPIView):
    serializer_class = NotificationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('non_lues') == '1':
            qs = qs.filter(read_at__isnull=True)
        return qs


class NotificationCompteurView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        n = Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()
        return Response({'non_lues': n})


class NotificationMarquerLueView(_MesNotificationsMixin, generics.GenericAPIView):
    serializer_class = NotificationSerializer

    def post(self, request, pk):
        notif = get_object_or_404(self.get_queryset(), pk=pk)
        if notif.read_at is None:
            notif.read_at = timezone.now()
            notif.save(update_fields=['read_at'])
        return Response(self.get_serializer(notif).data)


class NotificationToutLireView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        n = Notification.objects.filter(
            recipient=request.user, read_at__isnull=True,
        ).update(read_at=timezone.now())
        return Response({'marquees': n})

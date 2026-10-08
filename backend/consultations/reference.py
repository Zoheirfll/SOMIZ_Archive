from django.db import transaction
from django.utils import timezone

from .models import ConsultationReferenceCounter


def generate_reference():
    """Prochaine référence C-NNNNN/AA de l'année civile, sous verrou."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = ConsultationReferenceCounter.objects.select_for_update().get_or_create(
            annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"C-{numero:05d}/{annee % 100:02d}"

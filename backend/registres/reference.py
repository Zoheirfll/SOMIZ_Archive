from django.db import transaction
from django.utils import timezone

from .models import RegistreReferenceCounter


def generate_reference(prefix):
    """Prochaine référence <prefix>-NNNNN/AA de l'année civile, sous verrou."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = RegistreReferenceCounter.objects.select_for_update().get_or_create(
            type_registre=prefix, annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"{prefix}-{numero:05d}/{annee % 100:02d}"

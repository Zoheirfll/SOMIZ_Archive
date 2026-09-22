from django.db import transaction
from django.utils import timezone

from .models import ReferenceCounter


def generate_reference():
    """Génère et réserve la prochaine référence NNNNN/AA pour l'année civile
    en cours, sous verrou pour éviter toute collision entre créations
    concurrentes."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = ReferenceCounter.objects.select_for_update().get_or_create(
            annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"{numero:05d}/{annee % 100:02d}"

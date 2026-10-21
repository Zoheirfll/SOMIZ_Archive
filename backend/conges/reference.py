from django.db import transaction
from django.utils import timezone

from .models import ReferenceCounter


def generate_reference():
    """Prochaine référence NNNNN/AA de l'année civile, réservée sous verrou
    (pas de collision entre créations concurrentes). Compteur propre aux
    congés, indépendant des attestations."""
    annee = timezone.localdate().year
    with transaction.atomic():
        counter, _ = ReferenceCounter.objects.select_for_update().get_or_create(
            annee=annee, defaults={'dernier_numero': 0},
        )
        counter.dernier_numero += 1
        counter.save(update_fields=['dernier_numero'])
        numero = counter.dernier_numero
    return f"{numero:05d}/{annee % 100:02d}"

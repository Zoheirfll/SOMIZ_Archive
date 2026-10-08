from datetime import timedelta

from django.utils import timezone

from .models import DemandeConsultation
from .notifications import notifier_echeance

# Du plus proche au plus lointain : on n'envoie que le seuil le plus proche
# déjà franchi (jamais deux rappels d'un coup si la commande a du retard).
SEUILS = (
    ('1 h', timedelta(hours=1), 'rappel_1h_envoye'),
    ('24 h', timedelta(hours=24), 'rappel_24h_envoye'),
)


def notifier_echeances_consultation(now=None):
    """Rappelle l'échéance proche d'une consultation validée. Idempotent :
    chaque seuil n'est notifié qu'une fois par consultation (les drapeaux
    sont réinitialisés par une prolongation). Un seuil supérieur ou égal à
    la durée totale de la consultation est ignoré. Renvoie le nombre de
    rappels envoyés."""
    now = now or timezone.now()
    fenetre = now + max(seuil for _, seuil, _ in SEUILS)
    envoyes = 0
    demandes = DemandeConsultation.objects.filter(
        statut=DemandeConsultation.Statut.VALIDEE,
        date_echeance__gt=now, date_echeance__lte=fenetre,
    )
    for demande in demandes:
        reste = demande.date_echeance - now
        duree_totale = demande.date_echeance - demande.date_validation
        for libelle, seuil, champ in SEUILS:
            if reste <= seuil and duree_totale > seuil:
                if not getattr(demande, champ):
                    notifier_echeance(demande, libelle)
                    # Ce seuil et tous les seuils plus lointains sont soldés.
                    for _, seuil_autre, champ_autre in SEUILS:
                        if seuil_autre >= seuil:
                            setattr(demande, champ_autre, True)
                    demande.save(update_fields=[c for _, _, c in SEUILS])
                    envoyes += 1
                break
    return envoyes

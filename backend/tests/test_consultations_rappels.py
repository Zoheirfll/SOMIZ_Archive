from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone

from consultations.alerts import notifier_echeances_consultation
from consultations.models import DemandeConsultation
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def _regler(demande, validation, echeance):
    DemandeConsultation.objects.filter(pk=demande.pk).update(
        date_validation=validation, date_echeance=echeance,
        rappel_24h_envoye=False, rappel_1h_envoye=False,
    )
    demande.refresh_from_db()


def test_rappel_24h_envoye_une_seule_fois(
    demande_validee, gestionnaire_user, traiteur, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 1
    destinataires = set(Notification.objects.values_list('recipient_id', flat=True))
    assert destinataires == {gestionnaire_user.id, traiteur.id}
    notif = Notification.objects.filter(recipient=gestionnaire_user).get()
    assert notif.type == Notification.Type.CONSULTATION_ECHEANCE
    assert demande_validee.reference in notif.message
    assert '24 h' in notif.message
    # Idempotent
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    assert Notification.objects.count() == 2


def test_rappel_1h_apres_le_rappel_24h(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    with django_capture_on_commit_callbacks(execute=True):
        notifier_echeances_consultation(now)
    plus_tard = now + timedelta(hours=19, minutes=30)  # reste 30 min
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(plus_tard) == 1
    assert Notification.objects.filter(message__contains='1 h').exists()
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(plus_tard) == 0


def test_un_seul_rappel_si_les_deux_seuils_sont_deja_franchis(
    demande_validee, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(minutes=30))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 1
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    assert Notification.objects.filter(message__contains='1 h').exists()
    assert not Notification.objects.filter(message__contains='24 h').exists()


def test_consultation_courte_sans_rappel(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    # Durée totale d'1 h : aucun seuil n'est strictement inférieur à la durée.
    _regler(demande_validee, now - timedelta(minutes=30), now + timedelta(minutes=30))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0


def test_pas_de_rappel_hors_fenetre_ou_non_validee(
    demande_validee, demande_en_cours, django_capture_on_commit_callbacks,
):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=1), now + timedelta(hours=72))
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0
    _regler(demande_validee, now - timedelta(hours=48), now - timedelta(minutes=1))  # déjà expirée
    with django_capture_on_commit_callbacks(execute=True):
        assert notifier_echeances_consultation(now) == 0


def test_commande_de_gestion(demande_validee, django_capture_on_commit_callbacks):
    now = timezone.now()
    _regler(demande_validee, now - timedelta(hours=48), now + timedelta(hours=20))
    sortie = StringIO()
    with django_capture_on_commit_callbacks(execute=True):
        call_command('notifier_echeances_consultation', stdout=sortie)
    assert '1 rappel' in sortie.getvalue()

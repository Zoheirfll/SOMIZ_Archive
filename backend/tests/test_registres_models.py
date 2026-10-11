import pytest
from django.db import IntegrityError
from django.utils import timezone

from registres.models import MouvementArchive, ReceptionDocument, RegistreReferenceCounter
from registres.reference import generate_reference

pytestmark = pytest.mark.django_db


def test_reference_incrementale_par_type_et_par_annee():
    annee = timezone.localdate().year % 100
    assert generate_reference('M') == f"M-00001/{annee:02d}"
    assert generate_reference('M') == f"M-00002/{annee:02d}"
    # Chaque registre a son propre compteur.
    assert generate_reference('R') == f"R-00001/{annee:02d}"


def test_compteur_unique_par_type_et_annee():
    RegistreReferenceCounter.objects.create(type_registre='M', annee=2026, dernier_numero=1)
    with pytest.raises(IntegrityError):
        RegistreReferenceCounter.objects.create(type_registre='M', annee=2026, dernier_numero=5)


def test_mouvement_str_est_la_reference(admin_user):
    m = MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='Ali Ben', type_documents='Dossier',
        nombre_documents=3, date_depart=timezone.localdate(), saisi_par=admin_user,
    )
    assert str(m) == 'M-00001/26'
    assert m.is_active is True and m.date_retour is None


def test_reception_str_est_la_reference(admin_user):
    r = ReceptionDocument.objects.create(
        reference='R-00001/26', type_document='Courrier', nombre=2, expediteur='DRH',
        date_reception=timezone.localdate(), saisi_par=admin_user,
    )
    assert str(r) == 'R-00001/26'
    assert r.date_classement is None

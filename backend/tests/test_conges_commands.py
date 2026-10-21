from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from audit.models import AuditLog
from conges.models import MouvementConge, SoldeExercice
from conges.services import exercice_courant, exercice_precedent, exercice_suivant

pytestmark = pytest.mark.django_db

ACT = exercice_courant()
REL = exercice_precedent(ACT)
ANT = exercice_suivant(ACT)


def test_basculer_exercice_ouvre_l_anticipe_manquant_et_trace_l_audit(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    SoldeExercice.objects.filter(employee=employee, exercice=ANT).delete()  # 1er juillet passé
    out = StringIO()
    call_command('basculer_exercice', stdout=out)
    assert SoldeExercice.objects.get(employee=employee, exercice=ANT).restant == 30
    # aucun jour déplacé : les autres exercices sont intacts
    assert SoldeExercice.objects.get(employee=employee, exercice=REL).restant == 4
    assert SoldeExercice.objects.get(employee=employee, exercice=ACT).restant == 20
    assert "1 exercice(s) ouvert(s) pour 1 employé(s)" in out.getvalue()
    log = AuditLog.objects.filter(action=AuditLog.Action.BASCULE_CONGE).latest('id')
    assert log.username_snapshot == 'system:basculer_exercice'
    assert log.details['lignes_ouvertes'] == 1 and log.details['anticipe'] == ANT


def test_basculer_exercice_est_idempotente(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    avant = MouvementConge.objects.count()
    call_command('basculer_exercice', stdout=StringIO())
    call_command('basculer_exercice', stdout=StringIO())
    assert MouvementConge.objects.count() == avant  # tout est déjà ouvert : rien à faire
    assert not AuditLog.objects.filter(action=AuditLog.Action.BASCULE_CONGE).exists()


def test_verifier_soldes_passe_si_tout_est_coherent(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    out = StringIO()
    call_command('verifier_soldes_conges', stdout=out)
    assert "aucun écart" in out.getvalue().lower()


def test_verifier_soldes_signale_un_ecart_et_echoue(employee, solde_employe):
    solde_employe(reliquat=4, annuel=20)
    SoldeExercice.objects.filter(employee=employee, exercice=REL).update(droit=99)  # hors service
    with pytest.raises(CommandError) as exc:
        call_command('verifier_soldes_conges', stdout=StringIO())
    assert employee.matricule in str(exc.value)
    assert f"{REL}.droit" in str(exc.value)

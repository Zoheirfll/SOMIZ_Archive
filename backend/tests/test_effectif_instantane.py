# backend/tests/test_effectif_instantane.py
"""Photo mensuelle des effectifs : agrégats figés, sans donnée nominative."""
from datetime import date

import pytest

from employees.models import Employee
from reporting.instantanes import calculer_instantane, premier_du_mois
from reporting.models import EffectifInstantane

pytestmark = pytest.mark.django_db

PHOTO = date(2026, 10, 1)


def _emp(base, matricule, **kw):
    return Employee.objects.create(
        matricule=matricule, nom='X', prenom='Y', direction=base.direction,
        departement=base.departement, service=base.service, categorie=base.categorie,
        type_contrat=base.type_contrat, created_by=base.created_by, **kw,
    )


def test_premier_du_mois():
    assert premier_du_mois(date(2026, 10, 17)) == PHOTO


def test_compte_les_presents_a_la_date(employee):
    Employee.objects.filter(pk=employee.pk).update(date_embauche=date(2020, 1, 1), sexe='F',
                                                   date_naissance=date(1990, 5, 1))
    _emp(employee, 'E2', date_embauche=date(2026, 11, 1))                     # pas encore arrivé
    _emp(employee, 'E3', date_embauche=date(2019, 1, 1), statut='archive',
         date_sortie=date(2026, 9, 15))                                       # parti avant
    _emp(employee, 'E4', date_embauche=date(2019, 1, 1), statut='archive',
         date_sortie=date(2026, 10, 20))                                      # parti après : présent
    total = calculer_instantane(PHOTO)
    assert total == 2
    lignes = EffectifInstantane.objects.filter(date_photo=PHOTO)
    assert sum(l.nb for l in lignes) == 2
    f = lignes.get(sexe='F')
    assert (f.tranche_age, f.tranche_anciennete) == ('35-44', '5-10 ans')
    assert f.direction_nom == employee.direction.nom
    assert f.reconstitue is False


def test_archive_sans_date_de_sortie_est_exclu(employee):
    Employee.objects.filter(pk=employee.pk).update(statut='archive', date_embauche=date(2020, 1, 1))
    assert calculer_instantane(PHOTO) == 0


def test_actif_sans_date_embauche_compte_seulement_hors_reconstitution(employee):
    assert calculer_instantane(PHOTO) == 1
    assert calculer_instantane(date(2025, 1, 1), reconstitue=True) == 0


def test_idempotent(employee):
    calculer_instantane(PHOTO)
    calculer_instantane(PHOTO)
    assert sum(l.nb for l in EffectifInstantane.objects.filter(date_photo=PHOTO)) == 1


def test_libelles_figes_apres_renommage(employee):
    calculer_instantane(PHOTO)
    ancien = employee.direction.nom
    employee.direction.nom = 'Direction renommée'
    employee.direction.save()
    assert EffectifInstantane.objects.get(date_photo=PHOTO).direction_nom == ancien


def test_aucune_donnee_nominative():
    noms = {f.name for f in EffectifInstantane._meta.get_fields()}
    assert not noms & {'employee', 'matricule', 'nom', 'prenom'}


from django.core.management import call_command
from django.utils import timezone


def test_commande_photographie_le_mois_courant(employee):
    call_command('photo_effectifs')
    assert EffectifInstantane.objects.filter(
        date_photo=premier_du_mois(timezone.localdate()), reconstitue=False).exists()


def test_commande_date_explicite_ramenee_au_premier_du_mois(employee):
    call_command('photo_effectifs', '--date', '2026-10-17')
    assert EffectifInstantane.objects.filter(date_photo=PHOTO).exists()


def test_amorcage_reconstitue_sans_ecraser_une_vraie_photo(employee):
    Employee.objects.filter(pk=employee.pk).update(date_embauche=date(2020, 1, 1))
    mois_courant = premier_du_mois(timezone.localdate())
    call_command('photo_effectifs')                              # vraie photo du mois
    call_command('photo_effectifs', '--amorcer', '3')
    assert not EffectifInstantane.objects.filter(date_photo=mois_courant, reconstitue=True).exists()
    reconstitues = EffectifInstantane.objects.filter(reconstitue=True).values_list('date_photo', flat=True)
    assert len(set(reconstitues)) == 3

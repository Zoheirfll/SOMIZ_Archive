# backend/tests/test_compte_fiche_employe.py
"""Comptes ADMIN / GESTIONNAIRE liés à la fiche employé de leur titulaire
(2026-10-31, securite.md point 55) : obligation à la création et au passage
à ces rôles, pas de déliaison, identité reprise de la fiche, désactivation
automatique du compte quand l'employé sort (formulaire et archivage en masse)."""
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from employees.models import Employee

pytestmark = pytest.mark.django_db
User = get_user_model()
MDP = 'Passw0rd!Long1'


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _user(username, role, **extra):
    return User.objects.create_user(username=username, password=MDP, nom=username.title(), prenom='P', role=role,
                                    consent_loi1807_accepted_at=timezone.now(), **extra)


def _autre_employe(employee, matricule='EMP-002', **extra):
    return Employee.objects.create(
        matricule=matricule, nom='Martin', prenom='Luc', direction=employee.direction,
        departement=employee.departement, service=employee.service, poste=employee.poste,
        type_contrat=employee.type_contrat, categorie=employee.categorie, **extra,
    )


def _creer(acteur, **donnees):
    corps = {'username': 'nouveau', 'nom': 'X', 'prenom': 'Y', 'password': MDP, **donnees}
    return _client(acteur).post('/api/admin-users/', corps, format='json')


class TestLiaisonObligatoire:
    def test_creation_admin_sans_fiche_refusee(self, superadmin_user):
        resp = _creer(superadmin_user, role='ADMIN')
        assert resp.status_code == 400 and 'employee' in resp.data

    def test_creation_gestionnaire_sans_fiche_refusee(self, admin_user):
        resp = _creer(admin_user, role='GESTIONNAIRE')
        assert resp.status_code == 400 and 'employee' in resp.data

    def test_creation_consultant_sans_fiche_acceptee(self, admin_user):
        assert _creer(admin_user, role='CONSULTANT').status_code == 201

    def test_creation_avec_fiche_reprend_l_identite(self, superadmin_user, employee):
        resp = _creer(superadmin_user, role='ADMIN', employee=str(employee.pk))
        assert resp.status_code == 201, resp.data
        compte = User.objects.get(username='nouveau')
        assert compte.employee == employee and (compte.nom, compte.prenom) == ('Dupont', 'Jean')
        log = AuditLog.objects.filter(action=AuditLog.Action.CREATE_USER).latest('id')
        assert log.details['employee'] == 'EMP-001'

    def test_fiche_deja_liee_refusee(self, superadmin_user, employee):
        _user('deja', 'CONSULTANT', employee=employee)
        resp = _creer(superadmin_user, role='ADMIN', employee=str(employee.pk))
        assert resp.status_code == 400 and 'deja' in str(resp.data['employee'])

    def test_fiche_d_un_employe_sorti_refusee(self, superadmin_user, employee):
        sorti = _autre_employe(employee, statut=Employee.Statut.ARCHIVE)
        resp = _creer(superadmin_user, role='ADMIN', employee=str(sorti.pk))
        assert resp.status_code == 400 and 'employee' in resp.data

    def test_compte_existant_sans_fiche_reste_modifiable(self, superadmin_user, admin_user):
        # « Obligatoire à terme » : pas de blocage des comptes historiques.
        cible = _user('ancien', 'ADMIN')
        resp = _client(superadmin_user).patch(f'/api/admin-users/{cible.id}/', {'charge_registre': True}, format='json')
        assert resp.status_code == 200

    def test_deliaison_refusee(self, superadmin_user, admin_user, employee):
        cible = _user('lie', 'ADMIN', employee=employee)
        resp = _client(superadmin_user).patch(f'/api/admin-users/{cible.id}/', {'employee': None}, format='json')
        assert resp.status_code == 400 and 'employee' in resp.data

    def test_passage_a_gestionnaire_sans_fiche_refuse(self, admin_user):
        cible = _user('consult', 'CONSULTANT')
        resp = _client(admin_user).patch(f'/api/admin-users/{cible.id}/', {'role': 'GESTIONNAIRE'}, format='json')
        assert resp.status_code == 400 and 'employee' in resp.data

    def test_liaison_d_un_compte_existant_tracee(self, superadmin_user, admin_user, employee):
        cible = _user('alier', 'ADMIN')
        resp = _client(superadmin_user).patch(f'/api/admin-users/{cible.id}/', {'employee': str(employee.pk)},
                                              format='json')
        assert resp.status_code == 200 and resp.data['employee_info']['matricule'] == 'EMP-001'
        log = AuditLog.objects.filter(action=AuditLog.Action.MODIFY_USER, target_id=str(cible.id)).latest('id')
        assert log.details['before']['employee'] is None and log.details['after']['employee'] == 'EMP-001'

    def test_filtre_sans_fiche(self, superadmin_user, admin_user, employee):
        _user('lie2', 'ADMIN', employee=employee)
        noms = {u['username'] for u in
                _client(superadmin_user).get('/api/admin-users/', {'fiche': 'sans'}).data['results']}
        assert 'admin_test' in noms and 'lie2' not in noms


class TestDesactivationALaSortie:
    def test_archivage_par_le_formulaire(self, admin_user, employee):
        compte = _user('partant', 'GESTIONNAIRE', employee=employee)
        resp = _client(admin_user).patch(f'/api/employees/{employee.pk}/',
                                         {'statut': 'archive', 'date_sortie': '2026-01-31'}, format='json')
        assert resp.status_code == 200, resp.data
        compte.refresh_from_db()
        assert compte.is_active is False and compte.password_changed_at is not None
        assert AuditLog.objects.filter(action=AuditLog.Action.MODIFY_USER, target_id=str(compte.id),
                                       details__action='desactivation_sortie_employe').exists()

    def test_archivage_en_masse(self, admin_user, employee):
        compte = _user('partant2', 'ADMIN', employee=employee)
        resp = _client(admin_user).post('/api/employees/bulk-delete/',
                                        {'ids': [str(employee.pk)], 'action': 'archive', 'date_sortie': '2026-01-31'},
                                        format='json')
        assert resp.status_code == 200
        compte.refresh_from_db()
        assert compte.is_active is False
        log = AuditLog.objects.filter(details__action='desactivation_sortie_employe').latest('id')
        assert log.user == admin_user

    def test_superadmin_jamais_desactive(self, admin_user, superadmin_user, employee):
        superadmin_user.employee = employee
        superadmin_user.save()
        _client(admin_user).patch(f'/api/employees/{employee.pk}/',
                                  {'statut': 'archive', 'date_sortie': '2026-01-31'}, format='json')
        superadmin_user.refresh_from_db()
        assert superadmin_user.is_active is True

    def test_modification_sans_sortie_ne_desactive_pas(self, admin_user, employee):
        compte = _user('reste', 'ADMIN', employee=employee)
        _client(admin_user).patch(f'/api/employees/{employee.pk}/', {'telephone': '0555000000'}, format='json')
        compte.refresh_from_db()
        assert compte.is_active is True

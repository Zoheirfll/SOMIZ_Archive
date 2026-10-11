from datetime import date

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from registres.models import MouvementArchive

pytestmark = pytest.mark.django_db

URL = '/api/registres/mouvements/'


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _payload(**kw):
    base = {
        'nom_libre': 'Ali Ben', 'beneficiaire': 'M. Directeur', 'type_documents': 'Dossier',
        'nombre_documents': 3, 'date_depart': '2026-03-01',
    }
    base.update(kw)
    return base


def _slug(mouvement):
    return mouvement.reference.replace('/', '-')


# ── Permissions : sur de vraies routes métier, pas seulement le défaut DRF ──

@pytest.mark.parametrize('fixture', ['consultant_user', 'gestionnaire_user', 'admin_user'])
def test_comptes_non_autorises_refuses_sur_liste_et_creation(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 403
    assert client.post(URL, _payload(), format='json').status_code == 403


def test_anonyme_refuse():
    assert APIClient().get(URL).status_code in (401, 403)


@pytest.mark.parametrize('fixture', ['superadmin_user', 'registre_admin'])
def test_superadmin_et_traiteur_autorises(request, fixture):
    client = _client(request.getfixturevalue(fixture))
    assert client.get(URL).status_code == 200


def test_admin_sans_drapeau_refuse_sur_detail_retour_annuler(admin_user):
    m = MouvementArchive.objects.create(
        reference='M-00001/26', nom_libre='X', type_documents='D', date_depart=date(2026, 3, 1),
    )
    client = _client(admin_user)
    for suffixe, methode in [('', 'get'), ('retour/', 'post'), ('annuler/', 'post')]:
        reponse = getattr(client, methode)(f"{URL}{_slug(m)}/{suffixe}", {'motif': 'x'}, format='json')
        assert reponse.status_code == 403


# ── Création ──

def test_creation_attribue_reference_saisi_par_et_audit(registre_admin):
    reponse = _client(registre_admin).post(URL, _payload(), format='json')
    assert reponse.status_code == 201
    annee = timezone.localdate().year % 100
    assert reponse.data['reference'] == f"M-00001/{annee:02d}"
    m = MouvementArchive.objects.get()
    assert m.saisi_par == registre_admin
    assert AuditLog.objects.filter(action='CREATE_MOUVEMENT', target_id=str(m.pk)).exists()


def test_creation_exige_un_employe_ou_un_nom_libre(registre_admin):
    reponse = _client(registre_admin).post(URL, _payload(nom_libre=''), format='json')
    assert reponse.status_code == 400


def test_creation_avec_employe_copie_fonction_service_contrat(registre_admin, employee, contrat):
    reponse = _client(registre_admin).post(
        URL, _payload(nom_libre='', employee=str(employee.pk)), format='json',
    )
    assert reponse.status_code == 201
    assert reponse.data['fonction'] == 'Ingénieur'
    assert reponse.data['service'] == 'Paie'
    assert reponse.data['numero_contrat'] == 'CTR-2024-001'


def test_retour_avant_depart_refuse(registre_admin):
    reponse = _client(registre_admin).post(URL, _payload(date_retour='2026-02-01'), format='json')
    assert reponse.status_code == 400


def test_nombre_documents_doit_etre_positif(registre_admin):
    reponse = _client(registre_admin).post(URL, _payload(nombre_documents=0), format='json')
    assert reponse.status_code == 400


def test_champs_serveur_ignores_a_la_creation(registre_admin):
    reponse = _client(registre_admin).post(
        URL, _payload(reference='M-99999/26', is_active=False), format='json',
    )
    assert reponse.status_code == 201
    assert reponse.data['reference'] != 'M-99999/26'
    assert reponse.data['is_active'] is True


# ── Liste (vue unifiée) ──

def test_liste_renvoie_annee_et_lignes(registre_admin):
    _client(registre_admin).post(URL, _payload(date_depart='2026-03-01'), format='json')
    reponse = _client(registre_admin).get(URL, {'annee': 2026})
    assert reponse.status_code == 200
    assert reponse.data['annee'] == 2026
    assert reponse.data['results'][0]['employe'] == 'Ali Ben'
    assert 'origine' not in reponse.data['results'][0]


def _creer_mouvements(n):
    for i in range(1, n + 1):
        MouvementArchive.objects.create(
            reference=f"M-{i:05d}/26", nom_libre=f"Agent {i}", type_documents='Dossier',
            date_depart=date(2026, 1, i),
        )


def test_liste_paginee_par_defaut_avec_compteurs(registre_admin):
    _creer_mouvements(5)
    reponse = _client(registre_admin).get(URL, {'annee': 2026, 'page_size': 2})
    assert reponse.status_code == 200
    assert reponse.data['count'] == 5
    assert reponse.data['page'] == 1 and reponse.data['num_pages'] == 3
    assert [r['reference'] for r in reponse.data['results']] == ['M-00001/26', 'M-00002/26']


def test_liste_page_suivante_et_hors_plage(registre_admin):
    _creer_mouvements(5)
    page3 = _client(registre_admin).get(URL, {'annee': 2026, 'page_size': 2, 'page': 3})
    assert [r['reference'] for r in page3.data['results']] == ['M-00005/26']
    hors = _client(registre_admin).get(URL, {'annee': 2026, 'page_size': 2, 'page': 9})
    assert hors.status_code == 200 and hors.data['results'] == [] and hors.data['count'] == 5


def test_pagination_parametres_invalides_ou_trop_grands(registre_admin):
    assert _client(registre_admin).get(URL, {'page': 'x'}).status_code == 400
    assert _client(registre_admin).get(URL, {'page': 0}).status_code == 400
    assert _client(registre_admin).get(URL, {'page_size': -1}).status_code == 400
    plafonne = _client(registre_admin).get(URL, {'annee': 2026, 'page_size': 100000})
    assert plafonne.data['page_size'] == 200


def test_liste_annee_invalide_refusee(registre_admin):
    assert _client(registre_admin).get(URL, {'annee': 'abc'}).status_code == 400
    assert _client(registre_admin).get(URL, {'annee': 1800}).status_code == 400


# ── Modification, retour, annulation ──

def test_modification_auditee_avec_ancienne_valeur(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    reponse = _client(registre_admin).patch(f"{URL}{_slug(m)}/", {'nombre_documents': 5}, format='json')
    assert reponse.status_code == 200
    log = AuditLog.objects.get(action='MODIFY_MOUVEMENT')
    assert log.details['changes']['nombre_documents'] == {'avant': 3, 'apres': 5}


def test_modification_ne_change_pas_la_reference(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    _client(registre_admin).patch(f"{URL}{_slug(m)}/", {'reference': 'M-77777/26'}, format='json')
    m.refresh_from_db()
    assert m.reference != 'M-77777/26'


def test_retour_en_un_clic_met_la_date_du_jour(registre_admin):
    _client(registre_admin).post(URL, _payload(date_depart='2026-01-01'), format='json')
    m = MouvementArchive.objects.get()
    reponse = _client(registre_admin).post(f"{URL}{_slug(m)}/retour/")
    assert reponse.status_code == 200
    m.refresh_from_db()
    assert m.date_retour == timezone.localdate()
    assert AuditLog.objects.filter(action='RETOUR_MOUVEMENT').exists()


def test_retour_deja_enregistre_refuse(registre_admin):
    _client(registre_admin).post(URL, _payload(date_depart='2026-01-01', date_retour='2026-01-05'), format='json')
    m = MouvementArchive.objects.get()
    assert _client(registre_admin).post(f"{URL}{_slug(m)}/retour/").status_code == 400


def test_annulation_exige_un_motif_et_ne_supprime_pas(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    assert _client(registre_admin).post(f"{URL}{_slug(m)}/annuler/", {'motif': ''}, format='json').status_code == 400
    assert _client(registre_admin).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Doublon'}, format='json').status_code == 200
    m.refresh_from_db()
    assert m.is_active is False and m.motif_annulation == 'Doublon'
    assert MouvementArchive.objects.count() == 1
    assert AuditLog.objects.filter(action='CANCEL_MOUVEMENT').exists()


def test_ligne_annulee_non_modifiable(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    _client(registre_admin).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Doublon'}, format='json')
    assert _client(registre_admin).patch(f"{URL}{_slug(m)}/", {'observation': 'x'}, format='json').status_code == 400


def test_suppression_refusee_tant_que_la_ligne_nest_pas_annulee(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    reponse = _client(registre_admin).delete(f"{URL}{_slug(m)}/")
    assert reponse.status_code == 400
    assert MouvementArchive.objects.count() == 1
    assert not AuditLog.objects.filter(action='DELETE_MOUVEMENT').exists()


def test_suppression_apres_annulation_est_auditee_avec_instantane(registre_admin):
    _client(registre_admin).post(URL, _payload(observation='Dossier prêté'), format='json')
    m = MouvementArchive.objects.get()
    _client(registre_admin).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Doublon'}, format='json')
    reponse = _client(registre_admin).delete(f"{URL}{_slug(m)}/")
    assert reponse.status_code == 204
    assert MouvementArchive.objects.count() == 0
    log = AuditLog.objects.get(action='DELETE_MOUVEMENT')
    assert log.target_label == m.reference and log.target_id == str(m.pk)
    snap = log.details['snapshot']
    assert snap['reference'] == m.reference and snap['nom_libre'] == 'Ali Ben'
    assert snap['observation'] == 'Dossier prêté' and snap['motif_annulation'] == 'Doublon'
    assert snap['nombre_documents'] == 3 and snap['saisi_par'] == registre_admin.username


def test_reference_supprimee_nest_jamais_reutilisee(registre_admin):
    _client(registre_admin).post(URL, _payload(), format='json')
    premier = MouvementArchive.objects.get()
    _client(registre_admin).post(f"{URL}{_slug(premier)}/annuler/", {'motif': 'Erreur'}, format='json')
    _client(registre_admin).delete(f"{URL}{_slug(premier)}/")
    reponse = _client(registre_admin).post(URL, _payload(), format='json')
    assert reponse.data['reference'] != premier.reference
    assert reponse.data['reference'].split('/')[0].endswith('00002')


def test_suppression_refusee_aux_comptes_non_autorises(registre_admin, admin_user):
    _client(registre_admin).post(URL, _payload(), format='json')
    m = MouvementArchive.objects.get()
    _client(registre_admin).post(f"{URL}{_slug(m)}/annuler/", {'motif': 'Erreur'}, format='json')
    assert _client(admin_user).delete(f"{URL}{_slug(m)}/").status_code == 403
    assert MouvementArchive.objects.count() == 1


def test_reference_inconnue_404(registre_admin):
    assert _client(registre_admin).get(f"{URL}M-99999-26/").status_code == 404

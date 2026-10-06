"""
Tests — app notifications : isolation par destinataire (vraies routes),
helper notify()/notify_role() (on_commit, scoping, panne avalée) et purge.
"""

from datetime import timedelta
from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from notifications.models import Notification
from notifications.service import notify, notify_role

pytestmark = pytest.mark.django_db
User = get_user_model()


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def other_admin(db):
    return User.objects.create_user(
        username="other_admin", password="OtherAdmin123!", nom="Autre", prenom="Admin",
        role="ADMIN", consent_loi1807_accepted_at=timezone.now(),
    )


def make(user, **kw):
    kw.setdefault('type', Notification.Type.GENERIQUE)
    kw.setdefault('message', 'Test')
    return Notification.objects.create(recipient=user, **kw)


class TestApi:
    def test_requires_authentication(self):
        assert APIClient().get('/api/notifications/compteur/').status_code in (401, 403)

    def test_list_only_returns_own_notifications(self, admin_user, other_admin):
        mine = make(admin_user)
        make(other_admin)
        res = auth_client(admin_user).get('/api/notifications/')
        assert res.status_code == 200
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        assert [r['id'] for r in rows] == [str(mine.id)]

    def test_compteur_counts_only_own_unread(self, admin_user, other_admin):
        make(admin_user)
        make(admin_user, read_at=timezone.now())
        make(other_admin)
        res = auth_client(admin_user).get('/api/notifications/compteur/')
        assert res.data == {'non_lues': 1}

    def test_filter_non_lues(self, admin_user):
        make(admin_user)
        make(admin_user, read_at=timezone.now())
        res = auth_client(admin_user).get('/api/notifications/?non_lues=1')
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        assert len(rows) == 1

    def test_mark_read(self, admin_user):
        n = make(admin_user)
        res = auth_client(admin_user).post(f'/api/notifications/{n.id}/lue/')
        assert res.status_code == 200
        n.refresh_from_db()
        assert n.read_at is not None

    def test_cannot_mark_other_users_notification_read(self, admin_user, other_admin):
        n = make(other_admin)
        res = auth_client(admin_user).post(f'/api/notifications/{n.id}/lue/')
        assert res.status_code == 404
        n.refresh_from_db()
        assert n.read_at is None

    def test_consultant_can_use_own_notifications(self, consultant_user):
        make(consultant_user)
        res = auth_client(consultant_user).get('/api/notifications/compteur/')
        assert res.data == {'non_lues': 1}

    def test_tout_lire_only_affects_own(self, admin_user, other_admin):
        make(admin_user)
        make(admin_user)
        theirs = make(other_admin)
        res = auth_client(admin_user).post('/api/notifications/tout-lire/')
        assert res.data == {'marquees': 2}
        theirs.refresh_from_db()
        assert theirs.read_at is None


class TestService:
    def test_notify_creates_after_commit_only(self, admin_user, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=False) as callbacks:
            notify([admin_user], Notification.Type.GENERIQUE, 'Salut', '/x')
        assert Notification.objects.count() == 0
        for cb in callbacks:
            cb()
        assert Notification.objects.get().recipient == admin_user

    def test_notify_deduplicates_recipients(self, admin_user, django_capture_on_commit_callbacks):
        with django_capture_on_commit_callbacks(execute=True):
            notify([admin_user, admin_user.pk], Notification.Type.GENERIQUE, 'Salut')
        assert Notification.objects.count() == 1

    def test_notify_role_targets_active_accounts_of_role(
        self, admin_user, other_admin, consultant_user, django_capture_on_commit_callbacks,
    ):
        other_admin.is_active = False
        other_admin.save()
        with django_capture_on_commit_callbacks(execute=True):
            notify_role(['ADMIN'], Notification.Type.GENERIQUE, 'Salut')
        assert set(Notification.objects.values_list('recipient', flat=True)) == {admin_user.pk}

    def test_notify_role_excludes_author(
        self, admin_user, other_admin, django_capture_on_commit_callbacks,
    ):
        with django_capture_on_commit_callbacks(execute=True):
            notify_role(['ADMIN'], Notification.Type.GENERIQUE, 'Salut', exclude=admin_user)
        assert set(Notification.objects.values_list('recipient', flat=True)) == {other_admin.pk}

    def test_notify_role_applies_employee_scoping(
        self, employee, service, consultant_user, django_capture_on_commit_callbacks,
    ):
        from employees.models import Departement, Service
        other_service = Service.objects.create(
            nom="Autre", departement=Departement.objects.create(
                nom="Autre dept", direction=service.departement.direction, code="AD"),
        )
        in_scope = User.objects.create_user(
            username="in_scope", password="InScope123!", nom="In", prenom="Scope",
            role="CONSULTANT", consent_loi1807_accepted_at=timezone.now(),
        )
        in_scope.scope_services.set([employee.service])
        consultant_user.scope_services.set([other_service])
        with django_capture_on_commit_callbacks(execute=True):
            notify_role(['CONSULTANT'], Notification.Type.GENERIQUE, 'Salut', employee=employee)
        assert set(Notification.objects.values_list('recipient', flat=True)) == {in_scope.pk}

    def test_failure_is_swallowed(self, admin_user, monkeypatch, django_capture_on_commit_callbacks):
        def boom(*a, **k):
            raise RuntimeError("db down")
        monkeypatch.setattr(Notification.objects, 'bulk_create', boom)
        with django_capture_on_commit_callbacks(execute=True):
            notify([admin_user], Notification.Type.GENERIQUE, 'Salut')  # ne lève pas


class TestPurge:
    def test_purge_deletes_only_old_read(self, admin_user):
        now = timezone.now()
        old_read = make(admin_user, read_at=now - timedelta(days=31))
        recent_read = make(admin_user, read_at=now - timedelta(days=5))
        old_unread = make(admin_user)
        Notification.objects.filter(pk=old_unread.pk).update(created_at=now - timedelta(days=90))
        call_command('purge_notifications', stdout=StringIO())
        remaining = set(Notification.objects.values_list('pk', flat=True))
        assert remaining == {recent_read.pk, old_unread.pk}
        assert old_read.pk not in remaining

    def test_dry_run_deletes_nothing(self, admin_user):
        make(admin_user, read_at=timezone.now() - timedelta(days=60))
        out = StringIO()
        call_command('purge_notifications', '--dry-run', stdout=out)
        assert Notification.objects.count() == 1
        assert '1 notification' in out.getvalue()

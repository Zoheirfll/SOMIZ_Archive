from django.db import migrations, models


def conserver_droits_actuels(apps, schema_editor):
    """Avant ces drapeaux, tout GESTIONNAIRE pouvait demander attestations et
    consultations, tout CONSULTANT des consultations. On les initialise à
    True pour ne retirer aucun droit existant ; un ADMIN les décoche ensuite
    compte par compte. Comptes INACTIFS exclus : on n'attribue pas en masse un
    droit à un compte désactivé (un ADMIN le coche à la réactivation)."""
    User = apps.get_model('accounts', 'User')
    User.objects.filter(role='GESTIONNAIRE', is_active=True).update(
        peut_demander_attestation=True, peut_demander_consultation=True,
    )
    User.objects.filter(role='CONSULTANT', is_active=True).update(peut_demander_consultation=True)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0018_user_charge_registre'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='peut_demander_attestation',
            field=models.BooleanField(default=False, help_text="Gestionnaire/Consultant : autorisé à créer des demandes d'attestation de travail.", verbose_name='Peut demander des attestations de travail'),
        ),
        migrations.AddField(
            model_name='user',
            name='peut_demander_consultation',
            field=models.BooleanField(default=False, help_text="Gestionnaire/Consultant : autorisé à créer des demandes de consultation d'archives.", verbose_name="Peut demander des consultations d'archives"),
        ),
        migrations.RunPython(conserver_droits_actuels, migrations.RunPython.noop),
    ]

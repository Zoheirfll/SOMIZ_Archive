from django.db import migrations


def copy_single_scope_to_m2m(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    for user in User.objects.exclude(
        scope_direction=None, scope_departement=None, scope_service=None
    ):
        if user.scope_direction_id:
            user.scope_directions.add(user.scope_direction_id)
        if user.scope_departement_id:
            user.scope_departements.add(user.scope_departement_id)
        if user.scope_service_id:
            user.scope_services.add(user.scope_service_id)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_add_scope_m2m'),
    ]

    operations = [
        migrations.RunPython(copy_single_scope_to_m2m, reverse_noop),
    ]

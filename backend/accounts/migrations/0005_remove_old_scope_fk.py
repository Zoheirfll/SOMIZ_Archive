from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_migrate_scope_single_to_m2m'),
    ]

    operations = [
        migrations.RemoveField(model_name='user', name='scope_direction'),
        migrations.RemoveField(model_name='user', name='scope_departement'),
        migrations.RemoveField(model_name='user', name='scope_service'),
    ]

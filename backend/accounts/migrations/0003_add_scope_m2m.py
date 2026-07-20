from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0001_initial'),
        ('accounts', '0002_user_scope_departement_user_scope_direction_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='scope_directions',
            field=models.ManyToManyField(blank=True, related_name='scoped_users', to='employees.direction', verbose_name='Périmètre — Directions'),
        ),
        migrations.AddField(
            model_name='user',
            name='scope_departements',
            field=models.ManyToManyField(blank=True, related_name='scoped_users', to='employees.departement', verbose_name='Périmètre — Départements'),
        ),
        migrations.AddField(
            model_name='user',
            name='scope_services',
            field=models.ManyToManyField(blank=True, related_name='scoped_users', to='employees.service', verbose_name='Périmètre — Services'),
        ),
    ]

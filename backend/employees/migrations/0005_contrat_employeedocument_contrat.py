from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0004_remove_employeedocument_file_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Contrat',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('numero_contrat', models.CharField(db_index=True, max_length=50, unique=True, verbose_name='N° Contrat')),
                ('date_debut', models.DateField(blank=True, null=True, verbose_name='Date début')),
                ('date_fin', models.DateField(blank=True, null=True, verbose_name='Date fin')),
                ('statut', models.CharField(
                    choices=[('actif', 'Actif'), ('termine', 'Terminé'), ('suspendu', 'Suspendu')],
                    default='actif',
                    max_length=20,
                )),
                ('notes', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='contrats_created',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('employee', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='contrats',
                    to='employees.employee',
                )),
                ('type_contrat', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='contrats',
                    to='employees.typecontrat',
                )),
            ],
            options={
                'verbose_name': 'Contrat',
                'db_table': 'contrats',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddField(
            model_name='employeedocument',
            name='contrat',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='documents',
                to='employees.contrat',
            ),
        ),
    ]

"""Congé accordé (2026-10-29) : « Prête » et « Récupérée » fusionnent en « Accordé »,
`date_prete` devient `date_accord`, `date_recuperee` disparaît, et le titre PDF
figé à l'octroi est stocké dans `titre_pdf`."""
from django.db import migrations, models

import conges.models


def fusionner_statuts(apps, schema_editor):
    DemandeConge = apps.get_model('conges', 'DemandeConge')
    DemandeConge.objects.filter(statut__in=['prete', 'recuperee']).update(statut='accordee')


def separer_statuts(apps, schema_editor):
    DemandeConge = apps.get_model('conges', 'DemandeConge')
    DemandeConge.objects.filter(statut='accordee').update(statut='prete')


class Migration(migrations.Migration):

    dependencies = [
        ('conges', '0004_visaconge_unite_id'),
    ]

    operations = [
        migrations.RunPython(fusionner_statuts, separer_statuts),
        migrations.RenameField(model_name='demandeconge', old_name='date_prete', new_name='date_accord'),
        migrations.RemoveField(model_name='demandeconge', name='date_recuperee'),
        migrations.AddField(
            model_name='demandeconge', name='titre_pdf',
            field=models.FileField(blank=True, null=True, upload_to=conges.models.conge_titre_upload_path),
        ),
    ]

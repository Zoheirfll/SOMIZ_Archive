# Généré puis réécrit à la main : le champ `motif` passe de CharField (texte
# libre) à ForeignKey vers employees.MotifArchivage (catégorie "attestation")
# — impossible à faire en un seul AlterField (Postgres ne caste pas du texte
# en UUID), d'où le champ intermédiaire + migration de données + renommage.
import uuid

import django.db.models.deletion
from django.db import migrations, models


def migrer_motifs_texte_vers_referentiel(apps, schema_editor):
    DemandeAttestation = apps.get_model('attestations', 'DemandeAttestation')
    MotifArchivage = apps.get_model('employees', 'MotifArchivage')

    cache = {}
    for demande in DemandeAttestation.objects.all():
        texte = (demande.motif_ref or '').strip() or 'Non précisé'
        cle = texte.upper()
        motif = cache.get(cle)
        if not motif:
            motif = MotifArchivage.objects.filter(
                nom__iexact=texte, categorie='attestation',
            ).first()
            if not motif:
                motif = MotifArchivage.objects.create(
                    id=uuid.uuid4(), nom=texte, categorie='attestation', is_active=True,
                )
            cache[cle] = motif
        demande.motif_fk_id = motif.id
        demande.save(update_fields=['motif_fk'])


def revenir_au_texte_libre(apps, schema_editor):
    DemandeAttestation = apps.get_model('attestations', 'DemandeAttestation')
    for demande in DemandeAttestation.objects.select_related('motif_fk').all():
        if demande.motif_fk_id:
            demande.motif_ref = demande.motif_fk.nom
            demande.save(update_fields=['motif_ref'])


class Migration(migrations.Migration):

    dependencies = [
        ('attestations', '0003_signataire_nom_defaut'),
        ('employees', '0037_motif_categorie'),
    ]

    operations = [
        migrations.AddField(
            model_name='demandeattestation',
            name='date_prete',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='demandeattestation',
            name='date_recuperee',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='demandeattestation',
            name='statut',
            field=models.CharField(choices=[('recue', 'Reçue'), ('prete', 'Prête'), ('recuperee', 'Récupérée'), ('rejetee', 'Rejetée')], default='recue', max_length=20),
        ),
        # 1) renomme l'ancien champ texte pour libérer le nom `motif`
        migrations.RenameField(
            model_name='demandeattestation',
            old_name='motif',
            new_name='motif_ref',
        ),
        # 2) nouveau champ FK temporaire, nullable le temps de la migration
        migrations.AddField(
            model_name='demandeattestation',
            name='motif_fk',
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='demandes_attestation', to='employees.motifarchivage',
                limit_choices_to={'categorie': 'attestation'},
            ),
        ),
        migrations.RunPython(migrer_motifs_texte_vers_referentiel, revenir_au_texte_libre),
        # 3) supprime l'ancien champ texte, renomme motif_fk -> motif, rend non-null
        migrations.RemoveField(
            model_name='demandeattestation',
            name='motif_ref',
        ),
        migrations.RenameField(
            model_name='demandeattestation',
            old_name='motif_fk',
            new_name='motif',
        ),
        migrations.AlterField(
            model_name='demandeattestation',
            name='motif',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='demandes_attestation', to='employees.motifarchivage',
                limit_choices_to={'categorie': 'attestation'},
            ),
        ),
    ]

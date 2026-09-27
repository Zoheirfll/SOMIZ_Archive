# La table demandes_attestation s'est retrouvée avec deux colonnes
# signataire_interim/signataire_interim_nom (NOT NULL, sans défaut) qui
# n'appartiennent qu'au modèle AttestationTemplateConfig — jamais présentes
# sur DemandeAttestation. Conséquence : tout INSERT dans demandes_attestation
# échouait avec une NotNullViolation ("Impossible de créer la demande."
# générique côté frontend, la vraie erreur 500 n'étant pas remontée).
# state_operations vide : le modèle Django ne connaît pas ces colonnes,
# seule la base doit être corrigée.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('attestations', '0006_demandeattestation_date_document'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[],
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE demandes_attestation
                        DROP COLUMN IF EXISTS signataire_interim,
                        DROP COLUMN IF EXISTS signataire_interim_nom;
                    """,
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
        ),
    ]

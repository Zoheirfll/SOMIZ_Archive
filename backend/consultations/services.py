"""Règles métier du traitement des demandes de consultation. Les vues
restent minces : toute validation et tout changement d'état passent ici,
et chaque refus est une ValidationError DRF (400)."""
import os
from datetime import timedelta

import magic
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from employees.models import EmployeeDocumentFile
from .models import ConsultationFichier, DemandeConsultation

Statut = DemandeConsultation.Statut


def _verrouiller(demande):
    return DemandeConsultation.objects.select_for_update().get(pk=demande.pk)


def _verifier_traiteur_distinct(demande, manager):
    """Séparation demandeur/validateur : jamais le même compte."""
    if demande.demandeur_id == manager.id:
        raise ValidationError("Le traiteur ne peut pas traiter sa propre demande.")


def _valider_duree(duree_heures):
    try:
        duree = int(duree_heures)
    except (TypeError, ValueError):
        raise ValidationError({'duree_heures': "Durée invalide."})
    if duree not in settings.CONSULTATION_DUREES_HEURES:
        raise ValidationError({
            'duree_heures': f"Durée non autorisée (choix : {settings.CONSULTATION_DUREES_HEURES}).",
        })
    return duree


def _lire_upload(fichier):
    """Contrôle taille + MIME réel (python-magic, pas l'extension ni le
    content-type déclaré) et renvoie (contenu, mime)."""
    if fichier.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise ValidationError({'fichiers': f"« {fichier.name} » dépasse {settings.MAX_UPLOAD_SIZE_MB} Mo."})
    contenu = fichier.read()
    mime = magic.from_buffer(contenu[:2048], mime=True)
    if mime not in settings.ALLOWED_MIME_TYPES:
        raise ValidationError({'fichiers': f"Type de fichier non autorisé : {mime}."})
    return contenu, mime


def _creer_fichier(demande, manager, *, contenu, mime, nom, origine, source=None):
    nom_affiche = os.path.basename(nom)[:255]
    fichier = ConsultationFichier(
        demande=demande, file_name=nom_affiche, mime_type=mime, file_size=len(contenu),
        origine=origine, source_document_file=source, uploaded_by=manager,
    )
    fichier.file.save(nom_affiche, ContentFile(contenu), save=False)
    fichier.save()
    return fichier


def _charger_copies(demande, ids_copies):
    """Lit le contenu des documents archivés à copier. Chaque id doit
    désigner un fichier actif de l'employé de la demande."""
    if not ids_copies:
        return []
    if demande.employee_id is None:
        raise ValidationError({'copier_fichiers': "Aucun employé n'est associé à cette demande."})
    ids = set(map(str, ids_copies))
    sources = list(
        EmployeeDocumentFile.objects.filter(
            pk__in=ids, is_active=True, document__employee_id=demande.employee_id,
        )
    )
    if len(sources) != len(ids):
        raise ValidationError({'copier_fichiers': "Fichier introuvable pour cet employé."})
    copies = []
    for source in sources:
        if not source.file or not os.path.exists(source.file.path):
            raise ValidationError({'copier_fichiers': f"Fichier source introuvable : {source.file_name}."})
        with open(source.file.path, 'rb') as fh:
            copies.append((fh.read(), source.mime_type or 'application/pdf', source.file_name or 'document', source))
    return copies


@transaction.atomic
def valider(demande, manager, *, duree_heures, telechargement_autorise, uploads, ids_copies, now=None):
    """Livre les fichiers et ouvre la consultation pour `duree_heures`."""
    demande = _verrouiller(demande)
    if demande.statut != Statut.EN_COURS:
        raise ValidationError("Seule une demande « En cours de validation » peut être validée.")
    _verifier_traiteur_distinct(demande, manager)
    duree = _valider_duree(duree_heures)
    if not uploads and not ids_copies:
        raise ValidationError({'fichiers': "Joignez au moins un fichier."})

    prepares = [(*_lire_upload(u), u.name) for u in uploads]
    copies = _charger_copies(demande, ids_copies)

    now = now or timezone.now()
    cree = []
    for contenu, mime, nom in prepares:
        cree.append(_creer_fichier(
            demande, manager, contenu=contenu, mime=mime, nom=nom,
            origine=ConsultationFichier.Origine.SCAN_EXTERNE,
        ))
    for contenu, mime, nom, source in copies:
        cree.append(_creer_fichier(
            demande, manager, contenu=contenu, mime=mime, nom=nom,
            origine=ConsultationFichier.Origine.COPIE_ARCHIVE, source=source,
        ))

    echeance = now + timedelta(hours=duree)
    demande.statut = Statut.VALIDEE
    demande.traite_par = manager
    demande.date_validation = now
    demande.date_echeance = echeance
    demande.date_echeance_initiale = echeance
    demande.telechargement_autorise = bool(telechargement_autorise)
    demande.save()
    demande._fichiers_livres = cree  # pour l'audit côté vue
    return demande


@transaction.atomic
def rejeter(demande, manager, motif):
    demande = _verrouiller(demande)
    if demande.statut != Statut.EN_COURS:
        raise ValidationError("Seule une demande « En cours de validation » peut être rejetée.")
    _verifier_traiteur_distinct(demande, manager)
    motif = (motif or '').strip()
    if not motif:
        raise ValidationError({'motif_rejet': "Le motif du rejet est obligatoire."})
    demande.statut = Statut.REJETEE
    demande.motif_rejet = motif
    demande.traite_par = manager
    demande.save()
    return demande


@transaction.atomic
def revoquer(demande, manager, now=None):
    """Coupe l'accès avant l'échéance. Sans objet si la consultation est
    déjà expirée ou n'a jamais été ouverte."""
    demande = _verrouiller(demande)
    now = now or timezone.now()
    if not demande.est_active(now):
        raise ValidationError("Seule une consultation en cours de validité peut être révoquée.")
    demande.statut = Statut.REVOQUEE
    demande.date_revocation = now
    demande.save()
    return demande

"""Règles métier du traitement des demandes de consultation. Les vues
restent minces : toute validation et tout changement d'état passent ici,
et chaque refus est une ValidationError DRF (400)."""
import os
import uuid
from datetime import timedelta
from io import BytesIO

import magic
from PIL import Image
from pypdf import PdfReader
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from employees.models import EmployeeDocumentFile
from .models import ConsultationFichier, DemandeConsultation

Statut = DemandeConsultation.Statut


def _verrouiller(demande):
    return DemandeConsultation.objects.select_for_update().get(pk=demande.pk)


def _verifier_traiteur_distinct(demande, manager):
    """Séparation demandeur/validateur : jamais le même compte, sauf pour un
    SUPERADMIN (qui peut tout faire, comme pour les attestations ; les deux
    rôles restent tracés dans l'audit)."""
    if demande.demandeur_id == manager.id and not manager.is_superadmin:
        raise ValidationError("Le traiteur ne peut pas traiter sa propre demande.")


def _valider_duree(duree_heures):
    """Durée libre en heures entières, entre CONSULTATION_DUREE_MIN_HEURES et
    le plafond CONSULTATION_MAX_DUREE_TOTALE_HEURES (les paliers de
    CONSULTATION_DUREES_HEURES ne sont que des raccourcis d'interface)."""
    try:
        duree = int(duree_heures)
    except (TypeError, ValueError):
        raise ValidationError({'duree_heures': "Durée invalide."})
    mini = settings.CONSULTATION_DUREE_MIN_HEURES
    maxi = settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES
    if not mini <= duree <= maxi:
        raise ValidationError({'duree_heures': f"La durée doit être comprise entre {mini} h et {maxi} h."})
    return duree


def _lire_upload(fichier):
    """Contrôle taille + MIME réel (python-magic, pas l'extension ni le
    content-type déclaré) et renvoie (contenu, mime)."""
    if fichier.size > settings.CONSULTATION_MAX_FICHIER_MB * 1024 * 1024:
        raise ValidationError({'fichiers': f"« {fichier.name} » dépasse {settings.CONSULTATION_MAX_FICHIER_MB} Mo."})
    contenu = fichier.read()
    mime = magic.from_buffer(contenu[:2048], mime=True)
    if mime not in settings.ALLOWED_MIME_TYPES:
        raise ValidationError({'fichiers': f"Type de fichier non autorisé : {mime}."})
    _verifier_complexite(contenu, mime, fichier.name, 'fichiers')
    return contenu, mime


def _verifier_complexite(contenu, mime, nom, champ):
    """Borne le coût du filigrane, recalculé à CHAQUE lecture : un PDF est
    limité en pages (MAX_UPLOAD_PAGES) et une image en pixels
    (CONSULTATION_MAX_PIXELS). Sans cela, un fichier de 20 Mo pouvant
    contenir des milliers de pages ou une image de plusieurs milliards de
    pixels saturerait CPU et mémoire du serveur à chaque lecture."""
    try:
        if mime == 'application/pdf':
            pages = len(PdfReader(BytesIO(contenu)).pages)
            if pages > settings.MAX_UPLOAD_PAGES:
                raise ValidationError({champ: f"« {nom} » dépasse {settings.MAX_UPLOAD_PAGES} pages."})
        else:
            with Image.open(BytesIO(contenu)) as image:
                largeur, hauteur = image.size
            if largeur * hauteur > settings.CONSULTATION_MAX_PIXELS:
                raise ValidationError({champ: f"« {nom} » est trop grande ({largeur}×{hauteur} pixels)."})
    except ValidationError:
        raise
    except Exception:
        raise ValidationError({champ: f"« {nom} » est illisible ou corrompu."})


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
    try:
        ids = {str(uuid.UUID(str(i))) for i in ids_copies}
    except ValueError:
        raise ValidationError({'copier_fichiers': "Identifiant de fichier invalide."})
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
            contenu = fh.read()
        mime = source.mime_type or 'application/pdf'
        _verifier_complexite(contenu, mime, source.file_name or 'document', 'copier_fichiers')
        copies.append((contenu, mime, source.file_name or 'document', source))
    return copies


@transaction.atomic
def valider(demande, manager, *, duree_heures=None, telechargement_autorise=None,
            impression_autorisee=None, uploads, ids_copies, now=None):
    """Livre les fichiers et ouvre la consultation.

    Durée et droits d'usage sont ceux que le demandeur a SOUHAITÉS tant que le
    traiteur ne les précise pas (None = accorder tel que demandé) ; s'il en
    fournit, ce qu'il accorde remplace le souhait."""
    demande = _verrouiller(demande)
    if demande.statut != Statut.EN_COURS:
        raise ValidationError("Seule une demande « En cours de validation » peut être validée.")
    _verifier_traiteur_distinct(demande, manager)
    if duree_heures is None:
        duree_heures = demande.duree_souhaitee_heures
    if telechargement_autorise is None:
        telechargement_autorise = demande.telechargement_souhaite
    if impression_autorisee is None:
        impression_autorisee = demande.impression_souhaitee
    duree = _valider_duree(duree_heures)
    if not uploads and not ids_copies:
        raise ValidationError({'fichiers': "Joignez au moins un fichier."})
    if len(uploads) + len(ids_copies) > settings.CONSULTATION_MAX_FICHIERS:
        raise ValidationError({'fichiers': f"Maximum {settings.CONSULTATION_MAX_FICHIERS} fichiers par livraison."})
    if sum(u.size for u in uploads) > settings.CONSULTATION_MAX_TOTAL_MB * 1024 * 1024:
        raise ValidationError({'fichiers': f"La livraison dépasse {settings.CONSULTATION_MAX_TOTAL_MB} Mo au total."})

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
    demande.impression_autorisee = bool(impression_autorisee)
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


@transaction.atomic
def prolonger(demande, manager, duree_heures, now=None):
    """Prolonge une consultation validée. Autorisée jusqu'à
    CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES après l'échéance, plafonnée
    par CONSULTATION_MAX_DUREE_TOTALE_HEURES depuis la validation. Au-delà du
    délai de grâce, le demandeur doit refaire une demande."""
    demande = _verrouiller(demande)
    now = now or timezone.now()
    if demande.statut != Statut.VALIDEE:
        raise ValidationError("Seule une consultation validée peut être prolongée.")
    _verifier_traiteur_distinct(demande, manager)
    duree = _valider_duree(duree_heures)

    grace = timedelta(hours=settings.CONSULTATION_DELAI_GRACE_PROLONGATION_HEURES)
    if now > demande.date_echeance + grace:
        raise ValidationError("Le délai de prolongation est dépassé : le demandeur doit refaire une demande.")

    ancienne = demande.date_echeance
    nouvelle = max(now, ancienne) + timedelta(hours=duree)
    plafond = timedelta(hours=settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES)
    if nouvelle - demande.date_validation > plafond:
        raise ValidationError({
            'duree_heures': f"Le plafond de {settings.CONSULTATION_MAX_DUREE_TOTALE_HEURES} h de consultation cumulée serait dépassé.",
        })

    demande.date_echeance = nouvelle
    demande.nb_prolongations += 1
    demande.rappel_24h_envoye = False
    demande.rappel_1h_envoye = False
    demande.save()
    demande._ancienne_echeance = ancienne
    return demande


def fichiers_purgeables(jours, now=None):
    """Scans externes dont la consultation est close depuis plus de `jours`
    jours (expirée ou révoquée), pas encore purgés. Les copies d'archivés
    ne sont jamais concernées : l'original reste dans le dossier de
    l'employé, et une copie n'a pas de valeur propre à détruire."""
    now = now or timezone.now()
    limite = now - timedelta(days=jours)
    return ConsultationFichier.objects.filter(
        origine=ConsultationFichier.Origine.SCAN_EXTERNE, supprime_le__isnull=True,
    ).filter(
        Q(demande__statut=Statut.VALIDEE, demande__date_echeance__lt=limite)
        | Q(demande__statut=Statut.REVOQUEE, demande__date_revocation__lt=limite)
    ).select_related('demande')

"""Titre de congé figé (2026-10-29).

Un titre accordé est un document de dossier : une fois généré il ne change plus
jamais (même date, même modèle), contrairement à l'attestation qui se
regénère. Il est généré **une seule fois**, stocké (`titre_pdf`) et servi tel
quel. Un titre annulé est servi avec le filigrane « ANNULE » superposé au PDF
d'origine, sans le regénérer.

Tant que `CongeTemplateConfig.mode_test` est actif, rien n'est figé : le titre
est regénéré à chaque aperçu et porte la mention « (mode test) », pour qu'un
document de test ne devienne jamais un titre définitif.
"""
import io
import logging

from django.core.files.base import ContentFile
from django.utils import timezone

from .models import CongeTemplateConfig, DemandeConge
from .pdf import build_conge_pdf

logger = logging.getLogger(__name__)


def config_modele() -> CongeTemplateConfig:
    config, _ = CongeTemplateConfig.objects.get_or_create(pk=1)
    return config


def _numero_contrat(demande) -> str:
    from employees.models import Contrat
    if demande.contrat_id:
        return demande.contrat.numero_contrat
    return Contrat.objects.filter(employee=demande.employee).order_by(
        '-date_debut', '-id',
    ).values_list('numero_contrat', flat=True).first() or ''


def generer(demande, config, date_document, *, mention='') -> bytes:
    return build_conge_pdf(demande, config, date_document, contrat_numero=_numero_contrat(demande), mention=mention)


def figer(demande, config=None) -> bool:
    """Génère et stocke le titre si le mode test est désactivé et s'il n'existe
    pas déjà. Retourne True si un titre figé existe après l'appel. Ne lève
    jamais : un échec de génération ne doit pas annuler l'octroi du congé
    (le titre sera alors généré au premier aperçu)."""
    config = config or config_modele()
    if demande.titre_pdf:
        return True
    if config.mode_test:
        return False
    try:
        date_document = demande.date_document or timezone.localdate()
        # Un titre annulé garde le filigrane à la lecture, jamais dans le fichier d'origine.
        statut = demande.statut
        if statut == DemandeConge.Statut.ANNULEE:
            demande.statut = DemandeConge.Statut.ACCORDEE
        try:
            contenu = generer(demande, config, date_document)
        finally:
            demande.statut = statut
        nom = f"titre_conge_{demande.reference.replace('/', '-')}.pdf"
        demande.date_document = date_document
        demande.titre_pdf.save(nom, ContentFile(contenu), save=False)
        demande.save(update_fields=['titre_pdf', 'date_document', 'updated_at'])
        return True
    except Exception:
        logger.exception("Échec de la génération du titre de congé %s", demande.reference)
        return False


def _filigrane_annule(contenu: bytes) -> bytes:
    """Superpose « ANNULE » à chaque page du PDF d'origine."""
    from pypdf import PdfReader, PdfWriter
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    from .pdf import _draw_filigrane_annule

    tampon = io.BytesIO()
    c = canvas.Canvas(tampon, pagesize=A4)
    _draw_filigrane_annule(c)
    c.save()
    tampon.seek(0)
    filigrane = PdfReader(tampon).pages[0]
    lecteur, ecrivain = PdfReader(io.BytesIO(contenu)), PdfWriter()
    for page in lecteur.pages:
        page.merge_page(filigrane)
        ecrivain.add_page(page)
    sortie = io.BytesIO()
    ecrivain.write(sortie)
    return sortie.getvalue()


def lire_fige(demande) -> bytes:
    """Contenu du titre stocké (avec filigrane si le titre est annulé)."""
    with demande.titre_pdf.open('rb') as f:
        contenu = f.read()
    if demande.statut == DemandeConge.Statut.ANNULEE:
        return _filigrane_annule(contenu)
    return contenu

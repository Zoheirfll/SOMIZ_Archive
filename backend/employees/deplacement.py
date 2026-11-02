# backend/employees/deplacement.py
"""Déplacer un document mal classé vers le bon type (2026-11-01).

Deux opérations, ADMIN uniquement (vues dans employees/views.py), tracées
dans l'audit (`MODIFY_DOC`, `action: deplacer_document` / `deplacer_pages`) :

- `deplacer_document` : tout le document change de type. Si l'employé a déjà
  un document actif de ce type (même contrat), ses fichiers y sont ajoutés
  à la suite (pas de doublon) et le document source disparaît ; sinon le
  document change simplement de type (version 1 du nouveau type).
- `deplacer_pages` : certaines pages d'un PDF (ex. « CONTRAT INITIAL » rangé
  dans l'avenant) partent vers le type cible : extraites du PDF source
  (réécrit sans elles — supprimé, avec son document s'il devient vide),
  puis ajoutées à la fin du PDF du document cible, ou d'un nouveau document
  si l'employé n'en a pas encore de ce type. Nom et rotation des pages sont
  conservés.

La destination reste toujours le même employé et le même contrat (jamais un
autre dossier). Les fichiers physiques gardent leur emplacement de stockage
(chemin interne, jamais exposé : les documents sont servis par l'API) ; l'OCR
des fichiers dont le contenu change est relancé.
"""
import os

from django.core.files import File
from django.db import transaction
from django.db.models import Max
from pypdf import PdfReader, PdfWriter

from employees.models import EmployeeDocument, EmployeeDocumentFile, EmployeeDocumentFilePage, TypeDocument
from employees.pdf_utils import write_pdf


class DeplacementError(Exception):
    """Message lisible renvoyé tel quel (HTTP 400)."""


def type_cible_valide(type_doc_id, actuel):
    try:
        cible = TypeDocument.objects.get(pk=type_doc_id)
    except (TypeDocument.DoesNotExist, ValueError, TypeError):
        raise DeplacementError("Type de document cible introuvable.")
    if not cible.is_active:
        raise DeplacementError("Ce type de document est désactivé.")
    if cible.sous_types.exists():
        raise DeplacementError("Choisissez un type précis, pas une catégorie.")
    if cible.pk == actuel.pk:
        raise DeplacementError("Le document est déjà classé dans ce type.")
    return cible


def _document_cible(source, cible):
    return EmployeeDocument.objects.filter(
        employee=source.employee, contrat=source.contrat, type_doc=cible, is_active=True,
    ).order_by('-version').first()


def _supprimer_fichier(file_obj):
    chemin = file_obj.file.path if file_obj.file else None
    file_obj.delete()
    if chemin and os.path.isfile(chemin):
        try:
            os.remove(chemin)
        except OSError:
            pass


def deplacer_document(document, cible, auteur):
    """Renvoie le document qui porte désormais les fichiers."""
    with transaction.atomic():
        destination = _document_cible(document, cible)
        if destination is None:
            document.type_doc = cible
            document.version = 1
            document.save(update_fields=['type_doc', 'version'])
            return document
        dernier = destination.fichiers.aggregate(m=Max('ordre'))['m'] or 0
        for i, f in enumerate(document.fichiers.order_by('ordre'), start=1):
            f.document = destination
            f.ordre = dernier + i
            f.save(update_fields=['document', 'ordre'])
        document.delete()
        return destination


def deplacer_pages(file_obj, pages, page_ids, cible, auteur, enqueue_ocr, reset_ocr, save_pdf):
    """`pages` : pages du fichier (ordre courant) ; `page_ids` : celles à
    déplacer. Les helpers de views.py (_enqueue_ocr, _reset_ocr,
    _save_pdf_to_file) sont injectés pour garder une seule implémentation."""
    ids = {str(i) for i in page_ids}
    choisies = [p for p in pages if str(p.id) in ids]
    if not choisies or len(choisies) != len(ids):
        raise DeplacementError("Sélectionnez au moins une page de ce document.")
    restantes = [p for p in pages if str(p.id) not in ids]
    source = file_obj.document

    with file_obj.file.open('rb') as courant:
        lecteur = PdfReader(courant)
        w = PdfWriter()
        for p in choisies:
            w.add_page(lecteur.pages[p.ordre - 1])
        buf_deplace = write_pdf(w)
        buf_reste = None
        if restantes:
            w = PdfWriter()
            for p in restantes:
                w.add_page(lecteur.pages[p.ordre - 1])
            buf_reste = write_pdf(w)

    with transaction.atomic():
        # 1) Destination
        destination = _document_cible(source, cible)
        fichier_cible = None
        if destination is not None:
            fichier_cible = destination.fichiers.filter(
                is_active=True, mime_type='application/pdf').order_by('ordre').first()
        if fichier_cible is not None:
            existantes = list(fichier_cible.pages.all())
            with fichier_cible.file.open('rb') as f_cible:
                lecteur_cible = PdfReader(f_cible)
                lecteur_ajout = PdfReader(buf_deplace)
                w = PdfWriter()
                for page in lecteur_cible.pages:
                    w.add_page(page)
                for page in lecteur_ajout.pages:
                    w.add_page(page)
                buf_final = write_pdf(w)
            save_pdf(fichier_cible, buf_final)
            if not existantes:
                EmployeeDocumentFilePage.objects.bulk_create([
                    EmployeeDocumentFilePage(file=fichier_cible, ordre=i, nom=f"{fichier_cible.file_name} page {i}")
                    for i in range(1, len(lecteur_cible.pages) + 1)
                ])
                existantes = list(fichier_cible.pages.all())
            EmployeeDocumentFilePage.objects.bulk_create([
                EmployeeDocumentFilePage(file=fichier_cible, ordre=len(existantes) + i, nom=p.nom,
                                         rotation=p.rotation)
                for i, p in enumerate(choisies, start=1)
            ])
            reset_ocr(fichier_cible)
        else:
            if destination is None:
                destination = EmployeeDocument.objects.create(
                    employee=source.employee, contrat=source.contrat, type_doc=cible, uploaded_by=auteur,
                )
            dernier = destination.fichiers.aggregate(m=Max('ordre'))['m'] or 0
            nom = choisies[0].nom if len(choisies) == 1 else cible.nom
            buf_deplace.seek(0)
            nouveau = EmployeeDocumentFile.objects.create(
                document=destination, file=File(buf_deplace, name='deplace.pdf'), file_name=nom,
                file_size=buf_deplace.getbuffer().nbytes, mime_type='application/pdf',
                ordre=dernier + 1, uploaded_by=auteur,
            )
            EmployeeDocumentFilePage.objects.bulk_create([
                EmployeeDocumentFilePage(file=nouveau, ordre=i, nom=p.nom, rotation=p.rotation)
                for i, p in enumerate(choisies, start=1)
            ])
            enqueue_ocr(nouveau)

        # 2) Source
        if restantes:
            save_pdf(file_obj, buf_reste)
            EmployeeDocumentFilePage.objects.filter(pk__in=[p.pk for p in choisies]).delete()
            for i, p in enumerate(restantes, start=1):
                if p.ordre != i:
                    EmployeeDocumentFilePage.objects.filter(pk=p.pk).update(ordre=i)
            reset_ocr(file_obj)
        else:
            _supprimer_fichier(file_obj)
            if not source.fichiers.exists():
                source.delete()
    return destination

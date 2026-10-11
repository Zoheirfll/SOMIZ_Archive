from dataclasses import dataclass
from datetime import date

from .models import MouvementArchive


@dataclass(frozen=True)
class LigneRegistre:
    reference: str
    date_depart: date
    date_retour: date | None
    beneficiaire: str
    employe: str
    matricule: str
    fonction: str
    service: str
    numero_contrat: str
    type_documents: str
    nombre_documents: int
    observation: str
    saisi_par: str
    annulee: bool
    motif_annulation: str


def _nom_complet(personne):
    return f"{personne.nom} {personne.prenom}".strip()


def _ligne(mouvement):
    employe = _nom_complet(mouvement.employee) if mouvement.employee_id else mouvement.nom_libre
    return LigneRegistre(
        reference=mouvement.reference,
        date_depart=mouvement.date_depart, date_retour=mouvement.date_retour,
        beneficiaire=mouvement.beneficiaire, employe=employe,
        matricule=mouvement.employee.matricule if mouvement.employee_id else '',
        fonction=mouvement.fonction, service=mouvement.service,
        numero_contrat=mouvement.numero_contrat,
        type_documents=mouvement.type_documents, nombre_documents=mouvement.nombre_documents,
        observation=mouvement.observation,
        saisi_par=_nom_complet(mouvement.saisi_par) if mouvement.saisi_par_id else '',
        annulee=not mouvement.is_active,
        motif_annulation=mouvement.motif_annulation,
    )


def _correspond(ligne, q):
    if not q:
        return True
    cible = ' '.join([
        ligne.reference, ligne.beneficiaire, ligne.employe, ligne.matricule,
        ligne.fonction, ligne.service, ligne.numero_contrat, ligne.type_documents,
        ligne.observation,
    ]).lower()
    return q.lower() in cible


def registre_mouvements(user, annee, q='', statut=''):
    """Registre 01 d'une année : mouvements PHYSIQUES de dossiers saisis à la
    main, triés par date de départ croissante. Les consultations (livraison
    numérique par l'application) n'en font pas partie : elles se suivent dans
    /consultations. `statut='en_cours'` ne garde que les dossiers non rendus
    (hors lignes annulées). `user` est conservé dans la signature pour que le
    scoping reste applicable sans changer les appelants."""
    qs = MouvementArchive.objects.select_related('employee', 'saisi_par').filter(date_depart__year=annee)
    lignes = [_ligne(m) for m in qs]
    lignes = [ligne for ligne in lignes if _correspond(ligne, q)]
    if statut == 'en_cours':
        lignes = [ligne for ligne in lignes if ligne.date_retour is None and not ligne.annulee]
    return sorted(lignes, key=lambda ligne: (ligne.date_depart, ligne.reference))


def annuler(obj, motif):
    """Soft-delete d'une ligne de registre (jamais de suppression physique :
    un registre est une pièce probante)."""
    motif = (motif or '').strip()
    if not motif:
        raise ValueError("Le motif d'annulation est obligatoire.")
    if not obj.is_active:
        raise ValueError("Cette ligne est déjà annulée.")
    obj.is_active = False
    obj.motif_annulation = motif
    obj.save(update_fields=['is_active', 'motif_annulation', 'updated_at'])

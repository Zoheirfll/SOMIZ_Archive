"""
employees/import_views.py
Import CSV des employés en masse
"""
import csv
import io
import logging
import openpyxl
from django.conf import settings
from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from accounts.permissions import IsAdmin
from employees.models import (
    Employee, Direction, Departement,
    Service, Poste, TypeContrat, Categorie, Contrat,
    ChampPersonnalise, EmployeeChampValeur,
)

logger = logging.getLogger('audit')


def _read_rows(file):
    """Lit un fichier .csv ou .xlsx et retourne (fieldnames, liste de dict).
    Le .xlsx évite toute la classe de bugs liée au délimiteur/ré-enregistrement
    d'un CSV dans Excel (colonnes réelles, pas de texte à ré-interpréter)."""
    if file.name.lower().endswith('.xlsx'):
        wb = openpyxl.load_workbook(file, read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration:
            return None, []
        fieldnames = [str(h).strip() if h is not None else '' for h in header_row]
        rows = []
        for raw_row in rows_iter:
            if raw_row is None or all(v is None for v in raw_row):
                continue
            row = {}
            for key, value in zip(fieldnames, raw_row):
                if not key:
                    continue
                if value is None:
                    row[key] = ''
                elif hasattr(value, 'isoformat'):  # date/datetime
                    row[key] = value.isoformat()[:10]
                else:
                    row[key] = str(value)
            rows.append(row)
        return fieldnames, rows

    # CSV
    try:
        content = file.read().decode('utf-8-sig')  # utf-8-sig gère le BOM Excel
    except UnicodeDecodeError:
        file.seek(0)
        content = file.read().decode('latin-1')  # Fallback pour Excel français

    sample = content[:1024]
    delimiter = ';' if sample.count(';') > sample.count(',') else ','
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    if not reader.fieldnames:
        return None, []
    return list(reader.fieldnames), list(reader)


def _check_csv_size(file):
    """Même limite que les uploads de documents — empêche un CSV énorme
    d'être chargé intégralement en mémoire (DoS)."""
    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if file.size > max_size:
        return Response(
            {'error': f'Fichier trop volumineux. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    return None


class EmployeeImportView(APIView):
    """
    POST /api/employees/import/
    Importe des employés depuis un fichier CSV.
    """
    permission_classes = [IsAdmin]

    # Colonnes obligatoires
    REQUIRED_COLS = {'matricule', 'numero_contrat', 'nom', 'prenom'}

    # Colonnes optionnelles structurelles — s'y ajoutent dynamiquement les
    # codes des ChampPersonnalise actifs (voir champs_actifs dans post()) ;
    # exposées ensemble via GET /ref/champs-personnalises/ pour le frontend
    # (page Import.jsx).
    OPTIONAL_COLS = {
        'date_naissance', 'date_embauche', 'statut',
        'direction', 'departement', 'service',
        'poste', 'type_contrat', 'categorie',
    }

    def post(self, request):
        file = request.FILES.get('file')

        if not file:
            return Response(
                {'error': 'Aucun fichier fourni.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not (file.name.lower().endswith('.csv') or file.name.lower().endswith('.xlsx')):
            return Response(
                {'error': 'Le fichier doit être au format CSV ou Excel (.xlsx).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        size_error = _check_csv_size(file)
        if size_error:
            return size_error

        try:
            fieldnames, rows = _read_rows(file)
        except Exception:
            logger.exception("Échec de la lecture du fichier d'import employés.")
            return Response(
                {'error': "Fichier illisible. Vérifiez le format (CSV ou .xlsx) et l'encodage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Vérifier les colonnes obligatoires
        if not fieldnames:
            return Response(
                {'error': 'Fichier vide ou mal formaté.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cols = {c.strip().lower() for c in fieldnames}
        missing = self.REQUIRED_COLS - cols
        if missing:
            return Response(
                {'error': f'Colonnes obligatoires manquantes : {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cache des référentiels pour éviter N requêtes BDD
        directions = {d.nom.upper(): d for d in Direction.objects.filter(is_active=True)}
        departements = {d.nom.upper(): d for d in Departement.objects.filter(is_active=True)}
        services = {s.nom.upper(): s for s in Service.objects.filter(is_active=True)}
        postes = {p.nom.upper(): p for p in Poste.objects.filter(is_active=True)}
        types_contrat = {t.nom.upper(): t for t in TypeContrat.objects.filter(is_active=True)}
        categories = {c.nom.upper(): c for c in Categorie.objects.filter(is_active=True)}

        # Champs personnalisés actifs — colonne CSV = code du champ en
        # minuscules (RIB -> 'rib'). Entièrement dynamique : un champ ajouté
        # ou supprimé dans /parametres est immédiatement pris en compte,
        # sans changement de code (voir Import.jsx qui liste ces mêmes
        # colonnes optionnelles dynamiquement).
        champs_actifs = {c.code.lower(): c for c in ChampPersonnalise.objects.filter(is_active=True)}

        # Matricules existants pour détecter les doublons
        matricules_existants = set(
            Employee.objects.values_list('matricule', flat=True)
        )

        resultats = []
        erreurs = []
        a_creer = []

        for num_ligne, row in enumerate(rows, start=2):
            # Nettoyer les clés et valeurs
            row = {k.strip().lower(): (v or '').strip() for k, v in row.items() if k}
            ligne_erreurs = []

            matricule = row.get('matricule', '').upper()
            nom = row.get('nom', '').upper()
            prenom = row.get('prenom', '').capitalize()

            # Validations
            if not matricule:
                ligne_erreurs.append("Matricule manquant")
            elif matricule in matricules_existants:
                ligne_erreurs.append(f"Matricule {matricule} déjà existant")

            if not nom:
                ligne_erreurs.append("Nom manquant")
            if not prenom:
                ligne_erreurs.append("Prénom manquant")

            # Statut
            statut = row.get('statut', 'actif').lower()
            if statut not in ['actif', 'inactif', 'archive']:
                statut = 'actif'

            # Dates
            date_naissance = row.get('date_naissance') or None
            date_embauche = row.get('date_embauche') or None

            # Référentiels — résolution par nom
            direction = directions.get(row.get('direction', '').upper())
            departement = departements.get(row.get('departement', '').upper())
            service = services.get(row.get('service', '').upper())
            poste = postes.get(row.get('poste', '').upper())
            type_contrat = types_contrat.get(row.get('type_contrat', '').upper())
            categorie = categories.get(row.get('categorie', '').upper())

            if ligne_erreurs:
                erreurs.append({
                    'ligne': num_ligne,
                    'matricule': matricule or '—',
                    'erreurs': ligne_erreurs,
                })
                continue

            # Ajouter au matricule cache pour éviter doublons dans le même CSV
            matricules_existants.add(matricule)

            numero_contrat = row.get('numero_contrat', '').strip()
            if not numero_contrat:
                ligne_erreurs.append("N° contrat obligatoire")
            elif not numero_contrat.isdigit():
                ligne_erreurs.append("N° contrat invalide : chiffres uniquement (ex : 024141)")

            if ligne_erreurs:
                erreurs.append({
                    'ligne': num_ligne,
                    'matricule': matricule or '—',
                    'erreurs': ligne_erreurs,
                })
                continue

            a_creer.append({
                'employee': Employee(
                    matricule=matricule,
                    nom=nom,
                    prenom=prenom,
                    date_naissance=date_naissance or None,
                    date_embauche=date_embauche or None,
                    statut=statut,
                    direction=direction,
                    departement=departement,
                    service=service,
                    poste=poste,
                    type_contrat=type_contrat,
                    categorie=categorie,
                    created_by=request.user,
                ),
                'numero_contrat': numero_contrat,
                'type_contrat_obj': type_contrat,
                'date_debut': date_embauche or None,
                'champs_valeurs': {
                    code_lower: row.get(code_lower, '').strip()
                    for code_lower in champs_actifs
                    if row.get(code_lower, '').strip()
                },
            })

            resultats.append({
                'ligne': num_ligne,
                'matricule': matricule,
                'nom': f"{prenom} {nom}",
                'statut': 'ok',
            })

        # Import en masse dans une transaction
        nb_crees = 0
        if a_creer:
            try:
                with transaction.atomic():
                    employees_objs = [item['employee'] for item in a_creer]
                    created = Employee.objects.bulk_create(employees_objs, batch_size=500)
                    nb_crees = len(created)
                    # Recharger les employés créés pour avoir les IDs (bulk_create ne retourne pas les IDs en PG < 10)
                    matricules = [e.matricule for e in created]
                    emp_map = {e.matricule: e for e in Employee.objects.filter(matricule__in=matricules)}
                    contrats_a_creer = []
                    for item in a_creer:
                        if item['numero_contrat']:
                            emp = emp_map.get(item['employee'].matricule)
                            if emp:
                                contrats_a_creer.append(Contrat(
                                    employee=emp,
                                    numero_contrat=item['numero_contrat'],
                                    type_contrat=item['type_contrat_obj'],
                                    date_debut=item['date_debut'],
                                    statut='actif',
                                    created_by=request.user,
                                ))
                    if contrats_a_creer:
                        Contrat.objects.bulk_create(contrats_a_creer, batch_size=500)

                    # Champs personnalisés (dynamiques — voir champs_actifs ci-dessus)
                    valeurs_a_creer = []
                    for item in a_creer:
                        emp = emp_map.get(item['employee'].matricule)
                        if not emp:
                            continue
                        for code_lower, valeur in item['champs_valeurs'].items():
                            champ = champs_actifs.get(code_lower)
                            if champ:
                                valeurs_a_creer.append(EmployeeChampValeur(
                                    employee=emp, champ=champ, valeur=valeur,
                                ))
                    if valeurs_a_creer:
                        EmployeeChampValeur.objects.bulk_create(valeurs_a_creer, batch_size=500)
            except Exception:
                logger.exception("Échec de l'import CSV employés.")
                return Response(
                    {'error': "Erreur lors de l'import. Vérifiez le format du fichier ou contactez un administrateur."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        return Response({
            'nb_crees': nb_crees,
            'nb_erreurs': len(erreurs),
            'nb_lignes': num_ligne - 1 if 'num_ligne' in locals() else 0,
            'erreurs': erreurs[:50],  # Max 50 erreurs affichées
            'succes': resultats[:10],  # Aperçu des 10 premiers créés
        })


class EmployeeImportTemplateView(APIView):
    """
    GET /api/employees/import/template/
    Retourne un fichier .xlsx template a telecharger.

    Distribue en .xlsx (plus en .csv) : un CSV edite dans Excel puis
    re-enregistre peut perdre son delimiteur (depend des parametres
    regionaux Windows/Excel de l'admin) et retomber en une seule colonne a
    la reouverture -- un classeur Excel a des colonnes reelles et n'a pas ce
    probleme. L'import (EmployeeImportView) accepte toujours les deux
    formats, .csv et .xlsx.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        from django.http import HttpResponse

        # Colonnes des champs personnalises actifs -- dynamiques, voir
        # champs_actifs dans EmployeeImportView.post().
        champs_codes = list(
            ChampPersonnalise.objects.filter(is_active=True).values_list('code', flat=True)
        )

        headers = [
            'matricule', 'numero_contrat', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'statut',
            'direction', 'departement', 'service',
            'poste', 'type_contrat', 'categorie',
            *[c.lower() for c in champs_codes],
        ]
        exemple = [
            '024141', '024141', 'FILALI', 'Zoheir',
            '2002-03-22', '2026-01-20', 'actif',
            'Direction Generale', 'DAP', 'Service Paie',
            'Cadre', 'CDI', '',
            *(['' for _ in champs_codes]),
        ]

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Employes'
        ws.append(headers)
        ws.append(exemple)
        for col_idx, header in enumerate(headers, start=1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(len(header) + 2, 14)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="template_import_employes.xlsx"'
        wb.save(response)
        return response


class ReferentielImportView(APIView):
    """
    POST /api/ref/import/{model}/
    Importe un référentiel depuis un CSV.
    model : directions, departements, services, postes, types-contrat, categories
    """
    permission_classes = [IsAdmin]

    MODELS = {
        'directions': {
            'model': Direction,
            'required': {'nom'},
            'optional': {'code', 'description'},
            'unique_field': 'nom',
        },
        'departements': {
            'model': Departement,
            'required': {'nom', 'direction'},
            'optional': {'code', 'description'},
            'unique_field': 'nom',
        },
        'services': {
            'model': Service,
            'required': {'nom', 'departement'},
            'optional': {'code', 'description'},
            'unique_field': 'nom',
        },
        'postes': {
            'model': Poste,
            'required': {'nom'},
            'optional': {'code', 'description'},
            'unique_field': 'nom',
        },
        'types-contrat': {
            'model': TypeContrat,
            'required': {'nom'},
            'optional': {'description'},
            'unique_field': 'nom',
        },
        'categories': {
            'model': Categorie,
            'required': {'nom'},
            'optional': {'description'},
            'unique_field': 'nom',
        },
    }

    def post(self, request, model):
        if model not in self.MODELS:
            return Response(
                {'error': f'Modèle inconnu : {model}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        config = self.MODELS[model]
        file = request.FILES.get('file')

        if not file:
            return Response({'error': 'Aucun fichier fourni.'}, status=400)

        if not (file.name.lower().endswith('.csv') or file.name.lower().endswith('.xlsx')):
            return Response({'error': 'Format CSV ou Excel (.xlsx) requis.'}, status=400)

        size_error = _check_csv_size(file)
        if size_error:
            return size_error

        try:
            fieldnames, rows = _read_rows(file)
        except Exception:
            logger.exception("Échec de la lecture du fichier d'import référentiel (%s).", model)
            return Response(
                {'error': "Fichier illisible. Vérifiez le format (CSV ou .xlsx) et l'encodage."},
                status=400
            )

        if not fieldnames:
            return Response({'error': 'Fichier vide ou mal formaté.'}, status=400)

        cols = {c.strip().lower() for c in fieldnames}
        missing = config['required'] - cols
        if missing:
            return Response(
                {'error': f'Colonnes obligatoires manquantes : {", ".join(missing)}'},
                status=400
            )

        # Cache référentiels parents
        directions_cache = {d.nom.upper(): d for d in Direction.objects.all()}
        departements_cache = {d.nom.upper(): d for d in Departement.objects.all()}

        # Noms existants pour détecter doublons
        ModelClass = config['model']
        existants = set(
            ModelClass.objects.values_list('nom', flat=True)
        )

        erreurs = []
        a_creer = []
        resultats = []

        for num_ligne, row in enumerate(rows, start=2):
            row = {k.strip().lower(): (v or '').strip() for k, v in row.items() if k}
            ligne_erreurs = []

            nom = row.get('nom', '').strip()
            if not nom:
                ligne_erreurs.append("Nom manquant")
            elif nom.upper() in {e.upper() for e in existants}:
                ligne_erreurs.append(f'"{nom}" existe déjà')

            code = row.get('code', '')
            description = row.get('description', '')

            # Résolution parent pour départements
            direction = None
            if model == 'departements':
                dir_nom = row.get('direction', '').upper()
                direction = directions_cache.get(dir_nom)
                if not dir_nom:
                    ligne_erreurs.append("Direction manquante")
                elif not direction:
                    ligne_erreurs.append(f'Direction "{row.get("direction")}" introuvable')

            # Résolution parent pour services
            departement = None
            if model == 'services':
                dept_nom = row.get('departement', '').upper()
                departement = departements_cache.get(dept_nom)
                if not dept_nom:
                    ligne_erreurs.append("Département manquant")
                elif not departement:
                    ligne_erreurs.append(f'Département "{row.get("departement")}" introuvable')

            if ligne_erreurs:
                erreurs.append({
                    'ligne': num_ligne,
                    'nom': nom or '—',
                    'erreurs': ligne_erreurs,
                })
                continue

            existants.add(nom.upper())

            # Construire l'objet selon le modèle
            kwargs = {'nom': nom, 'description': description}
            if code:
                kwargs['code'] = code
            if direction:
                kwargs['direction'] = direction
            if departement:
                kwargs['departement'] = departement

            a_creer.append(ModelClass(**kwargs))
            resultats.append({'ligne': num_ligne, 'nom': nom})

        nb_crees = 0
        if a_creer:
            try:
                with transaction.atomic():
                    ModelClass.objects.bulk_create(a_creer, batch_size=500)
                    nb_crees = len(a_creer)
            except Exception:
                logger.exception("Échec de l'import CSV référentiel (%s).", model)
                return Response(
                    {'error': "Erreur lors de l'import. Vérifiez le format du fichier ou contactez un administrateur."},
                    status=500
                )

        return Response({
            'nb_crees': nb_crees,
            'nb_erreurs': len(erreurs),
            'nb_lignes': num_ligne - 1 if 'num_ligne' in locals() else 0,
            'erreurs': erreurs[:50],
            'succes': resultats[:10],
        })


class ReferentielImportTemplateView(APIView):
    """
    GET /api/ref/import/{model}/template/
    Retourne le template .xlsx pour le modele (accepte aussi .csv en import).
    """
    permission_classes = [IsAdmin]

    TEMPLATES = {
        'directions': {
            'headers': ['nom', 'code', 'description'],
            'example': ['Direction Générale', 'DG', 'Direction principale'],
        },
        'departements': {
            'headers': ['nom', 'code', 'direction', 'description'],
            'example': ['DAP', 'DAP', 'Direction Générale', 'Département Administration du Personnel'],
        },
        'services': {
            'headers': ['nom', 'code', 'departement', 'description'],
            'example': ['Service Paie', 'SP', 'DAP', ''],
        },
        'postes': {
            'headers': ['nom', 'code', 'description'],
            'example': ['Ingénieur principal', 'ING-P', ''],
        },
        'types-contrat': {
            'headers': ['nom', 'description'],
            'example': ['CDI', 'Contrat à durée indéterminée'],
        },
        'categories': {
            'headers': ['nom', 'description'],
            'example': ['Cadre', ''],
        },
    }

    def get(self, request, model):
        from django.http import HttpResponse

        if model not in self.TEMPLATES:
            return Response({'error': f'Modele inconnu : {model}'}, status=400)

        config = self.TEMPLATES[model]

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = model[:31]
        ws.append(config['headers'])
        ws.append(config['example'])
        for col_idx, header in enumerate(config['headers'], start=1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = max(len(header) + 2, 14)

        response = HttpResponse(
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="template_{model}.xlsx"'
        wb.save(response)
        return response
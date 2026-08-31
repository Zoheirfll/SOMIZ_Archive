"""
apps/employees/serializers.py
Serializers Django REST Framework
"""

import json
import magic  # python-magic pour validation MIME réelle
from django.conf import settings
from rest_framework import serializers


from employees.models import (
    Employee, EmployeeDocument, EmployeeDocumentFile, TypeDocument, Contrat,
    ChampPersonnalise, HistoriqueFonction, HistoriqueCategorie, HistoriqueEchelle,
)


# ─── DOCUMENT ────────────────────────────────────────────────────────────────

class EmployeeDocumentFileSerializer(serializers.ModelSerializer):
    file_size_kb = serializers.FloatField(read_only=True)

    class Meta:
        model = EmployeeDocumentFile
        fields = [
            'id', 'file_name', 'file_size', 'file_size_kb',
            'mime_type', 'ordre', 'is_active', 'uploaded_at',
        ]
        read_only_fields = ['id', 'file_size', 'mime_type', 'uploaded_at']


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(
        source='uploaded_by.full_name', read_only=True
    )
    type_document = serializers.CharField(source='type_doc.code', read_only=True)
    type_document_label = serializers.CharField(source='type_doc.nom', read_only=True)
    type_doc_id = serializers.UUIDField(source='type_doc.id', read_only=True)
    type_document_parent = serializers.SerializerMethodField()
    # Ordre stable pour l'affichage : celui du type lui-même, ou — s'il
    # appartient à une catégorie — celui de la catégorie, pour que tout le
    # groupe reste positionné ensemble peu importe l'ordre des enfants.
    ordre = serializers.SerializerMethodField()
    # Ordre propre du type (pour trier les enfants entre eux dans une même
    # catégorie), distinct de `ordre` qui positionne le groupe entier.
    type_ordre = serializers.IntegerField(source='type_doc.ordre', read_only=True)
    obligatoire = serializers.BooleanField(source='type_doc.obligatoire', read_only=True)
    file_size_kb = serializers.FloatField(read_only=True)
    nb_fichiers = serializers.IntegerField(read_only=True)
    fichiers = EmployeeDocumentFileSerializer(many=True, read_only=True)
    couleur = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = [
            'id', 'type_doc', 'type_doc_id',
            'type_document', 'type_document_label', 'type_document_parent', 'obligatoire',
            'ordre', 'type_ordre', 'nb_fichiers', 'file_size_kb', 'fichiers', 'couleur',
            'version', 'is_active', 'contrat',
            'uploaded_by', 'uploaded_by_name', 'uploaded_at',
            'notes',
        ]
        read_only_fields = ['id', 'version', 'uploaded_by', 'uploaded_at']

    def get_type_document_parent(self, obj):
        return obj.type_doc.parent.nom if obj.type_doc.parent_id else None

    def get_couleur(self, obj):
        t = obj.type_doc
        return t.couleur or (t.parent.couleur if t.parent_id else '') or None

    def get_ordre(self, obj):
        t = obj.type_doc
        return t.parent.ordre if t.parent_id else t.ordre


# ─── CONTRAT ─────────────────────────────────────────────────────────────────

class ContratListSerializer(serializers.ModelSerializer):
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    nb_documents = serializers.IntegerField(read_only=True)
    employee_id = serializers.UUIDField(source='employee.id', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_nom = serializers.CharField(source='employee.full_name', read_only=True)
    employee_statut = serializers.CharField(source='employee.statut', read_only=True)

    class Meta:
        model = Contrat
        fields = [
            'id', 'numero_contrat',
            'employee_id', 'employee_matricule', 'employee_nom', 'employee_statut',
            'type_contrat', 'type_contrat_nom',
            'date_debut', 'date_fin', 'statut',
            'nb_documents', 'created_at',
        ]


class ContratDetailSerializer(serializers.ModelSerializer):
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    nb_documents = serializers.IntegerField(read_only=True)
    employee_id = serializers.UUIDField(source='employee.id', read_only=True)
    employee_matricule = serializers.CharField(source='employee.matricule', read_only=True)
    employee_nom = serializers.CharField(source='employee.full_name', read_only=True)
    documents = EmployeeDocumentSerializer(many=True, read_only=True, source='documents_actifs')

    class Meta:
        model = Contrat
        fields = [
            'id', 'numero_contrat',
            'employee_id', 'employee_matricule', 'employee_nom',
            'type_contrat', 'type_contrat_nom',
            'date_debut', 'date_fin', 'statut', 'notes',
            'nb_documents', 'documents',
            'created_at', 'updated_at',
        ]


class ContratCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contrat
        fields = [
            'numero_contrat', 'type_contrat',
            'date_debut', 'date_fin', 'statut', 'notes',
        ]

    def validate_numero_contrat(self, value):
        v = value.strip().upper()
        if not v:
            raise serializers.ValidationError("Le N° contrat ne peut pas être vide.")
        return v


class DocumentUploadSerializer(serializers.Serializer):
    """
    Upload de plusieurs fichiers pour un type de document.
    On hérite de Serializer (pas ModelSerializer) car
    on ne mappe pas directement un modèle — on crée
    EmployeeDocument + N EmployeeDocumentFile.
    """
    type_doc = serializers.PrimaryKeyRelatedField(
        # Seuls les types feuilles (pas de sous-types) sont uploadables —
        # une catégorie comme "État civil" n'est qu'un regroupement visuel.
        queryset=TypeDocument.objects.filter(is_active=True, sous_types__isnull=True)
    )
    files = serializers.ListField(
        child=serializers.FileField(),
        min_length=1,
        max_length=10,
    )
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_files(self, files):
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        for file in files:
            if file.size > max_size:
                raise serializers.ValidationError(
                    f"{file.name} trop lourd. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo."
                )
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            if mime not in settings.ALLOWED_MIME_TYPES:
                raise serializers.ValidationError(
                    f"{file.name} : type non autorisé ({mime})."
                )
        return files


class ScanImportPartSerializer(serializers.Serializer):
    file_index = serializers.IntegerField(min_value=0)
    pages = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False
    )
    is_image = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get("is_image") and not attrs.get("pages"):
            raise serializers.ValidationError(
                "Une part PDF doit préciser au moins une page."
            )
        return attrs


class ScanImportGroupSerializer(serializers.Serializer):
    type_doc = serializers.PrimaryKeyRelatedField(
        queryset=TypeDocument.objects.filter(is_active=True, sous_types__isnull=True)
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    parts = ScanImportPartSerializer(many=True)

    def validate_parts(self, parts):
        if not parts:
            raise serializers.ValidationError("Un groupe doit contenir au moins une part.")
        return parts


class ScanImportSerializer(serializers.Serializer):
    """
    Import groupé de fichiers scannés (PDF multi-pages et/ou images) pour
    un employé, répartis en plusieurs groupes/types de documents en une
    seule opération. `plan` est une chaîne JSON (envoyée en multipart aux
    côtés des fichiers) décrivant les groupes ; `file_index` dans chaque
    part référence la position du fichier dans `files`.
    """
    files = serializers.ListField(
        child=serializers.FileField(), min_length=1, max_length=20
    )
    plan = serializers.CharField()

    def validate_plan(self, value):
        try:
            data = json.loads(value)
        except (ValueError, TypeError):
            raise serializers.ValidationError("JSON invalide.")
        if not isinstance(data, dict) or "groups" not in data:
            raise serializers.ValidationError("Le plan doit contenir une clé 'groups'.")
        return data

    def validate(self, attrs):
        files = attrs["files"]
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        for file in files:
            if file.size > max_size:
                raise serializers.ValidationError(
                    f"{file.name} trop lourd. Maximum {settings.MAX_UPLOAD_SIZE_MB} Mo."
                )
            file.seek(0)
            mime = magic.from_buffer(file.read(2048), mime=True)
            file.seek(0)
            if mime not in settings.ALLOWED_MIME_TYPES:
                raise serializers.ValidationError(
                    f"{file.name} : type non autorisé ({mime})."
                )

        groups_serializer = ScanImportGroupSerializer(
            data=attrs["plan"]["groups"], many=True
        )
        if not groups_serializer.is_valid():
            raise serializers.ValidationError({"plan": groups_serializer.errors})

        total_pages = 0
        resolved_groups = []
        for group in groups_serializer.validated_data:
            resolved_parts = []
            for part in group["parts"]:
                idx = part["file_index"]
                if idx >= len(files):
                    raise serializers.ValidationError(
                        {"plan": f"file_index {idx} hors limites."}
                    )
                pages = part.get("pages") or []
                total_pages += len(pages) if pages else 1
                resolved_parts.append({
                    "file": files[idx],
                    "pages": pages or None,
                    "is_image": part.get("is_image", False),
                })
            resolved_groups.append({
                "type_doc": group["type_doc"],
                "notes": group.get("notes", ""),
                "parts": resolved_parts,
            })

        if total_pages > 100:
            raise serializers.ValidationError(
                "Maximum 100 pages au total par import."
            )

        attrs["groups"] = resolved_groups
        return attrs


# ─── EMPLOYEE ─────────────────────────────────────────────────────────────────

class EmployeeListSerializer(serializers.ModelSerializer):
    """
    Champs calculés (nb_documents, numero_contrat_actif, dossier_complet,
    taux_completude) reposent sur des annotations SQL faites dans
    EmployeeListCreateView.get_queryset() — évite le N+1 (une requête par
    ligne) qu'auraient causé des SerializerMethodField/properties par employé.
    """
    dossier_complet = serializers.SerializerMethodField()
    taux_completude = serializers.SerializerMethodField()
    nb_documents = serializers.IntegerField(read_only=True)
    numero_contrat_actif = serializers.CharField(read_only=True)
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    service_nom = serializers.CharField(source='service.nom', read_only=True)
    cellule_nom = serializers.CharField(source='cellule.nom', read_only=True, default=None)
    section_nom = serializers.CharField(source='section.nom', read_only=True, default=None)
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)
    has_photo = serializers.SerializerMethodField()
    champs_personnalises = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'numero_contrat_actif', 'nom', 'prenom',
            'date_naissance', 'date_embauche',
            'direction_nom', 'departement_nom', 'service_nom', 'cellule_nom', 'section_nom',
            'poste_nom', 'type_contrat_nom', 'categorie_nom', 'has_photo',
            'statut', 'dossier_complet', 'taux_completude', 'nb_documents',
            'champs_personnalises',
        ]

    def get_has_photo(self, obj):
        return bool(obj.photo)

    def get_champs_personnalises(self, obj):
        # Colonnes optionnelles du tableau /employees — voir Employees.jsx
        # (filtre "Colonnes"). Le queryset prefetch déjà valeurs+champ, donc
        # pas de N+1 ici.
        return {
            v.champ.code: v.valeur
            for v in obj.valeurs_personnalisees.all()
            if v.champ.is_active
        }

    def get_dossier_complet(self, obj):
        total_obligatoires = self.context.get('types_obligatoires_total', 0)
        if total_obligatoires == 0:
            return True
        return obj.nb_types_obligatoires_presents >= total_obligatoires

    def get_taux_completude(self, obj):
        total = self.context.get('types_total', 0)
        if total == 0:
            return 0
        return round(obj.nb_types_presents / total * 100)

class EmployeeDetailSerializer(serializers.ModelSerializer):
    documents = serializers.SerializerMethodField()
    dossier_complet = serializers.BooleanField(read_only=True)
    taux_completude = serializers.IntegerField(read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.full_name', read_only=True
    )
    documents_manquants = serializers.SerializerMethodField()

    # Noms des référentiels
    direction_nom = serializers.CharField(source='direction.nom', read_only=True)
    departement_nom = serializers.CharField(source='departement.nom', read_only=True)
    service_nom = serializers.CharField(source='service.nom', read_only=True)
    cellule_nom = serializers.CharField(source='cellule.nom', read_only=True, default=None)
    section_nom = serializers.CharField(source='section.nom', read_only=True, default=None)
    # Employee n'a pas de FK directe vers Pole (voir CLAUDE.md, section
    # Scoping) — uniquement via departement.pole, d'où l'absence de champ
    # 'pole' id ici (juste le nom, pour affichage seul sur la fiche employé).
    pole_nom = serializers.CharField(source='departement.pole.nom', read_only=True, default=None)
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)
    type_contrat_nom = serializers.CharField(source='type_contrat.nom', read_only=True)
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)
    has_photo = serializers.SerializerMethodField()
    champs_personnalises = serializers.SerializerMethodField()
    voie_hierarchique = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'date_fin_contrat', 'statut', 'has_photo',
            'direction', 'direction_nom',
            'pole_nom',
            'departement', 'departement_nom',
            'service', 'service_nom',
            'cellule', 'cellule_nom',
            'section', 'section_nom',
            'poste', 'poste_nom',
            'type_contrat', 'type_contrat_nom',
            'categorie', 'categorie_nom',
            'dossier_complet', 'taux_completude',
            'documents', 'documents_manquants', 'champs_personnalises',
            'voie_hierarchique',
            'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_voie_hierarchique(self, obj):
        return obj.voie_hierarchique()

    def get_champs_personnalises(self, obj):
        valeurs = {v.champ_id: v.valeur for v in obj.valeurs_personnalisees.all()}
        return [
            {
                'id': str(c.id),
                'code': c.code,
                'nom': c.nom,
                'type_champ': c.type_champ,
                'valeur': valeurs.get(c.id, ''),
                'ordre': c.ordre,
            }
            for c in ChampPersonnalise.objects.filter(is_active=True)
        ]

    def get_documents(self, obj):
        qs = obj.documents_actifs
        request = self.context.get('request')
        if request:
            type_ids = request.user.accessible_type_doc_ids_for_employee(obj)
            if type_ids is not None:
                qs = qs.filter(type_doc_id__in=type_ids)
        return EmployeeDocumentSerializer(qs, many=True).data

    def get_documents_manquants(self, obj):
        tous = TypeDocument.objects.filter(is_active=True, sous_types__isnull=True)
        request = self.context.get('request')
        if request:
            type_ids = request.user.accessible_type_doc_ids_for_employee(obj)
            if type_ids is not None:
                tous = tous.filter(id__in=type_ids)
        presents = set(
            obj.documents.filter(is_active=True).values_list('type_doc_id', flat=True)
        )
        manquants = tous.select_related('parent').exclude(id__in=presents)
        return [
            {
            'id': str(t.id),
            'code': t.code,
            'label': t.nom,
            'required': t.obligatoire,
            'parent_nom': t.parent.nom if t.parent_id else None,
            'ordre': t.parent.ordre if t.parent_id else t.ordre,
            'type_ordre': t.ordre,
            'couleur': t.couleur or (t.parent.couleur if t.parent_id else '') or None,
        }
        for t in manquants
    ]

    def get_has_photo(self, obj):
        return bool(obj.photo)

class EmployeeCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'date_embauche', 'date_fin_contrat', 'statut',
            'direction', 'departement', 'service', 'cellule', 'section',
            'poste', 'type_contrat', 'categorie',
        ]
        read_only_fields = ['id']
    def validate_matricule(self, value):
        return value.strip().upper()

    def validate_nom(self, value):
        return value.strip().upper()

    def validate_prenom(self, value):
        return value.strip().capitalize()

    def validate(self, attrs):
        # Une Cellule/Section est rattachée à une Direction OU un
        # Département — on aligne automatiquement direction/departement de
        # l'employé sur celui choisi, et on vide les deux autres champs
        # d'affectation terminale (service/cellule/section sont mutuellement
        # exclusifs), pour que le scoping CONSULTANT (basé sur ces champs)
        # continue de fonctionner sans modification.
        cellule = attrs.get('cellule', getattr(self.instance, 'cellule', None))
        section = attrs.get('section', getattr(self.instance, 'section', None))
        if cellule is not None:
            attrs['service'] = None
            attrs['section'] = None
            if cellule.departement_id:
                attrs['departement'] = cellule.departement
                attrs['direction'] = cellule.departement.direction
            else:
                attrs['departement'] = None
                attrs['direction'] = cellule.direction
        elif section is not None:
            attrs['service'] = None
            attrs['cellule'] = None
            if section.departement_id:
                attrs['departement'] = section.departement
                attrs['direction'] = section.departement.direction
            else:
                attrs['departement'] = None
                attrs['direction'] = section.direction
        return attrs


# ─── HISTORIQUE DE CARRIÈRE ───────────────────────────────────────────────────

class HistoriqueFonctionSerializer(serializers.ModelSerializer):
    poste_nom = serializers.CharField(source='poste.nom', read_only=True)

    class Meta:
        model = HistoriqueFonction
        fields = ['id', 'poste', 'poste_nom', 'date_debut', 'date_fin', 'commentaire']


class HistoriqueCategorieSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source='categorie.nom', read_only=True)

    class Meta:
        model = HistoriqueCategorie
        fields = ['id', 'categorie', 'categorie_nom', 'date_debut', 'date_fin', 'commentaire']


class HistoriqueEchelleSerializer(serializers.ModelSerializer):
    echelle_nom = serializers.CharField(source='echelle.nom', read_only=True)

    class Meta:
        model = HistoriqueEchelle
        fields = ['id', 'echelle', 'echelle_nom', 'date_debut', 'date_fin', 'commentaire']
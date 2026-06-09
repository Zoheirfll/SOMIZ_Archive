#!/bin/bash
# SOMIZ — Installation complète (Linux / macOS)
# Usage : chmod +x install.sh && ./install.sh

set -e

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        SOMIZ — Installation des dépendances         ║"
echo "║       Système d'Archivage des Dossiers RH            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Vérifications préalables ──────────────────────────────────────────────

echo "[1/6] Vérification de Python..."
if ! command -v python3 &>/dev/null; then
    echo " ERREUR : python3 n'est pas installé."
    echo " Ubuntu/Debian : sudo apt install python3 python3-venv python3-pip"
    exit 1
fi
echo " OK : $(python3 --version)"

echo ""
echo "[2/6] Vérification de Node.js..."
if ! command -v node &>/dev/null; then
    echo " ERREUR : Node.js n'est pas installé."
    echo " Ubuntu/Debian : sudo apt install nodejs npm"
    exit 1
fi
echo " OK : Node.js $(node --version)"
echo " OK : npm $(npm --version)"

# ─── Backend Python ─────────────────────────────────────────────────────────

echo ""
echo "[3/6] Création de l'environnement virtuel Python (backend/)..."
if [ -d "backend/venv" ]; then
    echo " INFO : Le dossier venv existe déjà, on le conserve."
else
    python3 -m venv backend/venv
    echo " OK : Environnement virtuel créé."
fi

echo ""
echo "[4/6] Installation des dépendances Python..."

# Sur Linux, utiliser python-magic au lieu de python-magic-bin
sed 's/python-magic-bin==0.4.14/python-magic==0.4.27/' backend/requirements.txt > /tmp/requirements_linux.txt

backend/venv/bin/pip install --upgrade pip --quiet
backend/venv/bin/pip install -r /tmp/requirements_linux.txt
rm /tmp/requirements_linux.txt
echo " OK : Toutes les dépendances Python sont installées."

# ─── Frontend Node.js ────────────────────────────────────────────────────────

echo ""
echo "[5/6] Installation des dépendances JavaScript (frontend/)..."
cd frontend
npm install --silent
cd ..
echo " OK : Toutes les dépendances JavaScript sont installées."

# ─── Configuration ──────────────────────────────────────────────────────────

echo ""
echo "[6/6] Vérification du fichier de configuration..."
if [ ! -f "backend/.env" ]; then
    echo " ATTENTION : Le fichier backend/.env est manquant."
    echo " Vous devez le créer avant de lancer l'application."
    echo ""
    echo " Exemple de contenu :"
    echo "   SECRET_KEY=remplacez_par_une_cle_secrete_longue"
    echo "   DEBUG=True"
    echo "   DB_NAME=somiz_db"
    echo "   DB_USER=postgres"
    echo "   DB_PASSWORD=votre_mot_de_passe"
    echo "   DB_HOST=localhost"
    echo "   DB_PORT=5432"
else
    echo " OK : Fichier .env trouvé."
fi

# ─── Résumé ─────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Installation terminée !                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo " Pour lancer l'application :"
echo ""
echo "   Backend  : cd backend && source venv/bin/activate && python manage.py runserver"
echo "   Frontend : cd frontend && npm start"
echo ""
echo " Ouvrir dans le navigateur : http://localhost:3000"
echo ""

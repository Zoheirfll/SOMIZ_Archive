@echo off
title SOMIZ - Installation complete

echo.
echo ================================================
echo   SOMIZ - Installation des dependances
echo   Systeme d'Archivage des Dossiers RH
echo ================================================
echo.

:: --- Verifications prealables ---

echo [1/5] Verification de Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR : Python n'est pas installe ou pas dans le PATH.
    echo Telecharger : https://www.python.org/downloads/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo OK : %%i

echo.
echo [2/5] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR : Node.js n'est pas installe ou pas dans le PATH.
    echo Telecharger : https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo OK : Node.js %%i
for /f "tokens=*" %%i in ('npm --version') do echo OK : npm %%i

:: --- Backend Python ---

echo.
echo [3/5] Installation de l'environnement virtuel Python...
if exist backend\venv (
    echo INFO : venv existe deja, on le conserve.
) else (
    python -m venv backend\venv
    if %errorlevel% neq 0 (
        echo ERREUR : Impossible de creer le venv.
        pause
        exit /b 1
    )
    echo OK : Environnement virtuel cree.
)

echo.
echo [4/5] Installation des dependances Python...
backend\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo ERREUR : Installation des dependances Python echouee.
    pause
    exit /b 1
)
echo OK : Dependances Python installees.

:: --- Frontend Node.js ---

echo.
echo [5/5] Installation des dependances JavaScript...
cd frontend
npm install
if %errorlevel% neq 0 (
    echo ERREUR : npm install a echoue.
    cd ..
    pause
    exit /b 1
)
cd ..
echo OK : Dependances JavaScript installees.

:: --- Configuration ---

echo.
if not exist backend\.env (
    echo ATTENTION : Le fichier backend\.env est manquant.
    echo Creez-le avant de lancer l'application.
) else (
    echo OK : Fichier .env trouve.
)

:: --- Fin ---

echo.
echo ================================================
echo   Installation terminee !
echo ================================================
echo.
echo Pour lancer l'application :
echo   Backend  : cd backend ^&^& venv\Scripts\activate ^&^& python manage.py runserver
echo   Frontend : cd frontend ^&^& npm start
echo.
echo Ouvrir dans le navigateur : http://localhost:3000
echo.
pause

# Démo via tunnel Cloudflare — rapide : build de production servi par Django (un seul port, même origine).
# Usage : .\scripts\demo-tunnel.ps1 [-SkipBuild]
# DEV/DÉMO UNIQUEMENT, jamais avec de vraies données RH (voir CLAUDE.md, section tunnel).
param([switch]$SkipBuild)

$root = Split-Path -Parent $PSScriptRoot

if (-not $SkipBuild) {
    Push-Location "$root\frontend"
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Build frontend échoué" }
    Pop-Location
    # Django lit index.html et /static depuis backend/frontend_build (settings.py)
    robocopy "$root\frontend\build" "$root\backend\frontend_build" /MIR /NFL /NDL /NJH /NJS | Out-Null
}

Write-Host "Pré-requis : Django doit tourner sur 127.0.0.1:8000 (python manage.py runserver 127.0.0.1:8000)."
Write-Host "Copier l'URL https://....trycloudflare.com affichée dans CLOUDFLARE_URL (backend/.env), puis redémarrer Django (CSRF)."

# http2 : évite les timeouts QUIC/UDP observés ; 127.0.0.1 : pas de résolution IPv6 de localhost
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8000

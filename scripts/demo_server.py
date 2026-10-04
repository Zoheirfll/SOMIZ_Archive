"""Serveur WSGI de démo (dev uniquement) : waitress au lieu de `runserver`.

Pourquoi : via un tunnel HTTP/2 (cloudflared), les uploads arrivent en
`Transfer-Encoding: chunked`, que `runserver` (HTTP/1.0) ne sait pas lire —
le POST échoue et le terminateur "0" est pris pour une requête invalide.
waitress gère le chunked. StaticFilesHandler sert /static comme runserver.
Usage (depuis backend/) : python ../scripts/demo_server.py
"""
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.contrib.staticfiles.handlers import StaticFilesHandler
from django.core.wsgi import get_wsgi_application
from pathlib import Path
import mimetypes
from waitress import serve

BUILD = Path(os.getcwd()) / "frontend_build"


def with_root_files(app):
    """Sert les fichiers de public/ à la racine (pdf.worker.min.js, logos...).

    Sans ça, la route fourre-tout de config/urls.py renvoie index.html pour
    /pdf.worker.min.js et le visionneur PDF affiche « Failed to load PDF file ».
    """
    def wrapper(environ, start_response):
        name = environ.get("PATH_INFO", "").lstrip("/")
        f = BUILD / name
        if name and "/" not in name and name != "index.html" and f.is_file():
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            if name.endswith(".js"):
                ctype = "application/javascript"
            data = f.read_bytes()
            start_response("200 OK", [("Content-Type", ctype), ("Content-Length", str(len(data)))])
            return [data]
        return app(environ, start_response)
    return wrapper

serve(with_root_files(StaticFilesHandler(get_wsgi_application())), host="127.0.0.1", port=8000,
      max_request_body_size=25 * 1024 * 1024 * 1024 // 1024)  # ~25 Mo, > limite 20 Mo/fichier

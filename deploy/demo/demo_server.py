"""Serveur WSGI de démo (dev uniquement) : waitress au lieu de `runserver`.

Pourquoi : via un tunnel HTTP/2 (cloudflared), les uploads arrivent en
`Transfer-Encoding: chunked`, que `runserver` (HTTP/1.0) ne sait pas lire —
le POST échoue et le terminateur "0" est pris pour une requête invalide.
waitress gère le chunked. StaticFilesHandler sert /static comme runserver.
Usage (depuis backend/) : python ../deploy/demo/demo_server.py
"""
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from django.contrib.staticfiles.handlers import StaticFilesHandler
from django.core.wsgi import get_wsgi_application
from waitress import serve

serve(StaticFilesHandler(get_wsgi_application()), host="127.0.0.1", port=8000,
      max_request_body_size=25 * 1024 * 1024 * 1024 // 1024)  # ~25 Mo, > limite 20 Mo/fichier

# Image backend SOMIZ (Django + gunicorn + Celery/OCR).
# Contexte de build : racine du dépôt (docker compose le fixe à "..").
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# libmagic (validation MIME), tesseract + langues ara/fra/eng et poppler (OCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
        libmagic1 libpq5 poppler-utils \
        tesseract-ocr tesseract-ocr-ara tesseract-ocr-fra tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# python-magic-bin n'existe que pour Windows/macOS : on le remplace par
# python-magic (Linux) à la volée plutôt que de modifier requirements.txt.
COPY backend/requirements.txt .
RUN sed -i 's/^python-magic-bin.*/python-magic==0.4.27/' requirements.txt \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN useradd --system --uid 1001 somiz \
    && mkdir -p /app/media /app/logs /app/staticfiles \
    && chown -R somiz:somiz /app/media /app/logs /app/staticfiles
USER somiz

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", \
     "--workers", "2", "--timeout", "60"]

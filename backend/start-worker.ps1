Set-Location $PSScriptRoot
& ".\venv\Scripts\celery.exe" -A config worker -l info --pool=solo

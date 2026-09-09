#!/bin/bash
# Dev launcher for the MetraScan AI service.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -e ".[paddle]"
fi

# Default to paddle (fastest, most accurate). Override via env: OCR_PROVIDER=tesseract ./run.sh
export OCR_PROVIDER="${OCR_PROVIDER:-paddle}"

echo "Starting MetraScan AI service with OCR_PROVIDER=$OCR_PROVIDER"
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Production Dockerfile for MetraScan AI/OCR Service
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required by OpenCV and PaddleOCR (OpenMP, GLib, OpenGL, Curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

# Copy project definition and install python dependencies with paddle support
COPY pyproject.toml .
COPY app ./app
RUN pip install --no-cache-dir -e ".[paddle]"

# Set production environment defaults
ENV PYTHONUNBUFFERED=1
ENV OCR_PROVIDER=paddle
ENV OCR_LANG=en
ENV PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]

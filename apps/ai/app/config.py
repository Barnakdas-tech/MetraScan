import os

try:
    # Load .env from the app root (apps/ai/.env) if present. No repo-visible
    # secret defaults exist; the operator sets AI_SERVICE_TOKEN in both the
    # API and AI service environments.
    from dotenv import load_dotenv

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:  # python-dotenv is optional; env vars still work
    pass


class Settings:
    """Environment-driven configuration."""

    OCR_PROVIDER: str = os.getenv("OCR_PROVIDER", "paddle")
    OCR_LANG: str = os.getenv("OCR_LANG", "en")
    MAX_IMAGE_BYTES: int = int(os.getenv("MAX_IMAGE_BYTES", str(10 * 1024 * 1024)))
    OCR_TIMEOUT_SECONDS: int = int(os.getenv("OCR_TIMEOUT_SECONDS", "120"))
    # Quality thresholds (tuned defaults; env-overridable for experimentation)
    BLUR_PASS: float = float(os.getenv("BLUR_PASS", "100.0"))
    BLUR_FAIL: float = float(os.getenv("BLUR_FAIL", "45.0"))
    BRIGHTNESS_MIN: float = float(os.getenv("BRIGHTNESS_MIN", "50"))
    BRIGHTNESS_MAX: float = float(os.getenv("BRIGHTNESS_MAX", "235"))
    CONTRAST_MIN: float = float(os.getenv("CONTRAST_MIN", "25"))


settings = Settings()

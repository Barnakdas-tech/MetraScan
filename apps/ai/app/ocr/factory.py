from ..config import settings
from .base import OCRResult
from .paddle_provider import PaddleOCRProvider
from .tesseract_provider import TesseractOCRProvider


def get_provider():
    """Return the configured OCR provider, falling back to tesseract when
    the primary engine cannot be imported on this machine."""
    if settings.OCR_PROVIDER == "paddle":
        try:
            import paddleocr  # noqa: F401

            return PaddleOCRProvider(lang=settings.OCR_LANG)
        except ImportError:
            pass
    if settings.OCR_PROVIDER in ("tesseract", "paddle"):
        try:
            import pytesseract  # noqa: F401

            return TesseractOCRProvider()
        except ImportError:
            pass
    raise RuntimeError("No OCR provider available (paddle/tesseract both missing)")


def empty_result(provider: str, error: str) -> OCRResult:
    return OCRResult(provider=provider, language=settings.OCR_LANG, regions=[], error=error)

"""OCR provider factory with graceful fallback.

Priority order:
  1. Honour OCR_PROVIDER env-var as the *preferred* engine.
  2. If that engine's Python package is unavailable, fall back to the other.
  3. If neither is importable, raise RuntimeError.
"""

import logging

from ..config import settings
from .base import OCRResult
from .paddle_provider import PaddleOCRProvider
from .tesseract_provider import TesseractOCRProvider

logger = logging.getLogger(__name__)


def _try_paddle() -> PaddleOCRProvider | None:
    try:
        import paddleocr  # noqa: F401
        return PaddleOCRProvider(lang=settings.OCR_LANG)
    except ImportError:
        logger.warning("paddleocr not importable — skipping paddle provider")
        return None


def _try_tesseract() -> TesseractOCRProvider | None:
    try:
        import pytesseract  # noqa: F401
        return TesseractOCRProvider()
    except ImportError:
        logger.warning("pytesseract not importable — skipping tesseract provider")
        return None


def get_provider() -> PaddleOCRProvider | TesseractOCRProvider:
    """Return the best available OCR provider.

    Tries the configured OCR_PROVIDER first, then falls back to the other.
    Raises RuntimeError only when *both* are unavailable.
    """
    preferred = settings.OCR_PROVIDER.lower()

    if preferred == "tesseract":
        order = [_try_tesseract, _try_paddle]
    else:  # "paddle" or anything else
        order = [_try_paddle, _try_tesseract]

    for loader in order:
        provider = loader()
        if provider is not None:
            if provider.name != preferred:
                logger.warning(
                    "OCR_PROVIDER=%s unavailable — using %s as fallback",
                    preferred,
                    provider.name,
                )
            return provider

    raise RuntimeError(
        f"No OCR provider available. "
        f"Configured={preferred!r}. "
        "Install paddleocr or pytesseract in the venv."
    )


def empty_result(provider: str, error: str) -> OCRResult:
    return OCRResult(provider=provider, language=settings.OCR_LANG, regions=[], error=error)

"""Tesseract fallback provider — used when Paddle is unavailable."""

import time

from .base import OCRRegion, OCRResult


class TesseractOCRProvider:
    name = "tesseract"

    def __init__(self, lang: str = "eng"):
        self.lang = lang

    def extract(self, image) -> OCRResult:
        import cv2
        import pytesseract

        started = time.monotonic()
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            data = pytesseract.image_to_data(gray, lang=self.lang, output_type=pytesseract.Output.DICT)
            regions: list[OCRRegion] = []
            n = len(data["text"])
            for i in range(n):
                text = (data["text"][i] or "").strip()
                conf = float(data["conf"][i])
                if text and conf > 0:
                    regions.append(
                        OCRRegion(
                            text=text,
                            confidence=conf / 100.0,
                            bbox=[
                                float(data["left"][i]),
                                float(data["top"][i]),
                                float(data["width"][i]),
                                float(data["height"][i]),
                            ],
                        )
                    )
            return OCRResult(
                provider=self.name,
                language=self.lang,
                regions=regions,
                processing_ms=int((time.monotonic() - started) * 1000),
            )
        except Exception as exc:
            return OCRResult(
                provider=self.name,
                language=self.lang,
                regions=[],
                error=f"{type(exc).__name__}: {exc}",
                processing_ms=int((time.monotonic() - started) * 1000),
            )

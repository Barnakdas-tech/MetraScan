"""PaddleOCR provider — the initial OCR engine (paddleocr >= 3.x API)."""

import time

import numpy as np

from .base import OCRRegion, OCRResult

_engine = None


class PaddleOCRProvider:
    name = "paddle"

    def __init__(self, lang: str = "en"):
        self.lang = lang

    def _get_engine(self):
        global _engine
        if _engine is None:
            from paddleocr import PaddleOCR  # lazy: heavy import + model download

            _engine = PaddleOCR(
                lang=self.lang,
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        return _engine

    @staticmethod
    def _poly_to_bbox(poly) -> list[float]:
        pts = np.array(poly, dtype=float).reshape(-1, 2)
        x = float(pts[:, 0].min())
        y = float(pts[:, 1].min())
        w = float(pts[:, 0].max() - x)
        h = float(pts[:, 1].max() - y)
        return [x, y, w, h]

    def extract(self, image) -> OCRResult:
        started = time.monotonic()
        try:
            engine = self._get_engine()
            pages = engine.predict(image)
            regions: list[OCRRegion] = []

            for page in pages or []:
                # paddleocr 3.x returns dict-like page objects
                texts = page.get("rec_texts") if hasattr(page, "get") else None
                if texts is None:
                    continue
                scores = page.get("rec_scores") or []
                polys = page.get("dt_polys") or []
                for text, score, poly in zip(texts, scores, polys):
                    text = (text or "").strip()
                    if not text:
                        continue
                    poly_pts = np.array(poly, dtype=float).reshape(-1, 2).tolist()
                    regions.append(
                        OCRRegion(
                            text=text,
                            confidence=float(score),
                            bbox=self._poly_to_bbox(poly),
                            poly=poly_pts,
                        )
                    )

            return OCRResult(
                provider=self.name,
                language=self.lang,
                regions=regions,
                processing_ms=int((time.monotonic() - started) * 1000),
            )
        except Exception as exc:  # provider failure is an observation, never a legal verdict
            return OCRResult(
                provider=self.name,
                language=self.lang,
                regions=[],
                error=f"{type(exc).__name__}: {exc}",
                processing_ms=int((time.monotonic() - started) * 1000),
            )

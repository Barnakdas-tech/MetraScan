"""OCRProvider interface — providers are replaceable without touching the Node API."""

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class OCRRegion:
    text: str
    confidence: float
    bbox: list[float]  # [x, y, width, height]
    poly: list[list[float]] | None = None  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]] original polygon


@dataclass
class OCRResult:
    provider: str
    language: str
    regions: list[OCRRegion] = field(default_factory=list)
    processing_ms: int = 0
    preprocessing_applied: list[str] = field(default_factory=list)
    error: str | None = None


class OCRProvider(Protocol):
    name: str

    def extract(self, image) -> OCRResult:
        """Run OCR on a BGR ndarray and return regions with confidence + bbox."""
        ...

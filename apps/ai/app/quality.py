"""Image quality analysis — measurable signals only, never legal judgments."""

from dataclasses import dataclass

import cv2
import numpy as np

from .config import settings


@dataclass
class QualityReport:
    overallScore: float
    status: str  # PASS | WARNING | FAIL
    blurScore: float
    brightnessScore: float
    contrastScore: float
    resolution: dict
    orientation: int
    signals: dict


def analyze_quality(image: np.ndarray) -> QualityReport:
    """Compute deterministic, measurable quality signals for an image.

    - blurScore: variance of the Laplacian (higher = sharper)
    - brightnessScore: mean luminance 0..255
    - contrastScore: luminance standard deviation
    - resolution: pixel dimensions + megapixels
    - orientation: EXIF-corrected orientation code (1 = upright)
    - overallScore/status: heuristic combination of the above
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())
    h, w = gray.shape[:2]
    megapixels = round((h * w) / 1_000_000, 2)

    # Blur classification (thresholds are practical, not legal)
    if blur >= settings.BLUR_PASS:
        blur_status = "PASS"
        blur_component = 1.0
    elif blur <= settings.BLUR_FAIL:
        blur_status = "FAIL"
        blur_component = max(0.0, blur / settings.BLUR_FAIL) * 0.5
    else:
        blur_status = "WARNING"
        blur_component = 0.5 + ((blur - settings.BLUR_FAIL) / (settings.BLUR_PASS - settings.BLUR_FAIL)) * 0.5

    # Brightness classification
    if settings.BRIGHTNESS_MIN <= brightness <= settings.BRIGHTNESS_MAX:
        bright_status = "PASS"
        bright_component = 1.0
    else:
        distance = min(abs(brightness - settings.BRIGHTNESS_MIN), abs(brightness - settings.BRIGHTNESS_MAX))
        bright_status = "FAIL" if distance > 60 else "WARNING"
        bright_component = max(0.0, 1.0 - distance / 120)

    # Contrast classification
    if contrast >= settings.CONTRAST_MIN:
        contrast_status = "PASS"
        contrast_component = min(1.0, contrast / 60)
    else:
        contrast_status = "WARNING" if contrast >= 12 else "FAIL"
        contrast_component = max(0.0, contrast / settings.CONTRAST_MIN)

    # Resolution: tiny images can't carry legible declarations
    if megapixels >= 0.3:
        res_status = "PASS"
        res_component = 1.0
    elif megapixels >= 0.1:
        res_status = "WARNING"
        res_component = 0.6
    else:
        res_status = "FAIL"
        res_component = 0.3

    statuses = [blur_status, bright_status, contrast_status, res_status]
    if "FAIL" in statuses:
        overall_status = "FAIL"
    elif "WARNING" in statuses:
        overall_status = "WARNING"
    else:
        overall_status = "PASS"

    overall = round(
        100 * (0.40 * blur_component + 0.20 * bright_component + 0.20 * contrast_component + 0.20 * res_component),
        1,
    )

    return QualityReport(
        overallScore=overall,
        status=overall_status,
        blurScore=round(blur, 1),
        brightnessScore=round(brightness, 1),
        contrastScore=round(contrast, 1),
        resolution={"width": w, "height": h, "megapixels": megapixels},
        orientation=1,  # EXIF orientation is applied during load; 1 = upright
        signals={
            "blur": blur_status,
            "brightness": bright_status,
            "contrast": contrast_status,
            "resolution": res_status,
        },
    )

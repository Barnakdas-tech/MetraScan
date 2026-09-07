"""Conservative, needs-based preprocessing. The original upload is never modified."""

import cv2
import numpy as np


def preprocess(image: np.ndarray, quality) -> np.ndarray:
    """Apply only the corrections the quality signals justify.

    Pipeline decisions:
    - Upscale small images (OCR degrades badly below ~1000px width)
    - Denoise only when blur is low (noise suppression hurts sharp text)
    - CLAHE contrast enhancement only when contrast is genuinely poor
    - Light sharpening for blurry inputs
    """
    out = image
    h, w = out.shape[:2]

    # 1. Resolution: upscale if too small for reliable OCR
    if quality.resolution["width"] < 1000:
        scale = 1000 / quality.resolution["width"]
        out = cv2.resize(out, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)

    # 2. Denoise only for sharp images (fastNlMeans would smear already-soft text)
    if quality.signals["blur"] == "PASS" or quality.signals["blur"] == "WARNING":
        if float(cv2.Laplacian(gray, cv2.CV_64F).var()) > 400:
            out = cv2.fastNlMeansDenoisingColored(out, None, 5, 5, 7, 21)

    # 3. Contrast enhancement for poor contrast
    if quality.signals["contrast"] in ("FAIL", "WARNING"):
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        l_channel, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        merged = cv2.merge((clahe.apply(l_channel), a, b))
        out = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)

    # 4. Sharpening for blurry captures
    if quality.signals["blur"] in ("FAIL", "WARNING"):
        kernel = np.array([[0, -0.5, 0], [-0.5, 3, -0.5], [0, -0.5, 0]])
        out = cv2.filter2D(out, -1, kernel)

    return out

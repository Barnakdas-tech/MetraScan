import io
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

from .config import settings
from .ocr import OCRResult
from .ocr.factory import empty_result, get_provider
from .preprocess import preprocess
from .quality import analyze_quality

app = FastAPI(title="MetraScan AI Service", version="0.1.0")


def load_image(data: bytes) -> np.ndarray:
    """Decode an upload into a BGR ndarray with EXIF orientation applied."""
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > settings.MAX_IMAGE_BYTES:
        raise HTTPException(413, "File exceeds size limit")
    try:
        pil = Image.open(io.BytesIO(data))
        pil = ImageOps.exif_transpose(pil)  # orientation correction; original untouched
        rgb = pil.convert("RGB")
        return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "Not a valid, decodable image")


def _quality_dict(report) -> dict:
    return {
        "overallScore": report.overallScore,
        "status": report.status,
        "blurScore": report.blurScore,
        "brightnessScore": report.brightnessScore,
        "contrastScore": report.contrastScore,
        "resolution": report.resolution,
        "orientation": report.orientation,
        "signals": report.signals,
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "metrascan-ai", "ocr_provider": settings.OCR_PROVIDER}


@app.post("/api/quality")
async def quality_endpoint(file: UploadFile = File(...)):
    started = time.monotonic()
    image = load_image(await file.read())
    report = analyze_quality(image)
    return {
        "success": True,
        "data": {
            "quality": _quality_dict(report),
            "processing_ms": int((time.monotonic() - started) * 1000),
        },
    }


@app.post("/api/ocr")
async def ocr_endpoint(file: UploadFile = File(...)):
    started = time.monotonic()
    image = load_image(await file.read())

    # 1. Quality first — preprocessing decisions are driven by its signals
    quality = analyze_quality(image)

    # 2. Needs-based preprocessing (original preserved; only the OCR input is derived)
    pre_steps: list[str] = []
    processed = image
    if quality.resolution["width"] < 1000:
        pre_steps.append("upscale")
    if quality.signals["blur"] in ("PASS", "WARNING"):
        pre_steps.append("denoise")
    if quality.signals["contrast"] in ("FAIL", "WARNING"):
        pre_steps.append("clahe_contrast")
    if quality.signals["blur"] in ("FAIL", "WARNING"):
        pre_steps.append("sharpen")
    if pre_steps:
        processed = preprocess(image, quality)

    # 3. OCR through the provider abstraction (on the preprocessed image)
    try:
        provider = get_provider()
    except RuntimeError as exc:
        result = empty_result("none", str(exc))
        return JSONResponse(
            status_code=503,
            content={
                "success": False,
                "error": {"code": "OCR_PROVIDER_UNAVAILABLE", "message": str(exc)},
            },
        )

    result: OCRResult = provider.extract(processed)

    if result.error:
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "error": {"code": "OCR_FAILED", "message": result.error},
                "data": {"provider": result.provider, "quality": _quality_dict(quality)},
            },
        )

    # 4. Normalize bboxes back to ORIGINAL image coordinates so overlays land
    # correctly on the source photograph (the preprocessed image may be scaled).
    orig_h, orig_w = image.shape[:2]
    proc_h, proc_w = processed.shape[:2]
    scale_x = orig_w / proc_w if proc_w else 1.0
    scale_y = orig_h / proc_h if proc_h else 1.0
    regions = []
    for r in result.regions:
        x, y, w, h = r.bbox
        region = {
            "text": r.text,
            "confidence": round(r.confidence, 4),
            "bbox": [round(x * scale_x, 1), round(y * scale_y, 1), round(w * scale_x, 1), round(h * scale_y, 1)],
        }
        if r.poly:
            region["poly"] = [[round(px * scale_x, 1), round(py * scale_y, 1)] for px, py in r.poly]
        regions.append(region)

    return {
        "success": True,
        "data": {
            "provider": result.provider,
            "language": result.language,
            "quality": _quality_dict(quality),
            "preprocessing": pre_steps,
            "regions": regions,
            "processing_ms": int((time.monotonic() - started) * 1000),
        },
    }

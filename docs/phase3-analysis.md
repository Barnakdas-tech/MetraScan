# Phase 3 - Analysis API

## POST /inspections/:id/analyze

INSPECTOR/ADMIN only, own inspection only. Runs the AI pipeline over every image: quality analysis, needs-based preprocessing, OCR, persistence. The inspection moves DRAFT -> PROCESSING -> COMPLETED. No legal validation occurs.

Response summary fields:

- inspectionId, aiServiceUp
- summary: images, processed, failed, partial
- results: per image (imageId, status PROCESSED/FAILED, regionCount, provider, error)
- note: "AI observations only"

Failure handling: per-image failures are recorded and processing continues with the remaining images. Error codes: AI service down 503 AI_SERVICE_UNAVAILABLE, timeout 504 AI_SERVICE_TIMEOUT, invalid image 400 AI_INVALID_IMAGE, OCR engine failure 502 OCR_FAILED. None of these are ever presented as legal findings.

## GET /inspections/:id/analysis

Returns per-image analysis state: quality score and status, OCR status, provider, full text, and every region with text, confidence, and bbox in original-image coordinates.

# MetraScan AI Service

This service handles Image Quality Analysis, OCR, Declaration Extraction, and Product Classification for the MetraScan Legal Metrology platform.

**Core Philosophy:** "AI-assisted, never AI-decisive."

This service extracts observations from images. It does not make legal compliance decisions.

## Architecture

*   `app/main.py`: FastAPI endpoints for quality and OCR.
*   `app/quality.py`: Rule-based image quality heuristics (blur, contrast).
*   `app/ocr/`: Provider-agnostic OCR abstraction (PaddleOCR / Tesseract).
*   `scripts/`: Python scripts for training new ML models via Active Learning.

## Active Learning Pipeline

MetraScan uses a human-in-the-loop Active Learning pipeline. 
When this AI service is uncertain (low extraction confidence), the API backend downgrades the compliance status to `REVIEW`, forcing a human officer to verify the extraction.

Human corrections are saved to the database without overwriting the original AI prediction. These corrections are periodically exported to train better models.

### Training Models

If you have collected enough human corrections in the platform, you can train updated models:

1.  Export the data from the API:
    ```bash
    cd ../apps/api
    npx tsx scripts/export_training_data.ts
    ```
2.  Run the training scripts:
    ```bash
    cd ../../
    ./apps/ai/scripts/train_classification.py \
      --train-data apps/api/training_data_exports/classification_train.jsonl \
      --val-data apps/api/training_data_exports/classification_val.jsonl \
      --test-data apps/api/training_data_exports/classification_test.jsonl \
      --version v1.0
    ```

For detailed documentation, see `docs/ai-training.md` in the project root.

# MetraScan AI Training & Active Learning

MetraScan implements a human-in-the-loop active learning system to progressively improve its AI capabilities while maintaining strict deterministic legal compliance.

**CRITICAL PRINCIPLE: AI-assisted, never AI-decisive.**
The AI is restricted to making observations (OCR, layout extraction, text classification). The legal engine (`packages/legal-engine`) evaluates compliance deterministically based on those observations. The AI does not make compliance decisions.

## The Active Learning Loop

1. **Upload & Analysis:** Officer uploads a package image. AI analyzes image quality and runs OCR.
2. **AI Extraction & Classification:** The AI extracts fields (MRP, Net Quantity, etc.) and classifies the product, recording an `extractionConfidence` score for each.
3. **Deterministic Evaluation:** The legal engine evaluates the AI's observations against Legal Metrology Rules.
4. **Confidence Gating:** If the legal engine determines a rule is a `PASS`, but the underlying AI extraction had a confidence score `< 0.7`, the system automatically downgrades the result to `REVIEW`.
5. **Human Verification:** The human officer reviews `REVIEW` flags. If the AI was wrong, they correct the value. This is saved as `Declaration.correctedValue` (never overwriting the AI's original `normalizedValue`).
6. **Dataset Export:** The script `apps/api/scripts/export_training_data.ts` exports these explicit human corrections into versioned JSONL datasets.
7. **Model Retraining:** Python scripts in `apps/ai/scripts/` train updated models using the exported datasets.
8. **Deployment:** New models are evaluated. If metrics (Precision, Recall, F1) improve, they are deployed as new model versions.

## Data Quality Controls

The training pipeline strictly enforces data quality:
- **Verified Examples Only:** The export script only pulls declarations that have a explicit human `correctedValue` or were explicitly approved in a human review (`ValidationResult.humanStatus`).
- **No Data Leakage:** The export script deterministically splits data by `inspectionId` or `productId`. This ensures that multiple declarations from the same package image are not split across `train` and `test` sets, which would cause artificial performance inflation.
- **Minimum Data Thresholds:** Training scripts will safely abort if there are insufficient verified examples (< 50) rather than fabricating inaccurate models.

## How to Export Data

Run the export script from the API package:
```bash
cd apps/api
npx tsx scripts/export_training_data.ts
```
This generates `extraction_train.jsonl`, `extraction_val.jsonl`, `classification_train.jsonl`, etc. in `apps/api/training_data_exports/`.

## How to Train Models

Run the Python training scripts from the project root:

**Classification:**
```bash
./apps/ai/scripts/train_classification.py \
  --train-data apps/api/training_data_exports/classification_train.jsonl \
  --val-data apps/api/training_data_exports/classification_val.jsonl \
  --test-data apps/api/training_data_exports/classification_test.jsonl \
  --version v1.1
```

**Extraction:**
```bash
./apps/ai/scripts/train_extraction.py \
  --train-data apps/api/training_data_exports/extraction_train.jsonl \
  --val-data apps/api/training_data_exports/extraction_val.jsonl \
  --version v1.1
```

*(Note: Models require `scikit-learn` and `joblib` in your Python environment).*

## Evaluation Metrics
The training scripts automatically evaluate models on the held-out validation and test sets.
They report:
- **Accuracy**
- **Precision (Weighted)**
- **Recall (Weighted)**
- **F1-Score (Weighted)**

Metadata and metrics are saved to `apps/ai/models/` alongside the model artifact (`.joblib` or `.pt`).

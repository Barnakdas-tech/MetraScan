# Database

PostgreSQL via Prisma ORM. Dev DB: `metrascan`, test DB: `metrascan_test`. All primary keys are UUIDs (`uuid()`); no sequential IDs are exposed. All models carry `createdAt` and (where mutable) `updatedAt`.

## Models

| Model | Purpose | Key fields |
|---|---|---|
| **User** | Account + role | email (unique), name, passwordHash, role (ADMIN/INSPECTOR/REVIEWER/VIEWER), isActive |
| **Inspection** | One inspection event | inspectionNumber (unique, INS-YYYY-NNNNNN), status (DRAFT/PROCESSING/COMPLETED/UNDER_REVIEW/CLOSED), inspectorId, productId, packageType (RETAIL/WHOLESALE/IMPORTED/UNKNOWN), inspectionDate, year, location, notes, overallResult (ValidationStatus, null until analysis) |
| **InspectionImage** | Uploaded photo | storageKey (unique, server-generated), originalFilename, mimeType, fileSize, width, height, sequence, uploadStatus (PENDING/UPLOADING/UPLOADED/FAILED), qualityScore (Phase 3+), ocrStatus (Phase 3+), analysisStatus (Phase 4+) |
| **InspectionCounter** | Per-year number sequence | year (PK), lastNumber — backs the INS-YYYY-NNNNNN generator |
| **OcrResult** | One OCR run over one image | provider, language, qualityReport (JSON), preprocessing (JSON), fullText, regionCount, processingMs, success, error |
| **OcrRegion** | A single detected text region | text, confidence, bbox (JSON), seq |
| **Declaration** (Phase 4) | Structured field candidate | field, rawText, normalizedValue, correctedValue + correctionNote + correctedById (human corrections stored alongside; AI extraction never overwritten), unit, currency, confidences, detectionMethod, bbox, ocrRegionIds |
| **Product** | Product record | name, genericName, brand, manufacturer, category |
| **Declaration** | Extracted label field (Phase 3) | field, rawText, normalizedValue, unit, currency, ocrConfidence, extractionConfidence, detectionMethod, bbox (JSON), imageId |
| **Rule** | Rule identity | ruleKey (unique) — parent for versions |
| **RuleVersion** | Versioned rule content (Phase 4) | ruleNumber, subRule, source, title, requirement, scope, applicability (JSON), exceptions (JSON), requiredEvidence (JSON), validatorKey, effectiveFrom, effectiveTo, status, notes |
| **ValidationResult** | One rule outcome (Phase 5) | inspectionId, ruleVersionId, ruleId, status (PASS/FAIL/REVIEW/NOT_APPLICABLE/MANUAL_REQUIRED), confidence, reason, evidence (JSON) |
| **Violation** | Detected violation (Phase 5) | inspectionId, validationResultId, ruleId, severity, description, correctedByReview |
| **Evidence** | Raw observation record (Phase 3) | inspectionId, imageId, kind (OCR/VISION/QR/MANUAL), bbox, snippet, payload |
| **Review** | Human review decision (Phase 6) | inspectionId, reviewerId, decision, notes |
| **Report** | Generated PDF (Phase 6) | inspectionId, generatedById, format, storageKey |
| **AuditLog** | Important action trail | actorId, action, entityType, entityId, metadata |

## Relationships

```
User 1──* Inspection (inspector, SetNull on delete)
User 1──* Review, Report, AuditLog
Product 1──* Inspection (SetNull)
Inspection 1──* InspectionImage, Declaration, ValidationResult, Violation, Evidence, Review, Report (Cascade)
InspectionImage 1──* Declaration (SetNull)
Rule 1──* RuleVersion (Cascade)
RuleVersion 1──* ValidationResult (SetNull)
ValidationResult 1──* Violation (SetNull)
Declaration 1──* ValidationResult (SetNull, optional evidence link)
```

Deletion policy: deleting an Inspection cascades to its whole evidence chain; User/Product deletion detaches (SetNull) so records outlive account/product changes.

## Migrations

```bash
pnpm db:migrate   # dev: create/apply migrations
pnpm db:deploy    # production-style: apply pending only
pnpm db:generate  # regenerate the client after schema edits
pnpm db:studio    # browse data
```

Current migration: `20260904201450_init` (initial full schema).

> Phase 2 note: schema evolution after `init` was applied via `prisma db push` in the local dev DB (image model fields, Inspection.year, InspectionCounter, UploadStatus enum). When first deploying elsewhere, run `prisma migrate dev` to fold the drift into a named migration, or `prisma db push` for a disposable environment.

## Design Notes

- **UUIDs everywhere** — public identifiers never leak row counts.
- **Rule/RuleVersion split** — the rule engine consumes dated versions; amendments become new rows, not edits. Withdrawn provisos (e.g., wef 01.07.2012 per GSR 748(E)) get `effectiveTo` set so a 2026 inspection never applies them.
- **JSON columns for evidence/applicability** — structured payloads (bbox arrays, predicate objects) that don't merit further normalization yet; the legal engine (Phase 4) will define their exact shapes.
- **qualityReport on InspectionImage** — image quality results stay attached to the image they describe.
- **UploadStatus lifecycle** — files are created UPLOADED after passing validation; the per-file quality gate (later phase) will transition qualityScore/ocrStatus/analysisStatus independently so partial failures never lie about state.

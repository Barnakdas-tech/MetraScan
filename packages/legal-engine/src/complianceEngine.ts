import type {
  ApplicabilityInput,
  ApplicabilityResult,
  ComplianceResult,
  DeclarationEvidence,
  ValidationOutcome,
  VisualEvidence,
} from "./types.js";
import { evaluateApplicability } from "./engine.js";
import { validateNetQuantity } from "./validators/quantityValidator.js";
import {
  validateManufacturerDetails,
  validateGenericName,
  validateManufactureDate,
  validateMrp,
  validateConsumerCare,
} from "./validators/declarationValidators.js";
import {
  validateNumeralSize,
  validateDeclarationSpacing,
  validateContrast,
  validateQuantityWording,
  validateArchaicCounting,
  validateDimensions,
  validateCountryOfOrigin,
  validateUnitSalePrice,
} from "./validators/specialValidators.js";
import { validateWholesaleDeclarations } from "./validators/wholesaleValidator.js";

/**
 * THE DETERMINISTIC COMPLIANCE ENGINE.
 * Pipeline: declarations + visual evidence + applicability → validators → results.
 * AI/OCR produced the observations; this engine makes every legal status decision
 * with deterministic code. No LLM call anywhere in this file.
 */
export function evaluateCompliance(
  input: ApplicabilityInput,
  declarations: DeclarationEvidence[],
  visual: VisualEvidence
): ComplianceResult {
  const applicability: ApplicabilityResult = evaluateApplicability(input);
  const applicableIds = new Set(applicability.applicableRules.map(r => r.ruleId));
  const reviewIds = new Set(applicability.reviewRequiredRules.map(r => r.ruleId));
  const inspectionDate = input.inspectionDate instanceof Date ? input.inspectionDate : new Date(input.inspectionDate);

  const outcomes: ValidationOutcome[] = [];

  const add = (outcome: ValidationOutcome) => outcomes.push(outcome);

  // Rule 24 — wholesale packages have their own Chapter III declaration set:
  // manufacturer/importer/packer identity + address, commodity identity, and
  // total retail packages OR net quantity. Chapter II retail validators do
  // not apply to a wholesale package.
  if (applicableIds.has("R24")) {
    add(validateWholesaleDeclarations(declarations, visual, input.specialLawCategory));
  }

  // Rule 6(1)(a) — manufacturer/packer/importer
  if (applicableIds.has("R6.1a")) add(validateManufacturerDetails(declarations, visual, input.imported));
  else if (reviewIds.has("R6.1a")) add(skippedForReview("R6.1a", applicability));

  // Rule 6(1)(b) — generic name
  if (applicableIds.has("R6.1b")) add(validateGenericName(declarations, visual));
  else if (reviewIds.has("R6.1b")) add(skippedForReview("R6.1b", applicability));

  // Rule 6(1)(c) + Rule 13 units
  if (applicableIds.has("R6.1c")) {
    add(validateNetQuantity(declarations, visual));
    const qty = declarations.find(d => d.field === "netQuantity");
    add(validateQuantityWording(qty ?? null, inspectionDate));
    add(validateArchaicCounting(qty ?? null));
  } else if (reviewIds.has("R6.1c")) {
    add(skippedForReview("R6.1c", applicability));
  }

  // Rule 6(1)(d) — date
  if (applicableIds.has("R6.1d")) add(validateManufactureDate(declarations, visual));
  else if (reviewIds.has("R6.1d")) add(skippedForReview("R6.1d", applicability));

  // Rule 6(1)(e) — MRP
  if (applicableIds.has("R6.1e")) add(validateMrp(declarations, visual));
  else if (reviewIds.has("R6.1e")) add(skippedForReview("R6.1e", applicability));

  // Rule 6(2) — consumer care
  if (applicableIds.has("R6.2")) add(validateConsumerCare(declarations, visual));
  else if (reviewIds.has("R6.2")) add(skippedForReview("R6.2", applicability));

  // Rule 7 — numeral size (always honest: uncalibrated → MANUAL_REQUIRED).
  // Rule 7 sets the height of numerals in declarations made under these rules
  // on the principal display panel — only triggered once a Chapter II
  // declaration requirement applies (guarded by R6.1c, the net-quantity clause).
  if (applicableIds.has("R6.1c")) {
    add(validateNumeralSize({ calibrated: false, netQuantityValue: input.quantity, netQuantityUnit: input.quantityUnit }));
  }

  // Rule 8(1) — spacing; Rule 9(1)(b) — contrast (visual, not OCR)
  if (applicableIds.has("R6.1c")) {
    add(validateDeclarationSpacing({ visualAnalysisAvailable: false }));
    add(validateContrast({ visualAnalysisAvailable: false }));
  }

  // Rule 14 — dimensions (product-gated)
  add(validateDimensions(
    declarations.map(d => ({ field: d.field, rawText: d.rawText, normalizedValue: d.normalizedValue, correctedValue: d.correctedValue, confidence: d.confidence, imageId: d.imageId, bbox: d.bbox })),
    input.productCategory,
    visual
  ));

  // Honest NOT_APPLICABLE for fields with no source basis in the supplied base text
  add(validateCountryOfOrigin());
  add(validateUnitSalePrice());

  // --- Aggregate ---
  const applicableOutcomes = outcomes.filter(o => o.status !== "NOT_APPLICABLE");
  const failed = applicableOutcomes.filter(o => o.status === "FAIL");
  const reviews = applicableOutcomes.filter(o => o.status === "REVIEW");
  const manual = applicableOutcomes.filter(o => o.status === "MANUAL_REQUIRED");
  const passed = applicableOutcomes.filter(o => o.status === "PASS");

  // Aggregation contract: any FAIL → NON_COMPLIANT; unresolved REVIEW/MANUAL → REVIEW_REQUIRED;
  // only all-PASS (with MANUAL items not blocking — they're physical checks flagged for the officer) → COMPLIANT.
  let verdict: ComplianceResult["verdict"];
  if (failed.length > 0) {
    verdict = "NON_COMPLIANT";
  } else if (reviews.length > 0) {
    verdict = "REVIEW_REQUIRED";
  } else if (manual.length > 0) {
    // Physical checks requiring instruments are pending — not resolved compliance.
    verdict = "REVIEW_REQUIRED";
  } else if (passed.length > 0) {
    verdict = "COMPLIANT";
  } else {
    verdict = "REVIEW_REQUIRED";
  }

  return {
    verdict,
    results: outcomes,
    summary: {
      applicableChecked: applicableOutcomes.length,
      passed: passed.length,
      failed: failed.length,
      review: reviews.length,
      manualRequired: manual.length,
      notApplicable: outcomes.length - applicableOutcomes.length,
    },
    note: "Deterministic engine result. AI/OCR supplied observations only; every status here is computed by rule code, not a model. Human review remains the final authority.",
  };
}

function skippedForReview(ruleId: string, applicability: ApplicabilityResult): ValidationOutcome {
  const r = applicability.reviewRequiredRules.find(x => x.ruleId === ruleId);
  return {
    ruleId,
    status: "REVIEW",
    confidence: 0.4,
    reason: `Applicability itself is unresolved: ${r?.reason ?? "classification evidence missing"}`,
    evidence: null,
    inputs: {},
    validatorVersion: "applicability-gate-v1",
    source: r?.source,
  };
}

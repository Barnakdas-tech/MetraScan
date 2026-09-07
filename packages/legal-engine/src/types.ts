/**
 * Legal-engine core types.
 *
 * The engine decides ONLY "which rules apply" — never "does the package comply".
 */

export type ApplicabilityStatus = "APPLICABLE" | "NOT_APPLICABLE" | "REVIEW";

/** Compliance statuses — the ONLY allowed strings. */
export type ValidationStatus = "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "MANUAL_REQUIRED";

/** The single allowed REVIEW reason vocabulary (all map to missing evidence). */
export type ReviewReason =
  | "PACKAGE_TYPE_UNKNOWN"
  | "PRODUCT_CATEGORY_UNKNOWN"
  | "INTENDED_CONSUMER_UNKNOWN"
  | "QUANTITY_UNKNOWN"
  | "SPECIAL_CATEGORY_UNKNOWN"
  | "IMPORTED_STATUS_UNKNOWN";

export interface ApplicabilityInput {
  inspectionDate: string | Date;
  packageType: "RETAIL" | "WHOLESALE" | "IMPORTED" | "UNKNOWN";
  /** Retail-sale chain vs industrial/institutional consumer (Rule 3(b)). */
  intendedConsumer: "RETAIL" | "INDUSTRIAL" | "INSTITUTIONAL" | "UNKNOWN";
  productCategory:
    | "food" | "beverage" | "cosmetic" | "garment" | "household"
    | "electronic" | "chemical" | "industrial" | "other" | "unknown" | "textile" | "fabric";
  quantity: number | null;
  quantityUnit: string | null;
  imported: boolean | null;
  countryOfOrigin: string | null;
  /** e.g. "seeds-certified", "scheduled-formulation", "fast-food-restaurant" */
  productSpecialCategory: string | null;
  /** e.g. "alcoholic-beverage" — when another law governs a sub-requirement. */
  specialLawCategory: string | null;
  packagePurpose: "SALE" | "DISTRIBUTION" | "DELIVERY" | "INDUSTRIAL_USE" | "INSTITUTIONAL_USE" | "UNKNOWN";
}

export interface RuleCondition {
  /** Human-readable condition (for explanations). */
  description: string;
  /** Deterministic predicate. Returns tri-state + optional detail explaining the outcome. */
  evaluate: (input: ApplicabilityInput) => { ok: boolean | null; reviewReason?: ReviewReason; detail?: string };
}

export interface LegalRule {
  ruleId: string;
  ruleNumber: string;
  subRule?: string;
  version: number;
  effectiveFrom: string; // ISO date
  effectiveTo: string | null; // null = currently in force
  scope: string;
  title: string;
  conditions: RuleCondition[];
  exceptions: string[]; // human-readable, source-cited
  source: string; // exact citation from the supplied PDF
  status: "ACTIVE" | "WITHDRAWN";
  notes?: string;
}

export interface ApplicabilityDecision {
  ruleId: string;
  ruleNumber: string;
  subRule?: string;
  title: string;
  status: ApplicabilityStatus;
  reason: string;
  source: string;
  exceptions?: string[];
}

export interface ApplicabilityResult {
  inspectionDate: string;
  resolvedLegalVersion: string;
  applicableRules: ApplicabilityDecision[];
  nonApplicableRules: ApplicabilityDecision[];
  reviewRequiredRules: ApplicabilityDecision[];
  note: string;
}

/** A structured declaration (Phase 4 output) as consumed by validators. */
export interface DeclarationEvidence {
  field: string;
  rawText: string;
  normalizedValue: string | null;
  correctedValue: string | null;
  unit: string | null;
  currency: string | null;
  confidence: number | null;
  imageId: string | null;
  bbox: number[] | null;
}

/** Aggregated evidence about what the images actually showed. */
export interface VisualEvidence {
  /** True if at least one analyzed image was of sufficient quality to read declarations. */
  anyImageSufficientQuality: boolean;
  /** True if OCR ran successfully on at least one image (i.e., text was searched for). */
  ocrRan: boolean;
  /** Total OCR regions detected across analyzed images. */
  totalRegions: number;
  /** Images analyzed. */
  imageCount: number;
}

export interface ValidationOutcome {
  ruleId: string;
  status: ValidationStatus;
  confidence: number;
  reason: string;
  evidence: {
    imageId: string | null;
    bbox: number[] | null;
    text: string | null;
  } | null;
  inputs: Record<string, unknown>;
  validatorVersion: string;
  source?: string;
}

/** Aggregated inspection verdict. */
export type InspectionVerdict = "COMPLIANT" | "NON_COMPLIANT" | "REVIEW_REQUIRED";

export interface ComplianceResult {
  verdict: InspectionVerdict;
  results: ValidationOutcome[];
  summary: {
    applicableChecked: number;
    passed: number;
    failed: number;
    review: number;
    manualRequired: number;
    notApplicable: number;
  };
  note: string;
}

export interface ValidationOutcome {
  ruleId: string;
  status: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "MANUAL_REQUIRED";
  confidence: number;
  reason: string;
  evidence: { imageId: string | null; bbox: number[] | null; text: string | null } | null;
  inputs: Record<string, unknown>;
  validatorVersion: string;
  source?: string;
}

export interface ComplianceResult {
  verdict: "COMPLIANT" | "NON_COMPLIANT" | "REVIEW_REQUIRED";
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

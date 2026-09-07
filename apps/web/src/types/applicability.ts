export interface ApplicabilityDecision {
  ruleId: string;
  ruleNumber: string;
  subRule?: string;
  title: string;
  status: "APPLICABLE" | "NOT_APPLICABLE" | "REVIEW";
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

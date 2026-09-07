export interface StoredValidationResult {
  id: string;
  ruleId: string;
  status: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "MANUAL_REQUIRED";
  confidence: number;
  reason: string;
  evidence: { imageId: string | null; bbox: number[] | null; text: string | null } | null;
  validatorVersion: string | null;
  inputs: unknown;
  source: string | null;
  humanStatus: string | null;
  humanComment: string | null;
}

export interface StoredViolation {
  id: string;
  ruleId: string;
  severity: string;
  description: string;
}

export interface ReviewRecord {
  id: string;
  decision: string;
  notes: string | null;
  ruleId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  reviewer: { id: string; name: string; role: string } | null;
}

export interface ReviewHistory {
  inspectionId: string;
  reviews: ReviewRecord[];
  auditLogs: unknown[];
}

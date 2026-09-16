import type { ValidationOutcome } from "./types.js";
import { getConfidenceThreshold } from "./config.js";

/**
 * Implements Confidence-Aware Compliance Routing.
 * 
 * Rules:
 * - High confidence + deterministic PASS -> AUTO PASS
 * - High confidence + deterministic FAIL -> AUTO FAIL
 * - Low confidence -> REVIEW
 * - MANUAL_REQUIRED -> MANUAL_REQUIRED (cannot override)
 * - NOT_APPLICABLE -> NOT_APPLICABLE
 * - Ambiguous evidence (validator returned REVIEW) -> REVIEW
 */
export function routeOutcome(outcome: ValidationOutcome, threshold: number = getConfidenceThreshold()): ValidationOutcome {
  // Graceful fallback for invalid threshold configuration
  const safeThreshold = (typeof threshold !== "number" || Number.isNaN(threshold) || threshold < 0 || threshold > 1) 
    ? 0.90 
    : threshold;

  const inputs = { ...outcome.inputs, thresholdUsed: safeThreshold };

  if (outcome.status === "NOT_APPLICABLE") {
    return { ...outcome, inputs: { ...inputs, routingReason: "NOT_APPLICABLE" } };
  }

  if (outcome.status === "MANUAL_REQUIRED") {
    return {
      ...outcome,
      inputs: { ...inputs, routingReason: "MANUAL_REQUIRED_PHYSICAL_CHECK" }
    };
  }

  if (outcome.status === "REVIEW") {
    return {
      ...outcome,
      inputs: { ...inputs, routingReason: "REVIEW_AMBIGUOUS_EVIDENCE" }
    };
  }

  // Determine if evidence is sufficiently reliable based on the confidence gate
  if (outcome.confidence < safeThreshold) {
    return {
      ...outcome,
      status: "REVIEW",
      inputs: { ...inputs, routingReason: "REVIEW_LOW_CONFIDENCE" },
      reason: `Evidence confidence ${Math.round(outcome.confidence * 100)}% — human verification required (threshold ${Math.round(safeThreshold * 100)}%). ${outcome.reason}`
    };
  }

  // Sufficiently reliable evidence + deterministic validator outcome
  if (outcome.status === "PASS") {
    return {
      ...outcome,
      inputs: { ...inputs, routingReason: "AUTO_PASS" },
      reason: `Automatically verified — evidence confidence ${Math.round(outcome.confidence * 100)}%. ${outcome.reason}`
    };
  }

  if (outcome.status === "FAIL") {
    return {
      ...outcome,
      inputs: { ...inputs, routingReason: "AUTO_FAIL" },
      reason: `Automatic failure — evidence confidence ${Math.round(outcome.confidence * 100)}%. ${outcome.reason}`
    };
  }

  return { ...outcome, inputs };
}

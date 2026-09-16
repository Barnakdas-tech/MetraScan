import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { routeOutcome } from "@metrascan/legal-engine/src/routing.js";
import type { ValidationOutcome } from "@metrascan/legal-engine/src/types.js";

describe("Confidence-Aware Compliance Routing", () => {
  const baseOutcome: ValidationOutcome = {
    ruleId: "TEST",
    status: "PASS",
    confidence: 1.0,
    reason: "Test reason",
    evidence: null,
    inputs: {},
    validatorVersion: "v1",
  };

  const OLD_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("TEST 1 & 2: High confidence + PASS -> AUTO PASS", () => {
    const res1 = routeOutcome({ ...baseOutcome, confidence: 0.95, status: "PASS" });
    expect(res1.status).toBe("PASS");
    expect(res1.inputs.routingReason).toBe("AUTO_PASS");
    expect(res1.reason).toMatch(/Automatically verified/);

    const res2 = routeOutcome({ ...baseOutcome, confidence: 0.90, status: "PASS" });
    expect(res2.status).toBe("PASS");
    expect(res2.inputs.routingReason).toBe("AUTO_PASS");
  });

  it("TEST 3: Confidence below threshold -> REVIEW", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.89, status: "PASS" });
    expect(res.status).toBe("REVIEW");
    expect(res.inputs.routingReason).toBe("REVIEW_LOW_CONFIDENCE");
    expect(res.reason).toMatch(/Evidence confidence 89%/);
  });

  it("TEST 4: High confidence + FAIL -> AUTO FAIL", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.99, status: "FAIL" });
    expect(res.status).toBe("FAIL");
    expect(res.inputs.routingReason).toBe("AUTO_FAIL");
    expect(res.reason).toMatch(/Automatic failure/);
  });

  it("TEST 5: High confidence + MANUAL_REQUIRED -> MANUAL_REQUIRED", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.99, status: "MANUAL_REQUIRED" });
    expect(res.status).toBe("MANUAL_REQUIRED");
    expect(res.inputs.routingReason).toBe("MANUAL_REQUIRED_PHYSICAL_CHECK");
  });

  it("TEST 6 & 7: Ambiguous/Missing evidence (validator REVIEW) -> REVIEW", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.99, status: "REVIEW" });
    expect(res.status).toBe("REVIEW");
    expect(res.inputs.routingReason).toBe("REVIEW_AMBIGUOUS_EVIDENCE");
  });

  it("TEST 8: NOT_APPLICABLE remains NOT_APPLICABLE", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.99, status: "NOT_APPLICABLE" });
    expect(res.status).toBe("NOT_APPLICABLE");
    expect(res.inputs.routingReason).toBe("NOT_APPLICABLE");
  });

  it("TEST 10: Changing threshold config changes routing", () => {
    const resPass = routeOutcome({ ...baseOutcome, confidence: 0.96 }, 0.95);
    expect(resPass.status).toBe("PASS");

    const resReview = routeOutcome({ ...baseOutcome, confidence: 0.92 }, 0.95);
    expect(resReview.status).toBe("REVIEW");
  });

  it("TEST 11: Confidence exactly equal to threshold behaves as >=", () => {
    const res = routeOutcome({ ...baseOutcome, confidence: 0.90 }, 0.90);
    expect(res.status).toBe("PASS");
  });

  it("TEST 12: Invalid threshold falls back to 0.90 safely", () => {
    // Pass NaN
    const resNaN = routeOutcome({ ...baseOutcome, confidence: 0.95 }, NaN);
    expect(resNaN.inputs.thresholdUsed).toBe(0.90);
    expect(resNaN.status).toBe("PASS");

    // Pass > 1
    const resHigh = routeOutcome({ ...baseOutcome, confidence: 0.95 }, 1.5);
    expect(resHigh.inputs.thresholdUsed).toBe(0.90);
    expect(resHigh.status).toBe("PASS");

    // Pass < 0
    const resLow = routeOutcome({ ...baseOutcome, confidence: 0.95 }, -1);
    expect(resLow.inputs.thresholdUsed).toBe(0.90);
  });
});

import { validateManufacturerDetails } from "@metrascan/legal-engine/src/validators/declarationValidators.js";

describe("Multi-field confidence masking fix", () => {
  it("Averages were removed: a critical field at 60% and another at 100% yields <= 60% overall confidence", () => {
    const declarations = [
      { field: "manufacturerName", rawText: "Acme", normalizedValue: "Acme", correctedValue: null, confidence: 1.0, imageId: "img1", bbox: [0,0,0,0], unit: null, currency: null },
      { field: "manufacturerAddress", rawText: "123 St, NY 100001", normalizedValue: "123 St", correctedValue: null, confidence: 0.60, imageId: "img1", bbox: [0,0,0,0], unit: null, currency: null }
    ];
    const visual = { anyImageSufficientQuality: true, ocrRan: true, totalRegions: 10, imageCount: 1 };
    
    const outcome = validateManufacturerDetails(declarations, visual, false);
    
    // Previously: (1.0 + 0.6) / 2 = 0.80.
    // Now: Math.min(1.0, 0.6) = 0.60.
    expect(outcome.confidence).toBeLessThanOrEqual(0.60);
    
    // And when routed, it must hit REVIEW because 0.60 < 0.90
    const routed = routeOutcome(outcome);
    expect(routed.status).toBe("REVIEW");
    expect(routed.inputs.routingReason).toBe("REVIEW_LOW_CONFIDENCE");
  });
});

describe("Data preservation", () => {
  it("routing preserves original evidence, confidence, status, and rule information", () => {
    const outcome: ValidationOutcome = {
      ruleId: "R123",
      status: "PASS",
      confidence: 0.98,
      reason: "Initial reason",
      evidence: { imageId: "img1", bbox: [1,2,3,4], text: "hello" },
      inputs: { customInput: "test" },
      validatorVersion: "v2",
      source: "Test source"
    };
    const routed = routeOutcome(outcome);
    expect(routed.ruleId).toBe("R123");
    expect(routed.confidence).toBe(0.98);
    expect(routed.evidence).toEqual({ imageId: "img1", bbox: [1,2,3,4], text: "hello" });
    expect(routed.validatorVersion).toBe("v2");
    expect(routed.source).toBe("Test source");
    expect(routed.inputs.customInput).toBe("test");
    expect(routed.inputs.routingReason).toBe("AUTO_PASS");
  });
});

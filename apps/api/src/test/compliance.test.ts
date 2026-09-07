import { describe, it, expect } from "vitest";
import {
  evaluateCompliance,
  normalizeUnit,
  correctUnitFor,
  isPermittedUnit,
  toBaseUnit,
  validateNetQuantity,
  validateMrp,
  validateConsumerCare,
  validateManufacturerDetails,
  validateNumeralSize,
  validateQuantityWording,
  validateArchaicCounting,
  validateDimensions,
  validateCountryOfOrigin,
  validateUnitSalePrice,
} from "@metrascan/legal-engine";
import type { ApplicabilityInput, DeclarationEvidence, VisualEvidence } from "@metrascan/legal-engine";

function input(overrides: Partial<ApplicabilityInput> = {}): ApplicabilityInput {
  return {
    inspectionDate: "2026-09-01",
    packageType: "RETAIL",
    intendedConsumer: "RETAIL",
    productCategory: "other",
    quantity: 250,
    quantityUnit: "g",
    imported: false,
    countryOfOrigin: "India",
    productSpecialCategory: null,
    specialLawCategory: null,
    packagePurpose: "SALE",
    ...overrides,
  };
}

function goodVisual(): VisualEvidence {
  return { anyImageSufficientQuality: true, ocrRan: true, totalRegions: 7, imageCount: 1 };
}

function badVisual(): VisualEvidence {
  return { anyImageSufficientQuality: false, ocrRan: false, totalRegions: 0, imageCount: 1 };
}

function decl(field: string, overrides: Partial<DeclarationEvidence> = {}): DeclarationEvidence {
  return {
    field,
    rawText: "",
    normalizedValue: null,
    correctedValue: null,
    unit: null,
    currency: null,
    confidence: 0.9,
    imageId: "img-1",
    bbox: [10, 20, 100, 30],
    ...overrides,
  };
}

describe("Phase 6 - unit normalization (Rule 13)", () => {
  it("normalizes common unit spellings", () => {
    expect(normalizeUnit("g")).toBe("g");
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("kg.")).toBe("kg");
    expect(normalizeUnit("LTR")).toBe("L");
    expect(normalizeUnit("ml")).toBe("ml");
    expect(normalizeUnit("pounds")).toBeNull();
  });

  it("derives the correct scale unit per Rule 13(2)/(3)", () => {
    expect(correctUnitFor(250, "g")).toBe("g");
    expect(correctUnitFor(1500, "g")).toBe("kg");
    expect(correctUnitFor(750, "ml")).toBe("ml");
    expect(correctUnitFor(1.5, "L")).toBe("L");
  });

  it("permits only SI units (Rule 13(5))", () => {
    expect(isPermittedUnit("g")).toBe(true);
    expect(isPermittedUnit("kg")).toBe(true);
    expect(isPermittedUnit("lbs")).toBe(false);
  });

  it("converts to base units deterministically", () => {
    expect(toBaseUnit(1.5, "kg")).toEqual({ value: 1500, base: "g" });
    expect(toBaseUnit(2, "L")).toEqual({ value: 2000, base: "ml" });
    expect(toBaseUnit(500, "mg")).toEqual({ value: 0.5, base: "g" });
  });
});

describe("Phase 6 - net quantity validator", () => {
  it("PASSes a valid quantity with correct unit", () => {
    const d = [decl("netQuantity", { rawText: "Net Quantity: 250 g", normalizedValue: "250", unit: "g" })];
    const r = validateNetQuantity(d, goodVisual());
    expect(r.status).toBe("PASS");
    expect(r.ruleId).toBe("R6.1c");
    expect(r.validatorVersion).toBe("quantity-v1");
  });

  it("REVIEWs (not FAILs) when missing and OCR insufficient — not detected ≠ proven absent", () => {
    const r = validateNetQuantity([], badVisual());
    expect(r.status).toBe("REVIEW");
    expect(r.reason).toMatch(/not proven absent|insufficient/i);
  });

  it("FAILs when missing despite sufficient quality — proven absent", () => {
    const r = validateNetQuantity([], goodVisual());
    expect(r.status).toBe("FAIL");
    expect(r.reason).toMatch(/sufficient image quality/i);
  });

  it("FAILs a non-SI unit (Rule 13(5))", () => {
    const d = [decl("netQuantity", { rawText: "Net Wt 250 pounds", normalizedValue: "250", unit: "pounds" })];
    const r = validateNetQuantity(d, goodVisual());
    expect(r.status).toBe("FAIL");
    expect(r.reason).toMatch(/Rule 13\(5\)/);
  });

  it("REVIEWs an unparseable numeric value", () => {
    const d = [decl("netQuantity", { rawText: "Net Qty lots", normalizedValue: "lots", unit: "g" })];
    const r = validateNetQuantity(d, goodVisual());
    expect(r.status).toBe("REVIEW");
  });
});

describe("Phase 6 - MRP validator", () => {
  it("PASSes a valid MRP with currency", () => {
    const d = [decl("mrp", { rawText: "MRP Rs. 30 (incl. of all taxes)", normalizedValue: "30", currency: "INR" })];
    const r = validateMrp(d, goodVisual());
    expect(r.status).toBe("PASS");
    expect(r.reason).toContain("30");
  });

  it("REVIEWs when currency is missing — a symbol alone is not compliance", () => {
    const d = [decl("mrp", { rawText: "30", normalizedValue: "30", currency: null })];
    const r = validateMrp(d, goodVisual());
    expect(r.status).toBe("REVIEW");
    expect(r.reason).toMatch(/currency was not established/i);
  });

  it("REVIEWs when no valid price can be parsed", () => {
    const d = [decl("mrp", { rawText: "MRP ₹", normalizedValue: "", currency: "INR" })];
    const r = validateMrp(d, goodVisual());
    expect(r.status).toBe("REVIEW");
  });

  it("FAILs when absent with sufficient quality", () => {
    const r = validateMrp([], goodVisual());
    expect(r.status).toBe("FAIL");
  });

  it("REVIEWs when absent but quality insufficient", () => {
    const r = validateMrp([], badVisual());
    expect(r.status).toBe("REVIEW");
  });
});

describe("Phase 6 - consumer care validator", () => {
  it("PASSes with phone present (email conditional)", () => {
    const d = [decl("consumerCarePhone", { rawText: "1800-266-1118", normalizedValue: "18002661118" })];
    const r = validateConsumerCare(d, goodVisual());
    expect(r.status).toBe("PASS");
  });

  it("REVIEWs when only email found (phone mandatory)", () => {
    const d = [decl("consumerCareEmail", { rawText: "care@x.co.in", normalizedValue: "care@x.co.in" })];
    const r = validateConsumerCare(d, goodVisual());
    expect(r.status).toBe("REVIEW");
    expect(r.reason).toMatch(/telephone/i);
  });

  it("FAILs when absent entirely with sufficient quality", () => {
    const r = validateConsumerCare([], goodVisual());
    expect(r.status).toBe("FAIL");
  });
});

describe("Phase 6 - manufacturer details validator", () => {
  it("PASSes name + complete address (PIN present)", () => {
    const d = [
      decl("manufacturerName", { rawText: "Manufactured by: Britannia Industries Ltd.", normalizedValue: "Britannia Industries Ltd." }),
      decl("manufacturerAddress", { rawText: "Plot No. 5, Sector 44, Gurugram, Haryana 122003", normalizedValue: "Plot No. 5, Sector 44, Gurugram, Haryana 122003" }),
    ];
    const r = validateManufacturerDetails(d, goodVisual(), false);
    expect(r.status).toBe("PASS");
  });

  it("REVIEWs name without address", () => {
    const d = [decl("manufacturerName", { rawText: "Manufactured by: Acme", normalizedValue: "Acme" })];
    const r = validateManufacturerDetails(d, goodVisual(), false);
    expect(r.status).toBe("REVIEW");
    expect(r.reason).toMatch(/complete address/i);
  });
});

describe("Phase 6 - Rule 7 numeral size honesty", () => {
  it("MANUAL_REQUIRED without calibration — never fabricates mm", () => {
    const r = validateNumeralSize({ calibrated: false });
    expect(r.status).toBe("MANUAL_REQUIRED");
    expect(r.reason).toMatch(/uncalibrated|calibrated physical measurement/i);
  });
});

describe("Phase 6 - quantity wording (Rule 12(6))", () => {
  it("R12.6 FAILs if misleading wording is used, REVIEWs if missing", () => {
    const pass = validateQuantityWording({ rawText: "10 g" }, new Date());
    expect(pass.status).toBe("PASS");

    const fail = validateQuantityWording({ rawText: "Minimum 10 g" }, new Date("2020-01-01"));
    expect(fail.status).toBe("FAIL");
    expect(fail.reason).toMatch(/amended wef 01\.07\.2012/i);

    const review = validateQuantityWording(null, new Date());
    expect(review.status).toBe("REVIEW");
  });
});

describe("Phase 6 - archaic counting (Rule 13(4))", () => {
  it("R13.4 FAILs if archaic counting words are used", () => {
    const pass = validateArchaicCounting({ rawText: "10 N" });
    expect(pass.status).toBe("PASS");

    const fail = validateArchaicCounting({ rawText: "1 dozen" });
    expect(fail.status).toBe("FAIL");
    expect(fail.reason).toMatch(/dozen.*prohibits/i);
  });

  it("PASSes ordinary counts", () => {
    const r = validateArchaicCounting({ rawText: "Net Quantity: 6 pcs" });
    expect(r.status).toBe("PASS");
  });
});

describe("Phase 6 - dimensions (Rule 14)", () => {
  it("NOT_APPLICABLE for non-garment products", () => {
    const r = validateDimensions([], "food", goodVisual());
    expect(r.status).toBe("NOT_APPLICABLE");
  });

  it("FAILs for garment without dimensions", () => {
    const r = validateDimensions([], "garment", goodVisual());
    expect(r.status).toBe("FAIL");
  });

  it("PASSes for garment with dimensions", () => {
    const d = [{ field: "dimensions", rawText: "25 cm x 10 cm", normalizedValue: "25cm x 10cm", correctedValue: null, confidence: 0.85, imageId: "img-1", bbox: [1, 2, 3, 4] }];
    const r = validateDimensions(d, "garment", goodVisual());
    expect(r.status).toBe("PASS");
  });
});

describe("Phase 6 - honest NOT_APPLICABLE for fields absent from source", () => {
  it("country of origin is not in the supplied base text", () => {
    const r = validateCountryOfOrigin();
    expect(r.status).toBe("NOT_APPLICABLE");
    expect(r.reason).toMatch(/not among the mandatory declarations/i);
  });

  it("unit sale price is not in the supplied base text", () => {
    const r = validateUnitSalePrice();
    expect(r.status).toBe("NOT_APPLICABLE");
  });
});

describe("Phase 6 - full compliance engine + aggregation", () => {
  it("aggregates a well-declared package as COMPLIANT or REVIEW (manual checks pending)", () => {
    const declarations: DeclarationEvidence[] = [
      decl("manufacturerName", { rawText: "Manufactured by: Britannia Industries Ltd.", normalizedValue: "Britannia Industries Ltd." }),
      decl("manufacturerAddress", { rawText: "Plot No. 5, Sector 44, Gurugram, Haryana 122003", normalizedValue: "Plot No. 5, Sector 44, Gurugram, Haryana 122003" }),
      decl("genericName", { rawText: "Tea Biscuits", normalizedValue: "Tea Biscuits" }),
      decl("netQuantity", { rawText: "Net Quantity: 250 g", normalizedValue: "250", unit: "g" }),
      decl("manufactureDate", { rawText: "MFD: SEP 2026", normalizedValue: "2026-09" }),
      decl("mrp", { rawText: "MRP Rs. 30 (incl. of all taxes)", normalizedValue: "30", currency: "INR" }),
      decl("consumerCarePhone", { rawText: "1800-266-1118", normalizedValue: "18002661118" }),
    ];
    const result = evaluateCompliance(input({ productCategory: "other" }), declarations, goodVisual());
    expect(result.verdict).toBe("REVIEW_REQUIRED"); // physical checks (Rule 7/8/9) remain manual
    expect(result.summary.failed).toBe(0);
    expect(result.summary.manualRequired).toBeGreaterThan(0);
    expect(result.note).toMatch(/not a model/i);
  });

  it("aggregates a missing mandatory declaration (proven absent) as NON_COMPLIANT", () => {
    const declarations: DeclarationEvidence[] = [
      decl("netQuantity", { rawText: "Net Quantity: 250 g", normalizedValue: "250", unit: "g" }),
      // MRP, manufacturer, dates, consumer care all missing
    ];
    const result = evaluateCompliance(input(), declarations, goodVisual());
    expect(result.verdict).toBe("NON_COMPLIANT");
    expect(result.summary.failed).toBeGreaterThan(0);
    const mrpFail = result.results.find(r => r.ruleId === "R6.1e");
    expect(mrpFail?.status).toBe("FAIL");
  });

  it("aggregates poor-image-quality missing declarations as REVIEW_REQUIRED, never NON_COMPLIANT", () => {
    const result = evaluateCompliance(input(), [], badVisual());
    expect(result.verdict).toBe("REVIEW_REQUIRED");
    expect(result.summary.failed).toBe(0);
    expect(result.summary.review).toBeGreaterThan(0);
  });

  it("produces an R24 result for a wholesale inspection and runs no Chapter II retail validators", () => {
    const wholesaleInput = input({ packageType: "WHOLESALE", intendedConsumer: "RETAIL" });
    const declarations: DeclarationEvidence[] = [
      decl("manufacturerName", { rawText: "Packed by: ACME Foods Pvt. Ltd.", normalizedValue: "ACME Foods Pvt. Ltd." }),
      decl("manufacturerAddress", { rawText: "Plot 5, Sector 44, Gurugram, Haryana 122003", normalizedValue: "Plot 5, Sector 44, Gurugram, Haryana 122003" }),
      decl("genericName", { rawText: "Assorted Biscuits", normalizedValue: "Assorted Biscuits" }),
      decl("totalRetailPackages", { rawText: "Contains 24 packages", normalizedValue: "24" }),
    ];
    const result = evaluateCompliance(wholesaleInput, declarations, goodVisual());
    const r24 = result.results.find(r => r.ruleId === "R24");
    expect(r24).toBeDefined();
    expect(r24?.status).toBe("PASS");
    expect(r24?.source).toContain("Rule 24");
    expect(result.results.some(r => r.ruleId === "R6.1a" || r.ruleId === "R6.1c" || r.ruleId === "R6.1e")).toBe(false);
  });

  it("R24 FAILs a wholesale package missing all declarations (proven absent with good images)", () => {
    const wholesaleInput = input({ packageType: "WHOLESALE", intendedConsumer: "RETAIL" });
    const result = evaluateCompliance(wholesaleInput, [], goodVisual());
    const r24 = result.results.find(r => r.ruleId === "R24");
    expect(r24?.status).toBe("FAIL");
    expect(result.verdict).toBe("NON_COMPLIANT");
  });

  it("R24 REVIEWs (never FAILs) a wholesale package when OCR could not establish absence", () => {
    const wholesaleInput = input({ packageType: "WHOLESALE", intendedConsumer: "RETAIL" });
    const result = evaluateCompliance(wholesaleInput, [], badVisual());
    const r24 = result.results.find(r => r.ruleId === "R24");
    expect(r24?.status).toBe("REVIEW");
    expect(r24?.reason).toMatch(/not proven absent/i);
  });

  it("Rule 7 numeral-size is gated on the quantity clause — absent for exempt sub-10g packages", () => {
    const exemptInput = input({ quantity: 5, quantityUnit: "g" });
    const result = evaluateCompliance(exemptInput, [], goodVisual());
    expect(result.results.some(r => r.ruleId === "R7.2")).toBe(false);
    const retailResult = evaluateCompliance(input(), [], goodVisual());
    expect(retailResult.results.some(r => r.ruleId === "R7.2" && r.status === "MANUAL_REQUIRED")).toBe(true);
  });

  it("Rule 14 gate covers textile-like categories beyond the literal 'garment'", () => {
    const household = evaluateCompliance(input({ productCategory: "household" }), [], goodVisual());
    expect(household.results.some(r => r.ruleId === "R14" && r.status === "FAIL")).toBe(true);

    const textile = evaluateCompliance(input({ productCategory: "textile" }), [], goodVisual());
    expect(textile.results.some(r => r.ruleId === "R14" && r.status === "FAIL")).toBe(true);

    const food = evaluateCompliance(input({ productCategory: "food" }), [], goodVisual());
    expect(food.results.some(r => r.ruleId === "R14" && r.status === "NOT_APPLICABLE")).toBe(true);
  });

  it("intendedConsumer UNKNOWN yields REVIEW, never a silently-assumed consumer type", () => {
    const unknownConsumer = evaluateCompliance(input({ intendedConsumer: "UNKNOWN" }), [], goodVisual());
    expect(unknownConsumer.results.some(r => r.ruleId === "R6.1c" && r.status === "REVIEW")).toBe(true);
    const reviewResult = unknownConsumer.results.find(r => r.ruleId === "R6.1c" && r.status === "REVIEW");
    expect(reviewResult?.reason).toMatch(/Applicability itself is unresolved/);
    expect(unknownConsumer.summary.failed).toBe(0);
  });
});

describe("Phase 6 - Refinement 2B: OCR Uncertainty and Review Handling", () => {
  it("A. declaration confidently detected -> PASS path", () => {
    const decs: DeclarationEvidence[] = [
      decl("mrp", { rawText: "MRP Rs. 50", normalizedValue: "50", currency: "INR", confidence: 0.95 })
    ];
    const res = validateMrp(decs, goodVisual());
    expect(res.status).toBe("PASS");
  });

  it("B. declaration absent with sufficient evidence -> FAIL path", () => {
    // OCR ran, image quality good, but mrp not found
    const res = validateMrp([], goodVisual());
    expect(res.status).toBe("FAIL");
    expect(res.reason).toMatch(/despite sufficient image quality/);
  });

  it("C. declaration not detected with insufficient evidence -> REVIEW", () => {
    const poorImage: VisualEvidence = { ocrRan: true, totalRegions: 5, imageCount: 1, anyImageSufficientQuality: false };
    const res = validateMrp([], poorImage);
    expect(res.status).toBe("REVIEW");
    expect(res.reason).toMatch(/image quality was insufficient/);
  });

  it("D. low OCR confidence on a failing condition -> REVIEW", () => {
    const decs: DeclarationEvidence[] = [
      decl("netQuantity", { rawText: "500 nonSI", normalizedValue: "500", unit: "nonSI", confidence: 0.4 })
    ];
    const res = validateNetQuantity(decs, goodVisual());
    // Since unit is non-SI, normally it's FAIL. But confidence is 0.4, so it should be REVIEW.
    expect(res.status).toBe("REVIEW");
  });

  it("E. poor image quality when OCR didn't run -> REVIEW", () => {
    const noOcr: VisualEvidence = { ocrRan: false, totalRegions: 0, imageCount: 1, anyImageSufficientQuality: false };
    const res = validateMrp([], noOcr);
    expect(res.status).toBe("REVIEW");
    expect(res.reason).toMatch(/insufficient to establish whether it exists/);
  });

  it("F. no fabricated evidence is created", () => {
    const res = validateMrp([], goodVisual());
    expect(res.evidence).toEqual({ imageId: null, bbox: null, text: null });
  });
});

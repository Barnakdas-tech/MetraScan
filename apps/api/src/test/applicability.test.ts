import { describe, it, expect } from "vitest";
import { evaluateApplicability, resolveEffectiveRules, RULES, evaluateRule26Exemptions } from "@metrascan/legal-engine";
import type { ApplicabilityInput } from "@metrascan/legal-engine";

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

describe("Phase 5 - effective date resolver", () => {
  it("excludes rule versions not yet in force", () => {
    const resolved = resolveEffectiveRules(RULES, new Date("2011-04-01"));
    expect(resolved.some(r => r.ruleId === "R6.1d" && r.version === 2)).toBe(false);
  });

  it("resolves the post-withdrawal version for a 2026 inspection", () => {
    const resolved = resolveEffectiveRules(RULES, new Date("2026-09-01"));
    const dateRule = resolved.find(r => r.ruleId === "R6.1d");
    expect(dateRule?.version).toBe(2);
    expect(dateRule?.effectiveFrom).toBe("2012-07-01");
  });
});

describe("Phase 5 - applicability engine", () => {
  it("applies Chapter II rules to an ordinary retail package and explains why", () => {
    const result = evaluateApplicability(input());
    const applicableIds = result.applicableRules.map(r => r.ruleId);
    expect(applicableIds).toContain("R6.1b");
    expect(applicableIds).toContain("R6.1c");
    expect(applicableIds).toContain("R6.1e");
    expect(applicableIds).toContain("R6.2");
    const mrp = result.applicableRules.find(r => r.ruleId === "R6.1e");
    expect(mrp?.reason.length).toBeGreaterThan(10);
    expect(mrp?.source).toContain("Rules, 2011");
  });

  it("does NOT apply Chapter II to industrial/institutional consumers (Rule 3(b)) with explanation", () => {
    const result = evaluateApplicability(input({ intendedConsumer: "INDUSTRIAL" }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
    const excluded = result.nonApplicableRules.find(r => r.ruleId === "R6.1c");
    expect(excluded?.reason).toMatch(/Rule 3/);
  });

  it("does NOT apply Chapter II above 25 kg (Rule 3(a)) with explanation", () => {
    const result = evaluateApplicability(input({ quantity: 30, quantityUnit: "kg" }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
    const excluded = result.nonApplicableRules.find(r => r.ruleId === "R6.1c");
    expect(excluded?.reason).toMatch(/Rule 3\(a\)/);
  });

  it("tests the Rule 3(a) 25 kg/L boundary on CONVERTED units — 30000 g must not bypass it", () => {
    const result = evaluateApplicability(input({ quantity: 30000, quantityUnit: "g" }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
    const excluded = result.nonApplicableRules.find(r => r.ruleId === "R6.1c");
    expect(excluded?.reason).toMatch(/Rule 3\(a\)/);
  });

  it("keeps Chapter II for a 30 kg cement bag — Rule 3(a) source exception (bags up to 50 kg)", () => {
    const result = evaluateApplicability(input({ quantity: 30, quantityUnit: "kg", productSpecialCategory: "cement-bag" }));
    expect(result.applicableRules.some(r => r.ruleId === "R6.1c")).toBe(true);
    const why = result.applicableRules.find(r => r.ruleId === "R6.1c");
    expect(why?.reason).toMatch(/cement and fertilizer/);
  });

  it("still excludes a 60 kg cement package — the Rule 3(a) exception caps at 50 kg bags", () => {
    const result = evaluateApplicability(input({ quantity: 60, quantityUnit: "kg", productSpecialCategory: "cement-bag" }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
  });

  it("excludes Chapter II for wholesale packages — Chapter III (Rule 24) governs them instead", () => {
    const result = evaluateApplicability(input({ packageType: "WHOLESALE", intendedConsumer: "RETAIL" }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
    const excluded = result.nonApplicableRules.find(r => r.ruleId === "R6.1c");
    expect(excluded?.reason).toMatch(/wholesale package/);
    expect(result.applicableRules.some(r => r.ruleId === "R24")).toBe(true);
  });

  it("Rule 26: 10–20 g is NOT exempt post-01.07.2012 — the partial proviso was withdrawn by GSR 748(E)", () => {
    const post = evaluateRule26Exemptions(input({ quantity: 15, quantityUnit: "g", inspectionDate: "2026-09-01" }));
    expect(post.exempt).toBe(false);
    expect(post.reason).toMatch(/withdrawn/);
  });

  it("Rule 26: pre-01.07.2012, 10–20 g cites the proviso keeping MRP and net quantity mandatory", () => {
    const pre = evaluateRule26Exemptions(input({ quantity: 15, quantityUnit: "g", inspectionDate: "2012-06-30" }));
    expect(pre.exempt).toBe(false);
    expect(pre.reason).toMatch(/proviso/);
    expect(pre.reason).toMatch(/MRP and net-quantity/);
  });

  it("Rule 26: ≤10 g is fully exempt in any unit form (0.01 kg = 10 g)", () => {
    expect(evaluateRule26Exemptions(input({ quantity: 5, quantityUnit: "g" })).exempt).toBe(true);
    expect(evaluateRule26Exemptions(input({ quantity: 0.01, quantityUnit: "kg" })).exempt).toBe(true);
  });

  it("applies Rule 24 to wholesale packages and not to retail", () => {
    const wholesale = evaluateApplicability(input({ packageType: "WHOLESALE" }));
    expect(wholesale.applicableRules.some(r => r.ruleId === "R24")).toBe(true);
    const retail = evaluateApplicability(input());
    expect(retail.applicableRules.some(r => r.ruleId === "R24")).toBe(false);
    expect(retail.nonApplicableRules.some(r => r.ruleId === "R24")).toBe(true);
    const why = retail.nonApplicableRules.find(r => r.ruleId === "R24");
    expect(why?.reason).toMatch(/retail package, not a wholesale package/);
  });

  it("exempts ≤10 g/ml packages under Rule 26(a) with explanation", () => {
    const result = evaluateApplicability(input({ quantity: 5, quantityUnit: "g" }));
    const chapterIi = result.applicableRules.filter(r => r.ruleId.startsWith("R6"));
    expect(chapterIi.length).toBe(0);
    const exempt = result.nonApplicableRules.find(r => r.ruleId === "R6.1c");
    expect(exempt?.reason).toMatch(/Rule 26/);
  });

  it("returns REVIEW, never false, when quantity is UNKNOWN (Rule 26(a) boundary)", () => {
    const result = evaluateApplicability(input({ quantity: null, quantityUnit: null }));
    expect(result.applicableRules.filter(r => r.ruleId.startsWith("R6")).length).toBe(0);
    expect(result.reviewRequiredRules.length).toBeGreaterThan(0);
    const review = result.reviewRequiredRules[0];
    expect(review.reason).toMatch(/unknown|missing|Cannot/i);
  });

  it("returns REVIEW when package type is UNKNOWN (Rule 24 scope)", () => {
    const result = evaluateApplicability(input({ packageType: "UNKNOWN" }));
    const r24 = [...result.reviewRequiredRules].find(r => r.ruleId === "R24");
    expect(r24).toBeDefined();
    expect(r24?.status).toBe("REVIEW");
  });

  it("explains product-level deferrals: food defers manufacturer/date to PFA law", () => {
    const result = evaluateApplicability(input({ productCategory: "food" }));
    const foodDeferral = result.nonApplicableRules.find(r => r.ruleId === "R6.1a-food-deferral");
    expect(foodDeferral).toBeDefined();
    expect(foodDeferral?.reason).toMatch(/Prevention of Food Adulteration/);
  });

  it("explains the bidi MRP exemption (Rule 6(1)(e) proviso)", () => {
    const result = evaluateApplicability(input({ productSpecialCategory: "bidi" }));
    const mrpExempt = result.nonApplicableRules.find(r => r.ruleId === "R6.1e-proviso");
    expect(mrpExempt).toBeDefined();
    expect(mrpExempt?.reason).toMatch(/bidi/i);
  });

  it("explains the Seeds Act date-declaration exemption", () => {
    const result = evaluateApplicability(input({ productSpecialCategory: "seeds-certified" }));
    const dateExempt = result.nonApplicableRules.find(r => r.ruleId === "R6.1d-proviso");
    expect(dateExempt).toBeDefined();
    expect(dateExempt?.reason).toMatch(/Seeds Act/);
  });

  it("never claims compliance — the note is always present", () => {
    const result = evaluateApplicability(input());
    expect(result.note).toMatch(/does NOT decide compliance/);
  });
});

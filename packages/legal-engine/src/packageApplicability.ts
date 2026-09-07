import type { ApplicabilityInput } from "./types.js";
import { toBaseUnit } from "./validators/units.js";

/**
 * Package-level applicability logic (Rules 3, 24).
 *
 * RULE 3 (source: Chapter II opening, p.3): Chapter II does not apply to
 *  (a) packages >25 kg / 25 L, excluding cement & fertilizer in bags up to 50 kg
 *  (b) packages meant for industrial or institutional consumers
 */

export function chapterIiApplies(input: ApplicabilityInput): { ok: boolean | null; reason: string; review?: string } {
  // A wholesale package is governed by Chapter III (Rule 24), not Chapter II:
  // Chapter II is headed "Provisions applicable to packages intended for retail
  // sale" and Rule 2(r) defines a wholesale package as intended for sale to an
  // intermediary, not direct to a single consumer. The retail packages inside
  // a wholesale package must separately comply (Rule 2(r)(iii)).
  if (input.packageType === "WHOLESALE") {
    return { ok: false, reason: "Chapter II applies to packages intended for retail sale; this is a wholesale package governed by Chapter III (Rule 24). The retail packages within it must separately comply." };
  }
  // (b) industrial/institutional consumers excluded
  if (input.intendedConsumer === "INDUSTRIAL" || input.intendedConsumer === "INSTITUTIONAL") {
    return { ok: false, reason: "Rule 3(b): Chapter II does not apply to packages meant for industrial or institutional consumers." };
  }
  if (input.intendedConsumer === "UNKNOWN") {
    return { ok: null, reason: "Intended consumer (retail vs industrial/institutional) is not established.", review: "INTENDED_CONSUMER_UNKNOWN" };
  }
  // (a) quantity boundary — needs quantity + unit
  if (input.quantity === null || !input.quantityUnit) {
    return { ok: null, reason: "Quantity/unit unknown — cannot test the 25 kg / 25 L boundary of Rule 3(a).", review: "QUANTITY_UNKNOWN" };
  }
  // Convert to a base unit so ANY input form (kg, g, L, ml) tests the true
  // 25 kg / 25 L boundary — "30000 g" must not bypass Rule 3(a).
  const base = toBaseUnit(input.quantity, input.quantityUnit);
  if (!base) {
    return { ok: null, reason: `Quantity unit "${input.quantityUnit}" not recognized — cannot test the 25 kg / 25 L boundary of Rule 3(a).`, review: "QUANTITY_UNKNOWN" };
  }
  const inKgOrL = base.base === "g" ? base.value / 1000 : base.base === "ml" ? base.value / 1000 : null;
  if (inKgOrL !== null && inKgOrL > 25) {
    // Rule 3(a) exclusion "excluding cement and fertilizer sold in bags up to 50 kg"
    if (inKgOrL <= 50 && (input.productSpecialCategory === "cement-bag" || input.productSpecialCategory === "fertilizer-bag")) {
      return { ok: true, reason: `Rule 3(a) would exclude packages over 25 kg, but the source carves out cement and fertilizer sold in bags up to 50 kg — this ${input.quantity} ${input.quantityUnit} package qualifies for the exception, so Chapter II applies.` };
    }
    return { ok: false, reason: `Rule 3(a): package of ${input.quantity} ${input.quantityUnit} (over 25 kg/25 L) — Chapter II does not apply (cement/fertilizer bag exception not established).` };
  }
  return { ok: true, reason: "Within Rule 3 boundaries; no Chapter II exclusion identified." };
}

export function wholesaleRulesApply(input: ApplicabilityInput): { ok: boolean | null; reason: string; review?: string } {
  if (input.packageType === "WHOLESALE") {
    return { ok: true, reason: "Package classified as a wholesale package — Chapter VI (Rule 24) applies." };
  }
  if (input.packageType === "RETAIL" || input.packageType === "IMPORTED") {
    return { ok: false, reason: "Package is a retail package, not a wholesale package — Rule 24 does not apply." };
  }
  return { ok: null, reason: "Package type unknown — cannot decide retail vs wholesale scope.", review: "PACKAGE_TYPE_UNKNOWN" };
}

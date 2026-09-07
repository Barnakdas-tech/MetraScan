import type { ApplicabilityInput } from "./types.js";

/**
 * Product-level applicability (Rule 6 sub-clause deferrals, exact provisos).
 *
 * IMPORTANT: these deferrals make the SUB-REQUIREMENT inapplicable under these
 * rules (another law governs) — they never silently mark ambiguous cases.
 */

export function manufacturerDetailsApply(input: ApplicabilityInput): { ok: boolean | null; reason: string; review?: string } {
  // Explanation III: food articles defer to PFA 1954 successor law
  if (input.productCategory === "food" || input.productCategory === "beverage") {
    return { ok: false, reason: "Rule 6(1)(a) Explanation III: for packages containing food articles, the provisions of the Prevention of Food Adulteration Act, 1954 and rules thereunder apply instead." };
  }
  return { ok: true, reason: "No product-category deferral identified for Rule 6(1)(a)." };
}

export function dateDeclarationApply(input: ApplicabilityInput): { ok: boolean | null; reason: string; review?: string } {
  // Rule 6(1)(d) provisos
  if (input.productSpecialCategory === "seeds-certified") {
    return { ok: false, reason: "Rule 6(1)(d) proviso: not applicable to packages containing seeds labeled and certified under the Seeds Act, 1966." };
  }
  if (input.productSpecialCategory === "bidi" || input.productSpecialCategory === "incense-sticks") {
    return { ok: false, reason: "Rule 6(1)(d) proviso (A)(i): no month/year declaration required on packages containing bidis or incense sticks." };
  }
  if (input.productSpecialCategory === "lpg-psu-cylinder") {
    return { ok: false, reason: "Rule 6(1)(d) proviso (A)(ii): no month/year declaration required on domestic LPG cylinders of 14.2kg/5kg bottled and marketed by a PSU." };
  }
  if (input.productCategory === "food" || input.productCategory === "beverage") {
    return { ok: false, reason: "Rule 6(1)(d) proviso: for packages containing food articles, PFA Act 1954 provisions apply instead." };
  }
  if (input.productCategory === "cosmetic") {
    return { ok: false, reason: "Rule 6(1)(d) proviso: for packages containing cosmetics products, the Drugs and Cosmetics Rules, 1945 apply instead." };
  }
  return { ok: true, reason: "No date-declaration exemption identified for this product." };
}

export function mrpDeclarationApply(input: ApplicabilityInput): { ok: boolean | null; reason: string; review?: string } {
  if (input.specialLawCategory === "alcoholic-beverage") {
    return { ok: false, reason: "Rule 6(1)(e) proviso: for alcoholic beverages/spirituous liquor, State Excise Laws apply within the manufacturing State; these rules apply only where they do not provide for retail-sale-price declaration." };
  }
  if (input.productSpecialCategory === "bidi") {
    return { ok: false, reason: "Rule 6(1)(e) proviso (C)(i): no retail-sale-price declaration required on any package containing bidi." };
  }
  if (input.productSpecialCategory === "lpg-apm") {
    return { ok: false, reason: "Rule 6(1)(e) proviso (C)(ii): no retail-sale-price declaration required on domestic LPG cylinders priced under the Administrative Price Mechanism." };
  }
  return { ok: true, reason: "No MRP-declaration exemption identified for this package." };
}

export function consumerCareApply(_input: ApplicabilityInput): { ok: boolean; reason: string } {
  // Rule 6(2): applies to every package in Chapter II scope — no product-level proviso.
  return { ok: true, reason: "Rule 6(2) requires consumer-complaint contact details on every package within Chapter II scope; no product-level exemption in the source." };
}

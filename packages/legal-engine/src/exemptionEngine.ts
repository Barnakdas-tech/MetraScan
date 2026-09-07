import type { ApplicabilityInput } from "./types.js";
import { toBaseUnit } from "./validators/units.js";

/**
 * Rule 26 exemptions (exact source: "26. Exemption in respect of certain packages").
 * Nothing in these rules applies to a package containing a commodity if:
 *  (a) net weight/measure ≤ 10 g / 10 ml when sold by weight or measure
 *      — with the 10–20 g / 10–20 ml proviso (MRP + net quantity STILL required)
 *  (b) fast food items packed by restaurant/hotel and the like
 *  (c) scheduled & non-scheduled formulations under Drugs (Price Control) Order, 1995
 *  (d) agricultural farm produce in packages of above 50 kg
 *
 * The asterisked withdrawal note applies to provisos of (a) [wef 01.07.2012,
 * GSR 748(E)] — i.e., from 1 July 2012 the 10–20 g/ml partial requirement no
 * longer applies, so sub-10g/ml packages are fully exempt post-2012.
 */

export interface ExemptionOutcome {
  exempt: boolean | null;
  reason: string;
  review?: string;
}

export function evaluateRule26Exemptions(input: ApplicabilityInput): ExemptionOutcome {
  const asOf = input.inspectionDate instanceof Date ? input.inspectionDate : new Date(input.inspectionDate);
  // GSR 748(E) withdrew the 10–20 g/ml partial proviso wef 01.07.2012.
  const provisoWithdrawn = asOf >= new Date("2012-07-01");

  // (a) small-quantity exemption — needs quantity evidence
  if (input.quantity !== null && input.quantityUnit) {
    // Convert to base so any input form tests the true 10 g / 10 ml boundary.
    const base = toBaseUnit(input.quantity, input.quantityUnit);
    if (base && (base.base === "g" || base.base === "ml") && base.value <= 10) {
      return { exempt: true, reason: `Rule 26(a): net ${base.base === "g" ? "weight" : "measure"} of ${input.quantity} ${input.quantityUnit} is 10 ${base.base} or less — these rules do not apply.` };
    }
    // The 10–20 g/ml band was NEVER fully exempt: the (now-withdrawn) proviso
    // kept MRP + net quantity mandatory there. Representing it as exempt=true
    // would suppress the very rules the proviso preserves, so the honest
    // outcome is "not exempt" with the proviso cited.
    if (base && (base.base === "g" || base.base === "ml") && base.value > 10 && base.value <= 20) {
      if (!provisoWithdrawn) {
        return { exempt: false, reason: `Rule 26(a) proviso (in force at ${asOf.toISOString().slice(0, 10)}): packages of 10–20 ${base.base} remain subject to the MRP and net-quantity declaration requirements.` };
      }
      return { exempt: false, reason: `Package of 10–20 ${base.base}: the Rule 26(a) base exemption covers only ≤10 ${base.base}, and the 10–20 partial proviso was withdrawn wef 01.07.2012 (GSR 748(E)) — the rules apply in full.` };
    }
  }

  // (b) fast food packed by restaurant/hotel
  if (input.productSpecialCategory === "fast-food-restaurant") {
    return { exempt: true, reason: "Rule 26(b): package contains fast food items packed by a restaurant or hotel and the like." };
  }

  // (c) scheduled/non-scheduled formulations under DPCO 1995
  if (input.productSpecialCategory === "scheduled-formulation") {
    return { exempt: true, reason: "Rule 26(c): contains scheduled and non-scheduled formulations covered under the Drugs (Price Control) Order, 1995." };
  }

  // (d) agricultural farm produce above 50 kg
  if (input.productSpecialCategory === "agricultural-produce" && input.quantity !== null && input.quantityUnit?.toLowerCase() === "kg" && input.quantity > 50) {
    return { exempt: true, reason: "Rule 26(d): agricultural farm produce in packages of above 50 kg." };
  }

  // Nothing matched — but if quantity is unknown we cannot fully rule out (a)
  if (input.quantity === null || !input.quantityUnit) {
    return { exempt: null, reason: "Quantity/unit unknown — cannot test the Rule 26(a) ≤10 g/ml exemption boundary.", review: "QUANTITY_UNKNOWN" };
  }

  return { exempt: false, reason: "No Rule 26 exemption condition matched on the available evidence." };
}

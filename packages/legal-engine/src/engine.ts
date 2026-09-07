import type { ApplicabilityDecision, ApplicabilityInput, ApplicabilityResult } from "./types.js";
import { resolveEffectiveRules, describeLegalVersion } from "./effectiveDateResolver.js";
import { RULES, evaluateRule26Exemptions } from "./rules.js";
import { manufacturerDetailsApply, dateDeclarationApply, mrpDeclarationApply } from "./productApplicability.js";

/**
 * The applicability engine: decides WHICH rules must be checked for an
 * inspection — never whether the package complies. Every decision carries an
 * explanation; UNKNOWN inputs yield REVIEW, never silent false.
 */
export function evaluateApplicability(input: ApplicabilityInput): ApplicabilityResult {
  const asOf = input.inspectionDate instanceof Date ? input.inspectionDate : new Date(input.inspectionDate);
  const rulesInForce = resolveEffectiveRules(RULES, asOf);

  const applicable: ApplicabilityDecision[] = [];
  const nonApplicable: ApplicabilityDecision[] = [];
  const review: ApplicabilityDecision[] = [];

  // Global Rule 26 exemption gate — if the package is wholly exempt, Chapter
  // II rules do not apply. Ambiguity propagates as REVIEW, not false.
  const exemption = evaluateRule26Exemptions(input);

  for (const rule of rulesInForce) {
    const decision = decideRule(rule, input, exemption);
    if (decision.status === "APPLICABLE") applicable.push(decision);
    else if (decision.status === "NOT_APPLICABLE") nonApplicable.push(decision);
    else review.push(decision);
  }

  // Product-level sub-requirement deferrals are surfaced as explicit
  // NOT_APPLICABLE entries with source-cited reasons (they explain WHY a
  // rule's specific sub-requirement defers to another law).
  const deferrals = buildProductDeferrals(input, asOf);

  return {
    inspectionDate: asOf.toISOString(),
    resolvedLegalVersion: describeLegalVersion(asOf),
    applicableRules: applicable,
    nonApplicableRules: [...nonApplicable, ...deferrals.notApplicable],
    reviewRequiredRules: [...review, ...deferrals.review],
    note: "This engine determines WHICH provisions must be checked. It does NOT decide compliance.",
  };
}

function decideRule(
  rule: (typeof RULES)[number],
  input: ApplicabilityInput,
  exemption: { exempt: boolean | null; reason: string }
): ApplicabilityDecision {
  const base = {
    ruleId: rule.ruleId,
    ruleNumber: rule.ruleNumber,
    subRule: rule.subRule,
    title: rule.title,
    source: rule.source,
    exceptions: rule.exceptions,
  };

  // Rule 26 wholesale exemption gate (Chapter II rules only)
  if (rule.scope.includes("Chapter II")) {
    if (exemption.exempt === true) {
      return { ...base, status: "NOT_APPLICABLE", reason: `Rule 26 exemption: ${exemption.reason}` };
    }
    if (exemption.exempt === null) {
      return { ...base, status: "REVIEW", reason: `Cannot rule out Rule 26 exemption: ${exemption.reason}` };
    }
  }

  const conditionResults = rule.conditions.map(c => ({ cond: c, res: c.evaluate(input) }));

  // Any failed condition → NOT_APPLICABLE (with the condition's explanation)
  const failed = conditionResults.find(r => r.res.ok === false);
  if (failed) {
    const detail = failed.res.detail ?? failedDetailedReason(rule, input);
    return { ...base, status: "NOT_APPLICABLE", reason: detail ?? `Condition not met: ${failed.cond.description}.` };
  }
  // Any unknown condition → REVIEW (never silently false)
  const unknown = conditionResults.find(r => r.res.ok === null);
  if (unknown) {
    const what = reviewReasonText(unknown.res.reviewReason);
    return {
      ...base,
      status: "REVIEW",
      reason: `Evidence missing for: ${unknown.cond.description}. ${what}`,
    };
  }
  const details = conditionResults.map(r => r.res.detail).filter((d): d is string => typeof d === "string" && d.length > 0);
  const detailText = details.length > 0 ? " " + details.join(" ") : "";
  return { ...base, status: "APPLICABLE", reason: `All applicability conditions met. ${rule.scope}.${detailText}` };
}

function reviewReasonText(code?: string): string {
  switch (code) {
    case "PACKAGE_TYPE_UNKNOWN":
      return "Package type (retail vs wholesale) is not established — classify the package first.";
    case "QUANTITY_UNKNOWN":
      return "Net quantity/unit is not established — extract or enter the net quantity first.";
    case "PRODUCT_CATEGORY_UNKNOWN":
      return "Product category is not established.";
    case "INTENDED_CONSUMER_UNKNOWN":
      return "Intended consumer (retail vs industrial/institutional) is not established. If this package is meant for industrial or institutional use, Rule 3(b) excludes it from Chapter II — record this fact to resolve the review.";
    default:
      return "Required classification evidence is missing.";
  }
}

function failedDetailedReason(
  rule: (typeof RULES)[number],
  input: ApplicabilityInput
): string | null {
  // Chapter II rules fail only via the Rule 3 boundary — surface its exact clause.
  if (rule.scope.includes("Chapter II")) {
    const c = chapterIiReason(input);
    if (c) return c;
  }
  return null;
}

function chapterIiReason(input: ApplicabilityInput): string | null {
  if (input.intendedConsumer === "INDUSTRIAL" || input.intendedConsumer === "INSTITUTIONAL") {
    return "Rule 3(b): Chapter II does not apply to packages meant for industrial or institutional consumers.";
  }
  if (input.quantity !== null && input.quantityUnit) {
    const unit = input.quantityUnit.toLowerCase();
    if ((unit === "kg" || unit === "l") && input.quantity > 25) {
      return `Rule 3(a): package of ${input.quantity} ${input.quantityUnit} exceeds 25 ${unit} — Chapter II does not apply (cement/fertilizer bag exception not established).`;
    }
  }
  return null;
}

function buildProductDeferrals(input: ApplicabilityInput, asOf: Date) {
  const notApplicable: ApplicabilityDecision[] = [];
  const review: ApplicabilityDecision[] = [];

  const mk = (ruleId: string, subRule: string, title: string, outcome: { ok: boolean | null; reason: string; review?: string }, source: string): ApplicabilityDecision | null => {
    const base = { ruleId, ruleNumber: "6", subRule, title, source };
    if (outcome.ok === false) {
      notApplicable.push({ ...base, status: "NOT_APPLICABLE", reason: outcome.reason });
      return null;
    }
    if (outcome.ok === null) {
      review.push({ ...base, status: "REVIEW", reason: `${outcome.reason} Classification evidence is missing.` });
    }
    return null;
  };

  if (asOf >= new Date("2011-04-01")) {
    mk("R6.1a-food-deferral", "1(a) Explanation III", "Manufacturer details — food deferral", manufacturerDetailsApply(input), "Rules 2011, Rule 6(1)(a) Explanation III, p.5");
    mk("R6.1d-proviso", "1(d) provisos", "Date declaration — provisos", dateDeclarationApply(input), "Rules 2011, Rule 6(1)(d) provisos, pp.5-6");
    mk("R6.1e-proviso", "1(e) proviso", "MRP declaration — proviso", mrpDeclarationApply(input), "Rules 2011, Rule 6(1)(e) proviso, p.6");
  }
  return { notApplicable, review };
}

import type { LegalRule } from "./types.js";
import { chapterIiApplies, wholesaleRulesApply } from "./packageApplicability.js";
import { manufacturerDetailsApply, dateDeclarationApply, mrpDeclarationApply, consumerCareApply } from "./productApplicability.js";
import { evaluateRule26Exemptions } from "./exemptionEngine.js";

/**
 * SOURCE LAW: "9 The Legal Metrology (Package Commodities) Rules, 2011.pdf"
 * Every condition below cites the exact provision. No invented requirements.
 *
 * Version notes:
 * - Rule 6(1)(d) rubber-stamp proviso withdrawn wef 01.07.2012 (GSR 748(E), 24.10.2011)
 * - Rule 26(a) proviso (10–20 g/ml MRP+qty requirement) withdrawn wef 01.07.2012
 * Post-2012 inspections therefore resolve to the post-withdrawal versions.
 */

const SOURCE = "Legal Metrology (Packaged Commodities) Rules, 2011";

export const RULES: LegalRule[] = [
  {
    ruleId: "R6.1a",
    ruleNumber: "6",
    subRule: "1(a)",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Retail packages in Chapter II scope",
    title: "Name and address of manufacturer/packer/importer",
    conditions: [
      { description: "Chapter II applies to this package (Rule 3 boundaries)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
    ],
    exceptions: [
      "Rule 6(1)(a) Explanation III: food articles defer to PFA Act 1954 rules (see sub-rule conditions in productApplicability)",
    ],
    source: `${SOURCE}, Rule 6(1)(a), p.5`,
    status: "ACTIVE",
    notes: "For imported packages the importer's name and address must be mentioned.",
  },
  {
    ruleId: "R6.1b",
    ruleNumber: "6",
    subRule: "1(b)",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Retail packages in Chapter II scope",
    title: "Common/generic name of commodity",
    conditions: [
      { description: "Chapter II applies (Rule 3)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
    ],
    exceptions: [],
    source: `${SOURCE}, Rule 6(1)(b), p.5`,
    status: "ACTIVE",
  },
  {
    ruleId: "R6.1c",
    ruleNumber: "6",
    subRule: "1(c)",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Retail packages in Chapter II scope",
    title: "Net quantity / number declaration",
    conditions: [
      { description: "Chapter II applies (Rule 3)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
    ],
    exceptions: [],
    source: `${SOURCE}, Rule 6(1)(c), p.5`,
    status: "ACTIVE",
  },
  {
    ruleId: "R6.1d",
    ruleNumber: "6",
    subRule: "1(d)",
    version: 2, // rubber-stamp proviso withdrawn wef 01.07.2012
    effectiveFrom: "2012-07-01",
    effectiveTo: null,
    scope: "Retail packages in Chapter II scope",
    title: "Month and year of manufacture/pre-pack/import",
    conditions: [
      { description: "Chapter II applies (Rule 3)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
      { description: "No product-level proviso defers the date declaration", evaluate: i => {
        const r = dateDeclarationApply(i);
        return { ok: r.ok, detail: r.reason };
      } },
    ],
    exceptions: [
      "Seeds labeled/certified under Seeds Act 1966 (Rule 6(1)(d) proviso)",
      "Bidis and incense sticks (Rule 6(1)(d) proviso (A)(i))",
      "PSU domestic LPG cylinders 14.2/5 kg (Rule 6(1)(d) proviso (A)(ii))",
      "Food articles — PFA 1954 applies (Rule 6(1)(d) proviso)",
      "Cosmetics — Drugs and Cosmetics Rules 1945 apply (Rule 6(1)(d) proviso)",
    ],
    source: `${SOURCE}, Rule 6(1)(d), pp.5-6`,
    status: "ACTIVE",
    notes: "Version 2 reflects withdrawal of the rubber-stamp proviso by GSR 748(E) wef 01.07.2012.",
  },
  {
    ruleId: "R6.1e",
    ruleNumber: "6",
    subRule: "1(e)",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Retail packages in Chapter II scope",
    title: "Retail sale price (MRP)",
    conditions: [
      { description: "Chapter II applies (Rule 3)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
      { description: "No MRP-specific proviso exemption", evaluate: i => {
        const r = mrpDeclarationApply(i);
        return { ok: r.ok, detail: r.reason };
      } },
    ],
    exceptions: [
      "Alcoholic beverages/spirituous liquor — State Excise Laws apply where they provide for MRP (Rule 6(1)(e) proviso)",
      "Bidi packages (Rule 6(1)(e) proviso (C)(i))",
      "APM-priced domestic LPG cylinders (Rule 6(1)(e) proviso (C)(ii))",
    ],
    source: `${SOURCE}, Rule 6(1)(e), p.6`,
    status: "ACTIVE",
  },
  {
    ruleId: "R6.2",
    ruleNumber: "6",
    subRule: "2",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Every package in Chapter II scope",
    title: "Consumer-complaint contact (name, address, phone, email if available)",
    conditions: [
      { description: "Chapter II applies (Rule 3)", evaluate: i => {
        const r = chapterIiApplies(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
      { description: "No product-level exemption in source", evaluate: () => ({ ok: consumerCareApply({} as never).ok }) },
    ],
    exceptions: [],
    source: `${SOURCE}, Rule 6(2), p.7`,
    status: "ACTIVE",
  },
  {
    ruleId: "R24",
    ruleNumber: "24",
    version: 1,
    effectiveFrom: "2011-04-01",
    effectiveTo: null,
    scope: "Wholesale packages",
    title: "Declarations on every wholesale package",
    conditions: [
      { description: "Package is a wholesale package", evaluate: i => {
        const r = wholesaleRulesApply(i);
        return { ok: r.ok, detail: r.reason, reviewReason: r.review as never };
      } },
      {
        description: "No equivalent declaration required under another law (Rule 24 proviso)",
        evaluate: i => ({
          ok: i.specialLawCategory === "other-law-declarations" ? false : true,
        }),
      },
    ],
    exceptions: ["Rule 24 proviso: nothing in this rule applies where a similar declaration is required by any other law for the time being in force."],
    source: `${SOURCE}, Rule 24, p.24 (wholesale chapter)`,
    status: "ACTIVE",
    notes: "Requires manufacturer/importer/packer identity, commodity identity, and total retail packages or net quantity.",
  },
];

/** Rules exempted wholesale by Rule 26 — represented as a decision, not a rule. */
export function rule26Applies(input: Parameters<typeof evaluateRule26Exemptions>[0]): ExemptionOutcomeLike {
  return evaluateRule26Exemptions(input);
}

interface ExemptionOutcomeLike {
  exempt: boolean | null;
  reason: string;
  review?: string;
}

export { chapterIiApplies, wholesaleRulesApply, manufacturerDetailsApply, dateDeclarationApply, mrpDeclarationApply, consumerCareApply, evaluateRule26Exemptions };

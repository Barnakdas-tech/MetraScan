import type { LegalRule } from "./types.js";

/**
 * Resolves the effective rule version for a given date:
 * - excludes versions not yet in force (effectiveFrom in the future)
 * - excludes expired versions (effectiveTo <= date)
 * - a rule "replaced" by a newer overlapping version resolves to the newest
 * Withdrawn provisos (e.g., GSR 748(E) wef 01.07.2012) get effectiveTo set so
 * a 2026 inspection never applies them.
 */
export function resolveEffectiveRules<T extends LegalRule>(
  rules: T[],
  asOf: Date
): T[] {
  const byRule = new Map<string, T[]>();
  for (const rule of rules) {
    const list = byRule.get(rule.ruleId) ?? [];
    list.push(rule);
    byRule.set(rule.ruleId, list);
  }

  const resolved: T[] = [];
  for (const versions of byRule.values()) {
    // Newest version effective at or before asOf wins when overlapping.
    const effective = versions.filter(
      v => new Date(v.effectiveFrom) <= asOf && (v.effectiveTo === null || new Date(v.effectiveTo) > asOf)
    );
    if (effective.length === 0) continue;
    effective.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
    resolved.push(effective[0]);
  }
  return resolved;
}

/** The legal "version label" for reporting: the rule set in force at a date. */
export function describeLegalVersion(asOf: Date): string {
  return `Legal Metrology (Packaged Commodities) Rules, 2011 as amended, in force at ${asOf.toISOString().slice(0, 10)}`;
}

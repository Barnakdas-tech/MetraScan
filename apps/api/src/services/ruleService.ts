import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { RULES } from "@metrascan/legal-engine";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const matrixPath = join(__dirname, "../../../../archive/starter-template/legal/LEGAL_RULE_MATRIX.md");

let allRulesCache: any[] | null = null;

export function getRules() {
  if (allRulesCache) return allRulesCache;

  const content = fs.readFileSync(matrixPath, "utf-8");
  const lines = content.split('\n');
  let inTable = false;
  const registryMap = new Map<string, any>();

  for (const line of lines) {
    if (line.startsWith('| ID |')) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('|---')) {
      continue;
    }
    if (inTable && line.startsWith('|')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 5) {
        const id = parts[1];
        registryMap.set(id, {
          ruleId: id,
          ruleNumber: parts[2],
          title: parts[3],
          scope: "General Registry",
          status: "NOT_YET_IMPLEMENTED",
          source: `Legal Metrology (Packaged Commodities) Rules, 2011, ${parts[2]}`,
          conditions: [{ description: "This rule is documented in the legal source but is not yet actively evaluated by the automated compliance engine." }],
          exceptions: [],
          version: 0,
          effectiveFrom: "2011-04-01",
          effectiveTo: null,
          automation: parts[4],
          notes: "Pending implementation."
        });
      }
    }
    if (inTable && !line.startsWith('|') && line.trim() === '') {
      inTable = false;
    }
  }

  // Override with active rules from engine
  for (const activeRule of RULES) {
    registryMap.set(activeRule.ruleId, {
      ruleId: activeRule.ruleId,
      ruleNumber: activeRule.ruleNumber,
      subRule: activeRule.subRule,
      version: activeRule.version,
      effectiveFrom: activeRule.effectiveFrom,
      effectiveTo: activeRule.effectiveTo,
      scope: activeRule.scope,
      title: activeRule.title,
      conditions: activeRule.conditions.map(c => ({ description: c.description })),
      exceptions: activeRule.exceptions,
      source: activeRule.source,
      status: activeRule.status, // "ACTIVE"
      notes: activeRule.notes,
    });
  }

  allRulesCache = Array.from(registryMap.values());
  return allRulesCache;
}

export function getRuleById(ruleId: string) {
  const rules = getRules();
  return rules.find(r => r.ruleId === ruleId) || null;
}

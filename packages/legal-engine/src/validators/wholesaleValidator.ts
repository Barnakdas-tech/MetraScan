import type { DeclarationEvidence, ValidationOutcome, VisualEvidence } from "../types.js";

const VERSION = "wholesale-v1";
const SOURCE = "Rules 2011, Rule 24, p.24 (Chapter III — wholesale packages)";

/**
 * RULE 24 — declarations on every wholesale package (source, p.24):
 *  (a) name and address of manufacturer or importer or, where not the packer, of the packer;
 *  (b) identity of the commodity; and
 *  (c) total number of retail packages OR net quantity in standard units.
 * Proviso: not applicable where a similar declaration is required by another law.
 */
export function validateWholesaleDeclarations(
  declarations: DeclarationEvidence[],
  visual: VisualEvidence,
  specialLawCategory: string | null
): ValidationOutcome {
  if (specialLawCategory === "other-law-declarations") {
    return {
      ruleId: "R24",
      status: "NOT_APPLICABLE",
      confidence: 0.9,
      reason: "Rule 24 proviso: nothing in this rule applies where a similar declaration is required on the wholesale package by or under any other law for the time being in force.",
      evidence: null,
      inputs: { specialLawCategory },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }

  const outcomes: ValidationOutcome[] = [];
  outcomes.push(checkWholesaleParty(declarations, visual));

  const identity = declarations.find(d => d.field === "genericName" || d.field === "productName");
  if (!identity) {
    outcomes.push(missingOutcome("R24", "Commodity identity", "identity of the commodity contained in the package (Rule 24(b))", visual));
  } else {
    outcomes.push({
      ruleId: "R24",
      status: "PASS",
      confidence: Math.min(0.92, identity.confidence ?? 0.75),
      reason: `Commodity identity detected ("${identity.rawText}") per Rule 24(b).`,
      evidence: { imageId: identity.imageId, bbox: identity.bbox, text: identity.rawText },
      inputs: { subClause: "(b)", value: identity.normalizedValue },
      validatorVersion: VERSION,
      source: SOURCE,
    });
  }

  const totalCount = declarations.find(d => d.field === "totalRetailPackages");
  const netQty = declarations.find(d => d.field === "netQuantity");
  if (!totalCount && !netQty) {
    outcomes.push(missingOutcome("R24", "Total retail packages or net quantity", "total number of retail packages OR net quantity in standard units (Rule 24(c))", visual));
  } else {
    const found = totalCount ?? netQty!;
    outcomes.push({
      ruleId: "R24",
      status: "PASS",
      confidence: Math.min(0.92, found.confidence ?? 0.75),
      reason: `Rule 24(c) satisfied by ${totalCount ? "total retail package count" : "net quantity"} "${found.rawText}".`,
      evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
      inputs: { subClause: "(c)", via: totalCount ? "totalRetailPackages" : "netQuantity", value: found.normalizedValue, unit: found.unit },
      validatorVersion: VERSION,
      source: SOURCE,
    });
  }

  const failed = outcomes.filter(o => o.status === "FAIL");
  const reviews = outcomes.filter(o => o.status === "REVIEW");
  if (failed.length > 0) {
    return {
      ruleId: "R24",
      status: "FAIL",
      confidence: Math.max(...failed.map(o => o.confidence)),
      reason: failed.map(o => o.reason).join(" "),
      evidence: failed.find(o => o.evidence)?.evidence ?? null,
      inputs: { subResults: outcomes.map(o => ({ status: o.status, reason: o.reason })) },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  if (reviews.length > 0) {
    return {
      ruleId: "R24",
      status: "REVIEW",
      confidence: Math.min(...reviews.map(o => o.confidence)),
      reason: reviews.map(o => o.reason).join(" "),
      evidence: reviews.find(o => o.evidence)?.evidence ?? null,
      inputs: { subResults: outcomes.map(o => ({ status: o.status, reason: o.reason })) },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  return {
    ruleId: "R24",
    status: "PASS",
    confidence: Math.min(...outcomes.map(o => o.confidence)),
    reason: "All Rule 24 wholesale declarations detected: party identity and address, commodity identity, and total retail packages or net quantity.",
    evidence: outcomes.find(o => o.evidence)?.evidence ?? null,
    inputs: { subResults: outcomes.map(o => ({ status: o.status, reason: o.reason })) },
    validatorVersion: VERSION,
    source: SOURCE,
  };
}

function checkWholesaleParty(declarations: DeclarationEvidence[], visual: VisualEvidence): ValidationOutcome {
  const name = declarations.find(d => d.field === "manufacturerName" || d.field === "importerName" || d.field === "packerName");
  const address = declarations.find(d => d.field === "manufacturerAddress" || d.field === "importerAddress" || d.field === "packerAddress");
  if (!name && !address) {
    return missingOutcome("R24", "Manufacturer/importer/packer details", "name and address of the manufacturer, importer, or packer (Rule 24(a))", visual);
  }
  if (name && !address) {
    return {
      ruleId: "R24",
      status: "REVIEW",
      confidence: 0.55,
      reason: `Rule 24(a) party name detected ("${name.rawText}") but no address was found — the rule requires the name AND address of the manufacturer/importer/packer.`,
      evidence: { imageId: name.imageId, bbox: name.bbox, text: name.rawText },
      inputs: { nameFound: true, addressFound: false },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  return {
    ruleId: "R24",
    status: "PASS",
    confidence: Math.min(0.92, ((name!.confidence ?? 0.8) + (address!.confidence ?? 0.7)) / 2),
    reason: "Manufacturer/importer/packer name and address detected per Rule 24(a).",
    evidence: { imageId: name!.imageId, bbox: name!.bbox, text: name!.rawText },
    inputs: { nameFound: true, addressFound: true },
    validatorVersion: VERSION,
    source: SOURCE,
  };
}

function missingOutcome(ruleId: string, fieldName: string, humanName: string, visual: VisualEvidence): ValidationOutcome {
  if (!visual.ocrRan || visual.totalRegions === 0) {
    return {
      ruleId,
      status: "REVIEW",
      confidence: 0.4,
      reason: `A required wholesale declaration (${humanName}) is not detected and OCR results are insufficient to establish whether it exists. Not detected is not proven absent.`,
      evidence: null,
      inputs: { field: fieldName, ocrRan: visual.ocrRan, totalRegions: visual.totalRegions },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  if (!visual.anyImageSufficientQuality) {
    return {
      ruleId,
      status: "REVIEW",
      confidence: 0.45,
      reason: `A required wholesale declaration (${humanName}) is not detected, but image quality was insufficient to reliably establish absence. Requires manual inspection.`,
      evidence: null,
      inputs: { field: fieldName, imageQuality: "insufficient" },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  return {
    ruleId,
    status: "FAIL",
    confidence: 0.8,
    reason: `A required wholesale declaration (${humanName}) is not detected across analyzed package images despite sufficient image quality for detection.`,
    evidence: { imageId: null, bbox: null, text: null },
    inputs: { field: fieldName, imagesSearched: visual.imageCount },
    validatorVersion: VERSION,
    source: SOURCE,
  };
}

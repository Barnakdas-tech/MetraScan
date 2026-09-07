import type { DeclarationEvidence, VisualEvidence, ValidationOutcome } from "../types.js";
import { normalizeUnit, correctUnitFor, isPermittedUnit, isKnownNonSiUnit } from "./units.js";

const VERSION = "quantity-v1";
const SOURCE = "Rules 2011, Rules 6(1)(c), 11, 12, 13";

/**
 * Rule 6(1)(c): net quantity must be declared. Rules 11-13 govern its manner/units.
 * CRITICAL: "not detected" ≠ "proven absent" — image quality gates FAIL vs REVIEW.
 */
export function validateNetQuantity(
  declarations: DeclarationEvidence[],
  visual: VisualEvidence
): ValidationOutcome {
  const netQty = declarations.find(d => d.field === "netQuantity");

  if (!netQty) {
    // Missing evidence: is it proven absent, or just not readable?
    if (!visual.ocrRan || visual.totalRegions === 0) {
      return {
        ruleId: "R6.1c",
        status: "REVIEW",
        confidence: 0.4,
        reason: "Net quantity declaration not detected and OCR results are insufficient to establish whether the declaration exists. Not detected is not proven absent.",
        evidence: null,
        inputs: { declarationFound: false, ocrRan: visual.ocrRan, totalRegions: visual.totalRegions },
        validatorVersion: VERSION,
        source: SOURCE,
      };
    }
    if (!visual.anyImageSufficientQuality) {
      return {
        ruleId: "R6.1c",
        status: "REVIEW",
        confidence: 0.45,
        reason: "No net quantity declaration detected, but image quality was insufficient to reliably establish absence. Requires manual inspection.",
        evidence: null,
        inputs: { declarationFound: false, imageQuality: "insufficient" },
        validatorVersion: VERSION,
        source: SOURCE,
      };
    }
    // OCR ran on sufficient-quality images and still no quantity → proven absent with reasonable confidence
    return {
      ruleId: "R6.1c",
      status: "FAIL",
      confidence: 0.85,
      reason: "No net quantity declaration detected across analyzed package images despite sufficient image quality for detection.",
      evidence: { imageId: null, bbox: null, text: null },
      inputs: { declarationFound: false, imagesSearched: visual.imageCount },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }

  const value = Number(netQty.correctedValue ?? netQty.normalizedValue);
  const unit = normalizeUnit(netQty.unit);

  if (!Number.isFinite(value)) {
    return {
      ruleId: "R6.1c",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Net quantity text was detected ("${netQty.rawText}") but could not be parsed into a numeric value.`,
      evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
      inputs: { rawValue: netQty.rawText },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }

  // Rule 13(5): only SI units
  if (!unit) {
    if (isKnownNonSiUnit(netQty.unit)) {
      return {
        ruleId: "R6.1c",
        status: (netQty.confidence ?? 1) < 0.6 ? "REVIEW" : "FAIL",
        confidence: 0.85,
        reason: `Net quantity uses unit "${netQty.unit}" which is not an SI unit permitted under Rule 13(5) (only the International System of Units may be used; items sold by number use N or U).`,
        evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
        inputs: { value, unit: netQty.unit },
        validatorVersion: VERSION,
        source: SOURCE,
      };
    }
    return {
      ruleId: "R6.1c",
      status: "REVIEW",
      confidence: 0.55,
      reason: `Net quantity detected as ${value} but the unit ("${netQty.unit}") is not recognized. Unit legality cannot be determined.`,
      evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
      inputs: { value, unit: netQty.unit },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }
  if (unit && !isPermittedUnit(unit)) {
    return {
      ruleId: "R6.1c",
      status: (netQty.confidence ?? 1) < 0.6 ? "REVIEW" : "FAIL",
      confidence: 0.8,
      reason: `Net quantity uses unit "${netQty.unit}" which is not an SI unit permitted under Rule 13(5) (only the International System of Units may be used; items sold by number use N or U).`,
      evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
      inputs: { value, unit: netQty.unit },
      validatorVersion: VERSION,
      source: SOURCE,
    };
  }

  // Rule 13(2)/(3): correct scale — <1 kg in grams, ≥1 kg in kg (or grams per proviso), etc.
  const expected = correctUnitFor(value, unit);
  if (expected && unit !== expected && !(expected === "kg" && unit === "g") && !(expected === "L" && unit === "ml")) {
    // The optional-equality proviso allows exactly-1-unit in either form; fractions of the larger
    // unit expressed in the smaller unit are also permitted (e.g., 0.5 kg may be "500 g").
    // Only flag when the scale rule is genuinely violated (e.g., "0.5 kg" instead of "500 g").
    const inLargerUnit = (expected === "kg" && unit === "g") || (expected === "L" && unit === "ml");
    if (!inLargerUnit) {
      return {
        ruleId: "R6.1c",
        status: (netQty.confidence ?? 1) < 0.6 ? "REVIEW" : "FAIL",
        confidence: 0.75,
        reason: `Net quantity of ${value} ${netQty.unit} uses unit "${unit}" but Rule 13(2) requires "${expected}" for this quantity range.`,
        evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
        inputs: { value, unit, expected },
        validatorVersion: VERSION,
        source: SOURCE,
      };
    }
  }

  return {
    ruleId: "R6.1c",
    status: "PASS",
    confidence: Math.min(0.97, (netQty.confidence ?? 0.8) * 0.97),
    reason: `Net quantity declared as ${value} ${netQty.unit} with a valid SI unit appropriate to the quantity range.`,
    evidence: { imageId: netQty.imageId, bbox: netQty.bbox, text: netQty.rawText },
    inputs: { value, unit },
    validatorVersion: VERSION,
    source: SOURCE,
  };
}

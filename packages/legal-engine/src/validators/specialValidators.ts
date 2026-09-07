import type { ValidationOutcome } from "../types.js";

const SOURCE_R7 = "Rules 2011, Rule 7, pp.7-9";

/**
 * RULE 7 — numeral/letter physical size.
 *
 * CRITICAL HONESTY RULE: exact millimetre heights CANNOT be measured from an
 * arbitrary, uncalibrated photograph. Without a scale reference in the image
 * (a ruler, a known-dimension object, or calibrated capture), any "measurement"
 * would be fabricated. This validator therefore returns MANUAL_REQUIRED
 * unless calibration is explicitly provided.
 */
export function validateNumeralSize(input: {
  calibrated: boolean;
  calibrationSource?: string;
  netQuantityValue?: number | null;
  netQuantityUnit?: string | null;
}): ValidationOutcome {
  const VERSION = "numeral-size-v1";

  if (!input.calibrated) {
    return {
      ruleId: "R7.2",
      status: "MANUAL_REQUIRED",
      confidence: 0.3,
      reason:
        "Physical numeral height (in millimetres) cannot be determined from an uncalibrated photograph. Rule 7(2) sets minimum heights (1/2/4/6 mm depending on net quantity and container type), which require calibrated physical measurement. This check must be performed manually with a measuring instrument.",
      evidence: null,
      inputs: { calibrated: false },
      validatorVersion: VERSION,
      source: SOURCE_R7,
    };
  }

  // Calibrated measurement path — the actual mm values would come from the
  // calibrated capture pipeline (future phase). With calibration declared but
  // no measurements provided, still REVIEW (not FAIL).
  return {
    ruleId: "R7.2",
    status: "REVIEW",
    confidence: 0.5,
    reason: `Calibration is declared ("${input.calibrationSource ?? "unspecified"}") but no measured numeral heights were supplied for comparison against Rule 7(2) Tables I/II.`,
    evidence: null,
    inputs: { calibrated: true, calibrationSource: input.calibrationSource ?? null },
    validatorVersion: VERSION,
    source: SOURCE_R7,
  };
}

/** Rule 8(1) proviso: clear space around the net-quantity declaration. Needs visual evidence, not OCR text. */
export function validateDeclarationSpacing(input: { visualAnalysisAvailable: boolean }): ValidationOutcome {
  const VERSION = "spacing-v1";
  if (!input.visualAnalysisAvailable) {
    return {
      ruleId: "R8.1",
      status: "MANUAL_REQUIRED",
      confidence: 0.3,
      reason:
        "Rule 8(1) requires the area surrounding the quantity declaration to be free from printed information (clear space equal to the numeral height above/below, and twice the numeral height left/right). Verifying this requires visual analysis or manual inspection; OCR text alone cannot establish it.",
      evidence: null,
      inputs: { visualAnalysisAvailable: false },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 8(1), p.9",
    };
  }
  return {
    ruleId: "R8.1",
    status: "REVIEW",
    confidence: 0.5,
    reason: "Visual analysis for clear-space compliance is not yet implemented; manual verification required.",
    evidence: null,
    inputs: { visualAnalysisAvailable: true },
    validatorVersion: VERSION,
    source: "Rules 2011, Rule 8(1), p.9",
  };
}

/** Rule 9(1)(b): contrast of price/quantity numerals against background. Visual, not OCR. */
export function validateContrast(input: { visualAnalysisAvailable: boolean }): ValidationOutcome {
  const VERSION = "contrast-v1";
  if (!input.visualAnalysisAvailable) {
    return {
      ruleId: "R9.1b",
      status: "MANUAL_REQUIRED",
      confidence: 0.3,
      reason:
        "Rule 9(1)(b) requires the retail-sale-price and net-quantity numerals to be printed in a colour that contrasts conspicuously with the label background. This is a visual property that OCR cannot establish; manual inspection or calibrated colour analysis is required.",
      evidence: null,
      inputs: { visualAnalysisAvailable: false },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 9(1)(b), p.9",
    };
  }
  return {
    ruleId: "R9.1b",
    status: "REVIEW",
    confidence: 0.5,
    reason: "Colour-contrast analysis is not yet implemented; manual verification required.",
    evidence: null,
    inputs: { visualAnalysisAvailable: true },
    validatorVersion: VERSION,
    source: "Rules 2011, Rule 9(1)(b), p.9",
  };
}

/** Rule 12(6): quantity declaration must not use qualifying/misleading words (post-2012 amendment text applies from 01.07.2012). */
export function validateQuantityWording(qtyDecl: { rawText: string; confidence?: number | null } | null, inspectionDate: Date): ValidationOutcome {
  const VERSION = "quantity-wording-v1";
  const rawQuantityText = qtyDecl?.rawText ?? null;
  if (!rawQuantityText) {
    return {
      ruleId: "R12.6",
      status: "REVIEW",
      confidence: 0.4,
      reason: "No quantity text available to check for misleading qualifiers.",
      evidence: null,
      inputs: { text: null },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 12(6), p.12 (amended wef 01.07.2012)",
    };
  }

  // Post-amendment (wef 01.07.2012): NO qualifier words of any sort.
  // Pre-amendment base text: 'minimum', 'not less than', 'average', 'about', 'approximately'.
  const post2012 = inspectionDate >= new Date("2012-07-01");
  const qualifiers = post2012
    ? /\b(minimum|min\b|not less than|average|about|approx\.?|approximately|approx|approx\.)\b/i
    : /\b(minimum|not less than|average|about|approximately)\b/i;

  if (qualifiers.test(rawQuantityText)) {
    return {
      ruleId: "R12.6",
      status: (qtyDecl?.confidence ?? 1) < 0.6 ? "REVIEW" : "FAIL",
      confidence: 0.85,
      reason: `Quantity declaration "${rawQuantityText}" contains a qualifying/misleading word. ${post2012 ? "The provision (as amended wef 01.07.2012 by GSR 748(E)) prohibits any word or expression which tends to create an exaggerated, misleading or inadequate impression of quantity." : "Rule 12(6) prohibits words like 'minimum', 'not less than', 'average', 'about', 'approximately'."}`,
      evidence: { imageId: null, bbox: null, text: rawQuantityText },
      inputs: { text: rawQuantityText, postAmendment: post2012 },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 12(6), p.12",
    };
  }
  return {
    ruleId: "R12.6",
    status: "PASS",
    confidence: 0.9,
    reason: `Quantity declaration "${rawQuantityText}" contains no prohibited qualifying words.`,
    evidence: { imageId: null, bbox: null, text: rawQuantityText },
    inputs: { text: rawQuantityText, postAmendment: post2012 },
    validatorVersion: VERSION,
    source: "Rules 2011, Rule 12(6), p.12",
  };
}

/** Rule 13(4): no archaic counting words (dozen, score, gross). */
export function validateArchaicCounting(qtyDecl: { rawText: string; confidence?: number | null } | null): ValidationOutcome {
  const VERSION = "archaic-count-v1";
  const rawText = qtyDecl?.rawText ?? null;
  if (!rawText) {
    return {
      ruleId: "R13.4",
      status: "REVIEW",
      confidence: 0.4,
      reason: "No text available to check for archaic counting terms.",
      evidence: null,
      inputs: {},
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 13(4), p.14",
    };
  }
  if (/\b(dozen|score|gross|great gross)\b/i.test(rawText)) {
    return {
      ruleId: "R13.4",
      status: (qtyDecl?.confidence ?? 1) < 0.6 ? "REVIEW" : "FAIL",
      confidence: 0.9,
      reason: `Text "${rawText}" uses an archaic counting term ("dozen", "score", "gross" or "great gross"), which Rule 13(4) prohibits on packages.`,
      evidence: { imageId: null, bbox: null, text: rawText },
      inputs: { text: rawText },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 13(4), p.14",
    };
  }
  return {
    ruleId: "R13.4",
    status: "PASS",
    confidence: 0.85,
    reason: "No archaic counting terms detected.",
    evidence: { imageId: null, bbox: null, text: rawText },
    inputs: { text: rawText },
    validatorVersion: VERSION,
    source: "Rules 2011, Rule 13(4), p.14",
  };
}

/** Rule 14: dimensions declaration for textiles/fabric-type commodities. */
export function validateDimensions(
  declarations: { field: string; rawText: string; normalizedValue: string | null; correctedValue: string | null; confidence: number | null; imageId: string | null; bbox: number[] | null }[],
  productCategory: string | null,
  visual: { ocrRan: boolean; totalRegions: number; anyImageSufficientQuality: boolean; imageCount: number }
): ValidationOutcome {
  const VERSION = "dimensions-v1";
  // Source (p.14): "commodities like bed-sheets, hemmed fabric materials, dhoties,
  // sarees, napkins, pillow-covers, towels, table cloths or similar other commodities".
  // Gate on textile/fabric-like product categories, not a single literal string.
  const textileLike = ["garment", "textile", "fabric", "household"].includes(productCategory ?? "");
  if (!textileLike) {
    return {
      ruleId: "R14",
      status: "NOT_APPLICABLE",
      confidence: 0.9,
      reason: `Rule 14 applies to commodities like bed-sheets, hemmed fabric materials, dhoties, sarees, napkins, pillow-covers, towels, table cloths or similar; this product (category "${productCategory ?? "unknown"}") does not appear to be such a commodity. If it is one of these, set the product category so Rule 14 can be checked.`,
      evidence: null,
      inputs: { productCategory },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 14, p.14",
    };
  }
  const dims = declarations.find(d => d.field === "dimensions");
  if (!dims) {
    if (!visual.ocrRan || visual.totalRegions === 0) {
      return {
        ruleId: "R14",
        status: "REVIEW",
        confidence: 0.4,
        reason: "Garment-type commodity, but OCR results are insufficient to establish whether dimensions are declared.",
        evidence: null,
        inputs: {},
        validatorVersion: VERSION,
        source: "Rules 2011, Rule 14, p.14",
      };
    }
    if (!visual.anyImageSufficientQuality) {
      return {
        ruleId: "R14",
        status: "REVIEW",
        confidence: 0.45,
        reason: "No dimensions declaration detected, but image quality was insufficient to reliably establish absence. Requires manual inspection.",
        evidence: null,
        inputs: { productCategory, imageQuality: "insufficient" },
        validatorVersion: VERSION,
        source: "Rules 2011, Rule 14, p.14",
      };
    }
    return {
      ruleId: "R14",
      status: "FAIL",
      confidence: 0.8,
      reason: "Garment-type commodity (Rule 14 scope) with no dimensions declaration detected across analyzed images.",
      evidence: { imageId: null, bbox: null, text: null },
      inputs: { productCategory, imagesSearched: visual.imageCount },
      validatorVersion: VERSION,
      source: "Rules 2011, Rule 14, p.14",
    };
  }
  return {
    ruleId: "R14",
    status: "PASS",
    confidence: Math.min(0.9, dims.confidence ?? 0.8),
    reason: `Dimensions declared ("${dims.rawText}") for a garment-type commodity.`,
    evidence: { imageId: dims.imageId, bbox: dims.bbox, text: dims.rawText },
    inputs: { productCategory, value: dims.normalizedValue },
    validatorVersion: VERSION,
    source: "Rules 2011, Rule 14, p.14",
  };
}

/**
 * Country of origin — NOT a requirement of the supplied 2011 base text.
 * Honest NOT_APPLICABLE rather than an invented requirement.
 */
export function validateCountryOfOrigin(): ValidationOutcome {
  return {
    ruleId: "COO",
    status: "NOT_APPLICABLE",
    confidence: 0.95,
    reason: "Country-of-origin declaration is not among the mandatory declarations in the supplied Legal Metrology (Packaged Commodities) Rules, 2011 base text. If required under another law or a later amendment not yet encoded, it must be checked there.",
    evidence: null,
    inputs: {},
    validatorVersion: "coo-v1",
    source: "Supplied source verified: no country-of-origin clause in Rules 2011 base text",
  };
}

/** Unit sale price — likewise not a requirement in the supplied 2011 base text. */
export function validateUnitSalePrice(): ValidationOutcome {
  return {
    ruleId: "USP",
    status: "NOT_APPLICABLE",
    confidence: 0.95,
    reason: "Unit sale price is not a mandatory declaration in the supplied Legal Metrology (Packaged Commodities) Rules, 2011 base text.",
    evidence: null,
    inputs: {},
    validatorVersion: "usp-v1",
    source: "Supplied source verified: no unit-sale-price clause in Rules 2011 base text",
  };
}

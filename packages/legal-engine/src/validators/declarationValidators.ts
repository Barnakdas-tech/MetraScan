import type { DeclarationEvidence, VisualEvidence, ValidationOutcome } from "../types.js";

const SOURCE_R6 = "Rules 2011, Rule 6";

/**
 * Shared missing-evidence logic: distinguishes "not detected" from "proven absent".
 * OCR ran on sufficient-quality images and found nothing → proven absent (FAIL possible).
 * OCR missing or quality insufficient → REVIEW (cannot establish absence).
 */
function missingOutcome(
  ruleId: string,
  fieldName: string,
  humanName: string,
  visual: VisualEvidence,
  validatorVersion: string,
  source: string
): ValidationOutcome {
  if (!visual.ocrRan || visual.totalRegions === 0) {
    return {
      ruleId,
      status: "REVIEW",
      confidence: 0.4,
      reason: `${humanName} not detected and OCR results are insufficient to establish whether it exists. Not detected is not proven absent.`,
      evidence: null,
      inputs: { field: fieldName, ocrRan: visual.ocrRan },
      validatorVersion,
      source,
    };
  }
  if (!visual.anyImageSufficientQuality) {
    return {
      ruleId,
      status: "REVIEW",
      confidence: 0.45,
      reason: `No ${humanName.toLowerCase()} detected, but image quality was insufficient to reliably establish absence. Requires manual inspection.`,
      evidence: null,
      inputs: { field: fieldName, imageQuality: "insufficient" },
      validatorVersion,
      source,
    };
  }
  return {
    ruleId,
    status: "FAIL",
    confidence: 0.95,
    reason: `No ${humanName.toLowerCase()} detected across analyzed package images despite sufficient image quality for detection.`,
    evidence: { imageId: null, bbox: null, text: null },
    inputs: { field: fieldName, imagesSearched: visual.imageCount },
    validatorVersion,
    source,
  };
}

/** Rule 6(1)(a): manufacturer/packer/importer name + address (Rule 10 detail). */
export function validateManufacturerDetails(
  declarations: DeclarationEvidence[],
  visual: VisualEvidence,
  imported: boolean | null
): ValidationOutcome {
  const VERSION = "manufacturer-v1";
  const name = declarations.find(d => d.field === "manufacturerName" || d.field === "packerName" || (imported === true && d.field === "importerName"));
  const address = declarations.find(d => d.field === "manufacturerAddress" || d.field === "packerAddress" || (imported === true && d.field === "importerAddress"));
  const marketer = declarations.find(d => d.field === "marketerName");
  const marketerAddr = declarations.find(d => d.field === "marketerAddress");

  const evaluateMarketer = (): ValidationOutcome | null => {
    if (!marketer && !marketerAddr) return null;

    // A. Conflicting marketer names
    if (marketer && !marketer.correctedValue && marketer.conflicts && marketer.conflicts.length > 0) {
      const conflicting = marketer.conflicts[0];
      return {
        ruleId: "R6.1a",
        status: "REVIEW",
        confidence: 0.5,
        reason: `Conflicting marketer/brand-owner name declarations detected across package images: "${marketer.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
        evidence: {
          imageId: marketer.imageId,
          bbox: marketer.bbox,
          text: marketer.rawText,
          conflict: {
            field: marketer.field,
            primary: { imageId: marketer.imageId, text: marketer.rawText, bbox: marketer.bbox },
            conflicting: marketer.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
          },
        },
        inputs: { primaryName: marketer.rawText, conflicts: marketer.conflicts.map(c => c.rawText) },
        validatorVersion: VERSION,
        source: SOURCE_R6 + ", Rule 6(1)(a) Explanation II",
      };
    }

    // B. Conflicting marketer addresses
    if (marketerAddr && !marketerAddr.correctedValue && marketerAddr.conflicts && marketerAddr.conflicts.length > 0) {
      const conflicting = marketerAddr.conflicts[0];
      return {
        ruleId: "R6.1a",
        status: "REVIEW",
        confidence: 0.5,
        reason: `Conflicting marketer/brand-owner address declarations detected across package images: "${marketerAddr.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
        evidence: {
          imageId: marketerAddr.imageId,
          bbox: marketerAddr.bbox,
          text: marketerAddr.rawText,
          conflict: {
            field: marketerAddr.field,
            primary: { imageId: marketerAddr.imageId, text: marketerAddr.rawText, bbox: marketerAddr.bbox },
            conflicting: marketerAddr.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
          },
        },
        inputs: { primaryAddress: marketerAddr.rawText, conflicts: marketerAddr.conflicts.map(c => c.rawText) },
        validatorVersion: VERSION,
        source: SOURCE_R6 + ", Rule 6(1)(a) Explanation II, Rule 10(1)",
      };
    }

    // C. Marketer name exists but marketer address is missing
    if (marketer && !marketerAddr) {
      return {
        ruleId: "R6.1a",
        status: "REVIEW",
        confidence: 0.55,
        reason: `Brand-owner/marketer name detected ("${marketer.rawText}") but marketer address is missing. Manual verification is required to determine compliance under Rule 6(1)(a) Explanation II and Rule 10(1).`,
        evidence: { imageId: marketer.imageId, bbox: marketer.bbox, text: marketer.rawText },
        inputs: { marketerFound: true, marketerAddressFound: false },
        validatorVersion: VERSION,
        source: SOURCE_R6 + ", Rule 6(1)(a) Explanation II, Rule 10(1)",
      };
    }

    // D. Marketer address exists but marketer name is missing
    if (!marketer && marketerAddr) {
      return {
        ruleId: "R6.1a",
        status: "REVIEW",
        confidence: 0.5,
        reason: `An address-like declaration was detected ("${marketerAddr.rawText}") but no marketer or manufacturer name was found. Manual verification required.`,
        evidence: { imageId: marketerAddr.imageId, bbox: marketerAddr.bbox, text: marketerAddr.rawText },
        inputs: { marketerFound: false, addressFound: true },
        validatorVersion: VERSION,
        source: SOURCE_R6 + ", Rule 10(1)",
      };
    }

    // E. Marketer name + marketer address both exist
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: Math.min(0.85, marketer!.confidence ?? 0.8, marketerAddr!.confidence ?? 0.7),
      reason: `Brand-owner/marketer declaration detected ("${marketer!.rawText}", "${marketerAddr!.rawText}"). Under Rule 6(1)(a) Explanation II, the brand owner appearing as marketer may be treated as the deemed manufacturer. Manual verification is required to confirm deemed-manufacturer status.`,
      evidence: {
        imageId: marketer!.imageId,
        bbox: marketer!.bbox,
        text: `${marketer!.rawText}, ${marketerAddr!.rawText}`,
      },
      inputs: {
        marketerName: marketer!.normalizedValue,
        marketerAddress: marketerAddr!.normalizedValue,
        deemedManufacturerCandidate: true,
      },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 6(1)(a) Explanation II, Rule 10(1)",
    };
  };

  // If explicit manufacturer details are missing or incomplete, evaluate marketer evidence under Explanation II
  if (!name || !address) {
    const marketerOutcome = evaluateMarketer();
    if (marketerOutcome) return marketerOutcome;
  }

  if (!name && !address) {
    return missingOutcome("R6.1a", "manufacturerName", "Manufacturer/packer/importer details", visual, VERSION, SOURCE_R6 + ", Rule 10");
  }

  // Check for unresolved cross-image conflict in name
  if (name && !name.correctedValue && name.conflicts && name.conflicts.length > 0) {
    const conflicting = name.conflicts[0];
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting manufacturer/packer name declarations detected across package images: "${name.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: name.imageId,
        bbox: name.bbox,
        text: name.rawText,
        conflict: {
          field: name.field,
          primary: { imageId: name.imageId, text: name.rawText, bbox: name.bbox },
          conflicting: name.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primaryName: name.rawText, conflicts: name.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 10(1)",
    };
  }

  // Check for unresolved cross-image conflict in address
  if (address && !address.correctedValue && address.conflicts && address.conflicts.length > 0) {
    const conflicting = address.conflicts[0];
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting manufacturer/packer address declarations detected across package images: "${address.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: address.imageId,
        bbox: address.bbox,
        text: address.rawText,
        conflict: {
          field: address.field,
          primary: { imageId: address.imageId, text: address.rawText, bbox: address.bbox },
          conflicting: address.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primaryAddress: address.rawText, conflicts: address.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 10(1)",
    };
  }
  if (name && !address) {
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: 0.55,
      reason: `Manufacturer/packer name detected ("${name.rawText}") but no complete address found. Rule 10(1) requires name AND complete address (postal address with street/city/State or PIN code).`,
      evidence: { imageId: name.imageId, bbox: name.bbox, text: name.rawText },
      inputs: { nameFound: true, addressFound: false },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 10(1)",
    };
  }
  if (!name && address) {
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: 0.5,
      reason: "An address-like declaration was detected but no manufacturer/packer/importer name was found.",
      evidence: { imageId: address.imageId, bbox: address.bbox, text: address.rawText },
      inputs: { nameFound: false, addressFound: true },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 10(1)",
    };
  }

  // Rule 10(1) Explanation: complete address = street + city/State or PIN
  const addressText = address!.rawText ?? "";
  const hasPin = /\b\d{6}\b/.test(addressText);
  const hasCityState = /\b(state|dist|district)\b/i.test(addressText) || addressText.split(",").length >= 2;
  if (!hasPin && !hasCityState) {
    return {
      ruleId: "R6.1a",
      status: "REVIEW",
      confidence: 0.55,
      reason: "Manufacturer name and an address were detected, but the address may not meet Rule 10's 'complete address' requirement (street + city/State or PIN code).",
      evidence: { imageId: address!.imageId, bbox: address!.bbox, text: address!.rawText },
      inputs: { addressText, hasPin, hasCityState },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 10(1) Explanation",
    };
  }

  return {
    ruleId: "R6.1a",
    status: "PASS",
    confidence: Math.min(0.95, name!.confidence ?? 0.8, address!.confidence ?? 0.7),
    reason: "Manufacturer/packer details with a complete address (PIN or city/State present) were detected.",
    evidence: { imageId: name!.imageId, bbox: name!.bbox, text: name!.rawText },
    inputs: { name: name!.normalizedValue, addressFound: true, hasPin, hasCityState },
    validatorVersion: VERSION,
    source: SOURCE_R6 + ", Rule 10(1)",
  };
}

/** Rule 6(1)(b): generic name. */
export function validateGenericName(declarations: DeclarationEvidence[], visual: VisualEvidence): ValidationOutcome {
  const VERSION = "generic-name-v1";
  const found = declarations.find(d => d.field === "genericName");
  if (!found) return missingOutcome("R6.1b", "genericName", "Common/generic name of commodity", visual, VERSION, SOURCE_R6);

  if (!found.correctedValue && found.conflicts && found.conflicts.length > 0) {
    const conflicting = found.conflicts[0];
    return {
      ruleId: "R6.1b",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting generic name declarations detected across package images: "${found.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: found.imageId,
        bbox: found.bbox,
        text: found.rawText,
        conflict: {
          field: "genericName",
          primary: { imageId: found.imageId, text: found.rawText, bbox: found.bbox },
          conflicting: found.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primary: found.rawText, conflicts: found.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6,
    };
  }

  return {
    ruleId: "R6.1b",
    status: "PASS",
    confidence: Math.min(0.95, found.confidence ?? 0.8),
    reason: `Generic name of the commodity detected ("${found.rawText}").`,
    evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
    inputs: { value: found.normalizedValue },
    validatorVersion: VERSION,
    source: SOURCE_R6,
  };
}

/** Rule 6(1)(d): month/year of manufacture. */
export function validateManufactureDate(declarations: DeclarationEvidence[], visual: VisualEvidence): ValidationOutcome {
  const VERSION = "mfg-date-v1";
  const found = declarations.find(d => d.field === "manufactureDate" || d.field === "packingDate" || d.field === "importDate");
  if (!found) return missingOutcome("R6.1d", "manufactureDate", "Month and year of manufacture/pre-pack/import", visual, VERSION, SOURCE_R6);

  if (!found.correctedValue && found.conflicts && found.conflicts.length > 0) {
    const conflicting = found.conflicts[0];
    return {
      ruleId: "R6.1d",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting manufacture date declarations detected across package images: "${found.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: found.imageId,
        bbox: found.bbox,
        text: found.rawText,
        conflict: {
          field: found.field,
          primary: { imageId: found.imageId, text: found.rawText, bbox: found.bbox },
          conflicting: found.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primary: found.rawText, conflicts: found.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6,
    };
  }

  return {
    ruleId: "R6.1d",
    status: "PASS",
    confidence: Math.min(0.95, found.confidence ?? 0.8),
    reason: `Month and year of manufacture/pre-pack detected ("${found.rawText}", normalized ${found.correctedValue ?? found.normalizedValue}).`,
    evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
    inputs: { value: found.correctedValue ?? found.normalizedValue },
    validatorVersion: VERSION,
    source: SOURCE_R6,
  };
}

/** Rule 6(1)(e): retail sale price. Presence of a currency symbol alone is NOT sufficient. */
export function validateMrp(declarations: DeclarationEvidence[], visual: VisualEvidence): ValidationOutcome {
  const VERSION = "mrp-v1";
  const found = declarations.find(d => d.field === "mrp");

  if (!found) return missingOutcome("R6.1e", "mrp", "Retail sale price (MRP) declaration", visual, VERSION, SOURCE_R6);

  // Check for unresolved cross-image conflict
  if (!found.correctedValue && found.conflicts && found.conflicts.length > 0) {
    const conflicting = found.conflicts[0];
    const primaryStr = found.currency ? `${found.currency} ${found.normalizedValue}` : found.normalizedValue ?? found.rawText;
    const conflictStr = conflicting.currency ? `${conflicting.currency} ${conflicting.normalizedValue}` : conflicting.normalizedValue ?? conflicting.rawText;
    return {
      ruleId: "R6.1e",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting MRP declarations detected across package images: "${found.rawText}" (${primaryStr}) vs "${conflicting.rawText}" (${conflictStr}). Manual verification required.`,
      evidence: {
        imageId: found.imageId,
        bbox: found.bbox,
        text: found.rawText,
        conflict: {
          field: "mrp",
          primary: { imageId: found.imageId, text: found.rawText, value: primaryStr, bbox: found.bbox },
          conflicting: found.conflicts.map(c => ({
            imageId: c.imageId,
            text: c.rawText,
            value: c.currency ? `${c.currency} ${c.normalizedValue}` : c.normalizedValue ?? c.rawText,
            bbox: c.bbox,
          })),
        },
      },
      inputs: { primaryValue: found.normalizedValue, conflicts: found.conflicts.map(c => c.normalizedValue) },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 2(m)",
    };
  }

  const value = found.correctedValue ?? found.normalizedValue;
  const currency = found.currency;

  // Validation: must be a positive numeric amount with a recognized currency.
  // Rule 2(m) requires "MRP Rs. ... inclusive of all taxes" form (or the ₹ form).
  const numeric = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      ruleId: "R6.1e",
      status: "REVIEW",
      confidence: 0.5,
      reason: `MRP-like text detected ("${found.rawText}") but no valid positive price could be determined. A currency symbol alone is not a compliant declaration.`,
      evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
      inputs: { rawValue: value, currency },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 2(m)",
    };
  }
  if (!currency) {
    return {
      ruleId: "R6.1e",
      status: "REVIEW",
      confidence: 0.55,
      reason: `Price value ${numeric} detected, but the currency was not established. Rule 2(m) requires "MRP Rs. ... inclusive of all taxes" (or the equivalent ₹ form).`,
      evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
      inputs: { numeric, currency: null },
      validatorVersion: VERSION,
      source: SOURCE_R6 + ", Rule 2(m)",
    };
  }

  return {
    ruleId: "R6.1e",
    status: "PASS",
    confidence: Math.min(0.96, found.confidence ?? 0.85),
    reason: `Retail sale price declared as ${currency} ${numeric} (inclusive of all taxes per label text).`,
    evidence: { imageId: found.imageId, bbox: found.bbox, text: found.rawText },
    inputs: { value: numeric, currency },
    validatorVersion: VERSION,
    source: SOURCE_R6 + ", Rule 2(m)",
  };
}

/** Rule 6(2): consumer care contact — needs name, address, phone, and email IF available. */
export function validateConsumerCare(declarations: DeclarationEvidence[], visual: VisualEvidence): ValidationOutcome {
  const VERSION = "consumer-care-v1";
  const phone = declarations.find(d => d.field === "consumerCarePhone");
  const email = declarations.find(d => d.field === "consumerCareEmail");
  const address = declarations.find(d => d.field === "consumerCareAddress");

  const hasAny = phone || email || address;
  if (!hasAny) {
    return missingOutcome("R6.2", "consumerCare", "Consumer care contact details", visual, VERSION, SOURCE_R6 + "(2)");
  }

  if (phone && !phone.correctedValue && phone.conflicts && phone.conflicts.length > 0) {
    const conflicting = phone.conflicts[0];
    return {
      ruleId: "R6.2",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting consumer care phone declarations detected across package images: "${phone.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: phone.imageId,
        bbox: phone.bbox,
        text: phone.rawText,
        conflict: {
          field: "consumerCarePhone",
          primary: { imageId: phone.imageId, text: phone.rawText, bbox: phone.bbox },
          conflicting: phone.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primary: phone.rawText, conflicts: phone.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6 + "(2)",
    };
  }

  if (email && !email.correctedValue && email.conflicts && email.conflicts.length > 0) {
    const conflicting = email.conflicts[0];
    return {
      ruleId: "R6.2",
      status: "REVIEW",
      confidence: 0.5,
      reason: `Conflicting consumer care email declarations detected across package images: "${email.rawText}" vs "${conflicting.rawText}". Manual verification required.`,
      evidence: {
        imageId: email.imageId,
        bbox: email.bbox,
        text: email.rawText,
        conflict: {
          field: "consumerCareEmail",
          primary: { imageId: email.imageId, text: email.rawText, bbox: email.bbox },
          conflicting: email.conflicts.map(c => ({ imageId: c.imageId, text: c.rawText, bbox: c.bbox })),
        },
      },
      inputs: { primary: email.rawText, conflicts: email.conflicts.map(c => c.rawText) },
      validatorVersion: VERSION,
      source: SOURCE_R6 + "(2)",
    };
  }

  // Rule 6(2): name, address, telephone number, and email "if available".
  // Phone is mandatory (no "if available" qualifier); email is conditional.
  if (!phone) {
    return {
      ruleId: "R6.2",
      status: "REVIEW",
      confidence: 0.55,
      reason: email || address
        ? "Consumer-care email or address was detected, but no telephone number was found. Rule 6(2) requires name, address, telephone number, and email if available."
        : "Consumer-care details are incomplete.",
      evidence: { imageId: (email ?? address)!.imageId, bbox: (email ?? address)!.bbox, text: (email ?? address)!.rawText },
      inputs: { phoneFound: false, emailFound: !!email, addressFound: !!address },
      validatorVersion: VERSION,
      source: SOURCE_R6 + "(2)",
    };
  }

  const confs = [phone.confidence ?? 0.85];
  if (email) confs.push(email.confidence ?? 0.85);
  if (address) confs.push(address.confidence ?? 0.85);

  return {
    ruleId: "R6.2",
    status: "PASS",
    confidence: Math.min(0.95, ...confs),
    reason: `Consumer care contact detected: ${phone.correctedValue ?? phone.normalizedValue}${email ? ", " + (email.correctedValue ?? email.normalizedValue) : ""}. Rule 6(2) requires name, address, telephone number, and email if available.`,
    evidence: { imageId: phone.imageId, bbox: phone.bbox, text: phone.rawText },
    inputs: { phone: phone.normalizedValue, email: email?.normalizedValue ?? null, addressFound: !!address },
    validatorVersion: VERSION,
    source: SOURCE_R6 + "(2)",
  };
}

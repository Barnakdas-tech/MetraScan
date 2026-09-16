import type { FieldCandidate } from "./types.js";

export interface FieldCandidateWithImage extends FieldCandidate {
  imageId: string;
}

export interface DeclarationConflictCandidate {
  imageId: string;
  field: string;
  rawText: string;
  normalizedValue: string | null;
  unit?: string | null;
  currency?: string | null;
  confidence: number;
  ocrConfidence?: number | null;
  bbox: number[] | null;
  ocrRegionIds?: string[] | null;
}

export interface ResolvedFieldDeclaration {
  primary: FieldCandidateWithImage;
  conflicts: DeclarationConflictCandidate[];
}

/**
 * Normalizes text for company/entity names (manufacturer, packer, importer)
 * to avoid false conflicts on minor punctuation, spacing, and legal entity forms.
 */
function normalizeCompanyName(raw: string): { normalized: string; tokens: Set<string> } {
  let text = raw.toLowerCase().trim();
  // Strip leading label words like 'mfd by', 'manufactured by:', 'packed by:', etc.
  text = text.replace(/^(?:mfd\.?|manufactured|packed|pkd\.?|imported|marketed)\s*(?:by|for)?\s*:?/i, "").trim();
  // Normalize company entity suffixes
  text = text
    .replace(/\bprivate\s+limited\b/g, "pvt ltd")
    .replace(/\bpvt\.?\s*limited\b/g, "pvt ltd")
    .replace(/\bprivate\s+ltd\.?\b/g, "pvt ltd")
    .replace(/\bltd\.?\b/g, "ltd")
    .replace(/\bco\.?\b/g, "co")
    .replace(/\binc\.?\b/g, "inc")
    .replace(/\bllp\.?\b/g, "llp");
  // Remove non-alphanumeric characters except spaces
  const cleaned = text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const stopWords = new Set(["pvt", "ltd", "co", "by", "for", "and", "the", "of", "in"]);
  const tokens = new Set(cleaned.split(" ").filter(t => t.length > 1 && !stopWords.has(t)));
  return { normalized: cleaned, tokens };
}

/**
 * Normalizes address strings and extracts postal PIN codes.
 */
function normalizeAddress(raw: string): { pin: string | null; cleaned: string; tokens: Set<string> } {
  const pinMatch = raw.match(/\b([1-9][0-9]{5})\b/);
  const pin = pinMatch ? pinMatch[1] : null;
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const stopWords = new Set(["plot", "no", "near", "road", "street", "dist", "district", "state", "india"]);
  const tokens = new Set(cleaned.split(" ").filter(t => t.length > 1 && !stopWords.has(t)));
  return { pin, cleaned, tokens };
}

/**
 * Normalizes net quantity into standard metric base units for conflict comparison.
 * e.g. 500 g -> { baseVal: 500, baseUnit: "g" }, 0.5 kg -> { baseVal: 500, baseUnit: "g" }
 */
function normalizeQuantityToBase(valueStr: string | null | undefined, unitStr: string | null | undefined): { baseVal: number; baseUnit: string } | null {
  if (!valueStr) return null;
  const num = parseFloat(valueStr);
  if (isNaN(num) || num <= 0) return null;
  const unit = (unitStr ?? "").toLowerCase().trim();

  // Mass
  if (["g", "gm", "gram", "grams"].includes(unit)) return { baseVal: num, baseUnit: "g" };
  if (["kg", "kilogram", "kilograms"].includes(unit)) return { baseVal: num * 1000, baseUnit: "g" };
  if (["mg", "milligram", "milligrams"].includes(unit)) return { baseVal: num / 1000, baseUnit: "g" };

  // Volume
  if (["ml", "millilitre", "millilitres"].includes(unit)) return { baseVal: num, baseUnit: "ml" };
  if (["l", "litre", "litres", "ltr"].includes(unit)) return { baseVal: num * 1000, baseUnit: "ml" };

  // Length
  if (["cm", "centimetre"].includes(unit)) return { baseVal: num, baseUnit: "cm" };
  if (["m", "metre"].includes(unit)) return { baseVal: num * 100, baseUnit: "cm" };
  if (["mm", "millimetre"].includes(unit)) return { baseVal: num / 10, baseUnit: "cm" };

  // Count / Units
  if (["pcs", "pc", "nos", "no", "units", "unit", "pairs", "pair"].includes(unit)) return { baseVal: num, baseUnit: "pcs" };

  // Unknown unit: compare raw number and unit string
  return { baseVal: num, baseUnit: unit };
}

/**
 * Determines whether two candidates for the same field from different images
 * represent conflicting/contradictory declarations or harmless formatting variants.
 */
export function areCandidatesConflicting(c1: FieldCandidate, c2: FieldCandidate): boolean {
  if (c1.field !== c2.field) return false;

  const field = c1.field;

  // 1. MRP / Retail Sale Price
  if (field === "mrp") {
    const val1 = parseFloat(c1.normalizedValue ?? "");
    const val2 = parseFloat(c2.normalizedValue ?? "");
    if (!isNaN(val1) && !isNaN(val2)) {
      // Differ by more than 1 paisa (0.01) -> Conflict!
      if (Math.abs(val1 - val2) > 0.01) return true;
      // If currencies both exist and differ -> Conflict!
      if (c1.currency && c2.currency && c1.currency.toUpperCase() !== c2.currency.toUpperCase()) return true;
      return false;
    }
    // If one couldn't parse to a numeric price, compare normalized strings
    return (c1.normalizedValue ?? "").trim() !== (c2.normalizedValue ?? "").trim();
  }

  // 2. Net Quantity
  if (field === "netQuantity") {
    const q1 = normalizeQuantityToBase(c1.normalizedValue, c1.unit);
    const q2 = normalizeQuantityToBase(c2.normalizedValue, c2.unit);
    if (q1 && q2) {
      if (q1.baseUnit !== q2.baseUnit) return true; // e.g. 500 g vs 500 ml -> conflict
      if (Math.abs(q1.baseVal - q2.baseVal) > 0.001) return true; // e.g. 500 g vs 400 g -> conflict
      return false; // e.g. 500 g vs 0.5 kg -> match
    }
    // Fallback: compare value and unit strings
    const str1 = `${c1.normalizedValue ?? ""} ${c1.unit ?? ""}`.trim().toLowerCase();
    const str2 = `${c2.normalizedValue ?? ""} ${c2.unit ?? ""}`.trim().toLowerCase();
    return str1 !== str2;
  }

  // 3. Manufacturer / Packer / Importer Name
  if (["manufacturerName", "packerName", "importerName", "marketerName"].includes(field)) {
    const name1 = normalizeCompanyName(c1.normalizedValue || c1.rawText);
    const name2 = normalizeCompanyName(c2.normalizedValue || c2.rawText);
    if (name1.normalized === name2.normalized) return false;
    if (name1.tokens.size > 0 && name2.tokens.size > 0) {
      let common = 0;
      for (const t of name1.tokens) {
        if (name2.tokens.has(t)) common++;
      }
      const union = new Set([...name1.tokens, ...name2.tokens]).size;
      const sim = union > 0 ? common / union : 0;
      // If one token set is entirely contained in the other (e.g. "BEL Enterprises" in "BEL Enterprises Pvt Ltd")
      if (common === Math.min(name1.tokens.size, name2.tokens.size)) return false;
      // If similarity is high, not a conflict
      if (sim >= 0.6) return false;
      return true;
    }
    return name1.normalized !== name2.normalized;
  }

  // 4. Manufacturer / Packer / Importer Address
  if (["manufacturerAddress", "packerAddress", "importerAddress", "consumerCareAddress", "marketerAddress"].includes(field)) {
    const addr1 = normalizeAddress(c1.normalizedValue || c1.rawText);
    const addr2 = normalizeAddress(c2.normalizedValue || c2.rawText);
    // If both have 6-digit PIN codes and they are different -> Conflicting addresses!
    if (addr1.pin && addr2.pin && addr1.pin !== addr2.pin) return true;
    if (addr1.cleaned === addr2.cleaned) return false;
    if (addr1.tokens.size > 0 && addr2.tokens.size > 0) {
      let common = 0;
      for (const t of addr1.tokens) {
        if (addr2.tokens.has(t)) common++;
      }
      // If one address is a subset/extension of the other with same/no PIN
      if (common === Math.min(addr1.tokens.size, addr2.tokens.size)) return false;
      const union = new Set([...addr1.tokens, ...addr2.tokens]).size;
      const sim = union > 0 ? common / union : 0;
      if (sim >= 0.5) return false;
      return true;
    }
    return false;
  }

  // 5. Generic Name
  if (field === "genericName") {
    const clean1 = (c1.normalizedValue || c1.rawText).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const clean2 = (c2.normalizedValue || c2.rawText).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    if (clean1 === clean2) return false;
    const tokens1 = new Set(clean1.split(" ").filter(t => t.length > 1));
    const tokens2 = new Set(clean2.split(" ").filter(t => t.length > 1));
    let common = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) common++;
    }
    // If one contains the other (e.g. "Whey Protein" and "100% Whey Protein Isolate")
    if (common === Math.min(tokens1.size, tokens2.size) && common >= 2) return false;
    const union = new Set([...tokens1, ...tokens2]).size;
    const sim = union > 0 ? common / union : 0;
    if (sim >= 0.5) return false;
    return true;
  }

  // 6. Dates (Manufacture Date, Packing Date, Import Date, Use By, Best Before)
  if (["manufactureDate", "packingDate", "importDate", "useBy", "bestBefore"].includes(field)) {
    const d1 = (c1.normalizedValue ?? "").trim();
    const d2 = (c2.normalizedValue ?? "").trim();
    if (d1 === d2) return false;
    // YYYY-MM vs YYYY-MM-DD: if same year-month, harmless precision difference
    if (d1.length >= 7 && d2.length >= 7 && d1.slice(0, 7) === d2.slice(0, 7)) {
      return false;
    }
    return true;
  }

  // 7. Consumer Care Phone
  if (field === "consumerCarePhone") {
    const p1 = (c1.normalizedValue ?? c1.rawText).replace(/[^0-9]/g, "");
    const p2 = (c2.normalizedValue ?? c2.rawText).replace(/[^0-9]/g, "");
    if (p1 === p2) return false;
    // Compare last 10 digits for Indian standard numbers
    const last10_1 = p1.slice(-10);
    const last10_2 = p2.slice(-10);
    if (last10_1.length === 10 && last10_1 === last10_2) return false;
    return true;
  }

  // 8. Consumer Care Email
  if (field === "consumerCareEmail") {
    const e1 = (c1.normalizedValue ?? c1.rawText).toLowerCase().trim();
    const e2 = (c2.normalizedValue ?? c2.rawText).toLowerCase().trim();
    return e1 !== e2;
  }

  // 9. Batch Number
  if (field === "batchNumber") {
    const b1 = (c1.normalizedValue ?? c1.rawText).toUpperCase().replace(/[^A-Z0-9]/g, "");
    const b2 = (c2.normalizedValue ?? c2.rawText).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return b1 !== b2;
  }

  // 10. Country of Origin
  if (field === "countryOfOrigin") {
    const co1 = (c1.normalizedValue ?? c1.rawText).toLowerCase().replace(/^(?:country of origin|origin|made in|product of)\s*:?/i, "").replace(/[^a-z]/g, "");
    const co2 = (c2.normalizedValue ?? c2.rawText).toLowerCase().replace(/^(?:country of origin|origin|made in|product of)\s*:?/i, "").replace(/[^a-z]/g, "");
    return co1 !== co2;
  }

  // 11. Unit Sale Price
  if (field === "unitSalePrice") {
    const u1 = (c1.normalizedValue ?? "").trim();
    const u2 = (c2.normalizedValue ?? "").trim();
    return u1 !== u2;
  }

  // 12. Dimensions
  if (field === "dimensions") {
    const dim1 = (c1.normalizedValue ?? c1.rawText).toLowerCase().replace(/\s+/g, "");
    const dim2 = (c2.normalizedValue ?? c2.rawText).toLowerCase().replace(/\s+/g, "");
    return dim1 !== dim2;
  }

  // Generic fallback: compare normalized strings
  return (c1.normalizedValue ?? c1.rawText).trim().toLowerCase() !== (c2.normalizedValue ?? c2.rawText).trim().toLowerCase();
}

/**
 * Groups all candidate declarations across images by field, selects the primary
 * candidate (highest confidence, earlier image on tie), and identifies any conflicting
 * observations from different images.
 */
export function resolveFieldConflicts(
  candidates: FieldCandidateWithImage[]
): Map<string, ResolvedFieldDeclaration> {
  const byField = new Map<string, FieldCandidateWithImage[]>();

  for (const c of candidates) {
    const list = byField.get(c.field) ?? [];
    list.push(c);
    byField.set(c.field, list);
  }

  const resolved = new Map<string, ResolvedFieldDeclaration>();

  for (const [field, fieldCandidates] of byField.entries()) {
    if (fieldCandidates.length === 0) continue;

    // Sort by confidence descending, maintaining stable insertion order for ties
    const sorted = [...fieldCandidates].sort((a, b) => b.confidence - a.confidence);
    const primary = sorted[0];

    const conflicts: DeclarationConflictCandidate[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const cand = sorted[i];
      // Only compare candidates from different images
      if (cand.imageId !== primary.imageId) {
        if (areCandidatesConflicting(primary, cand)) {
          conflicts.push({
            imageId: cand.imageId,
            field: cand.field,
            rawText: cand.rawText,
            normalizedValue: cand.normalizedValue,
            unit: cand.unit,
            currency: cand.currency,
            confidence: cand.confidence,
            ocrConfidence: cand.ocrConfidence,
            bbox: cand.bbox,
            ocrRegionIds: cand.ocrRegionIds,
          });
        }
      }
    }

    resolved.set(field, { primary, conflicts });
  }

  return resolved;
}

import type { FieldCandidate, OcrTextWithEvidence } from "./types.js";

/**
 * Deterministic declaration extractors.
 *
 * A detection here means exactly "this text looks like field X" — it is an
 * AI/parse OBSERVATION with evidence, never a statement of legal compliance.
 */

interface Rule {
  field: string;
  // lowercased region text must match one of these patterns to be considered
  labelPattern: RegExp;
  // extracts the value part from the region text (post-label)
  valueRegex?: RegExp;
  method: string;
  normalize?: (value: string, fullText: string) => { value: string; unit?: string; currency?: string; confidence: number } | null;
}

// --- value normalizers (deterministic, no LLM) ---

function normalizeMoney(value: string): { value: string; currency: string } | null {
  // "Rs. 120", "₹120", "INR 99.50", "120/-"
  const cleaned = value.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/(?:rs\.?|₹|inr)?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:\/?-)?/i);
  if (!m) return null;
  const num = m[1].replace(/,/g, ".");
  return { value: num, currency: "INR" };
}

function normalizeQuantity(value: string, fullText: string): { value: string; unit: string } | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  // 250 g / 250g / 1.5 kg / 750 ml / 2 L / 10 pcs / 6 nos / 1 x 100 g
  const m = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*(x)?\s*([0-9]+(?:\.[0-9]+)?)?\s*(kg|g|gm|grams?|l|litre|litres?|ltr|ml|cm|mm|m|pcs?|nos?|units?|pairs?)?/i);
  if (!m || (!m[3] && !m[4])) return null;
  let num = m[1];
  const unit = (m[4] ?? "").toLowerCase();
  if (m[2] && m[3]) {
    // multipack: "2 x 100 g" → total 200 g
    num = String(parseFloat(m[1]) * parseFloat(m[3]));
  }
  // unit canonicalization
  const unitMap: Record<string, string> = {
    g: "g", gm: "g", gram: "g", grams: "g",
    kg: "kg",
    l: "L", litre: "L", litres: "L", ltr: "L",
    ml: "ml",
    cm: "cm", mm: "mm", m: "m",
    pcs: "pcs", pc: "pcs", nos: "pcs", no: "pcs",
    units: "pcs", unit: "pcs", pairs: "pairs", pair: "pairs",
  };
  const canon = unitMap[unit] ?? unit;
  if (!canon) return null;
  // Look for a nearby unit if the number had none but full text does (e.g., "Net Quantity 250 g" split across regions)
  if (!m[4] && !m[2]) {
    const unitNear = fullText.match(/\b(kg|g|gm|ml|l|litre)\b/i);
    if (unitNear) {
      return { value: num, unit: (unitMap[unitNear[1].toLowerCase()] ?? unitNear[1].toLowerCase()) };
    }
    return null;
  }
  return { value: num, unit: canon };
}

function normalizePhone(value: string): { value: string } | null {
  const digits = value.replace(/[^0-9+]/g, "");
  // Indian consumer-care: 10-digit (often prefixed 91 / 0)
  const tel = digits.replace(/^\+?91/, "").replace(/^0/, "");
  if (/^[6-9][0-9]{9}$/.test(tel)) return { value: "+91" + tel };
  if (digits.startsWith("1800") && digits.length >= 10) return { value: digits.replace(/[^0-9]/g, "") };
  if (tel.length >= 10) return { value: tel.slice(-10).length === 10 ? "+91" + tel.slice(-10) : digits };
  return null;
}

function normalizeEmail(value: string): { value: string } | null {
  const m = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? { value: m[0].toLowerCase() } : null;
}

function normalizeDate(value: string): { value: string } | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  // "SEP 2026", "09/2026", "12-09-2026", "2026-09", "12 SEP 26"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  let m = cleaned.match(/\b([a-z]{3})[a-z]*\s*(\d{4})\b/i);
  if (m && months[m[1].toLowerCase()]) return { value: `${m[2]}-${months[m[1].toLowerCase()]}` };
  m = cleaned.match(/\b(\d{1,2})[/ .-](\d{1,2}|[a-z]{3})[/ .-](\d{2,4})\b/i);
  if (m) {
    let dd = m[1].padStart(2, "0");
    let mm = months[m[2].toLowerCase()] ?? m[2].padStart(2, "0");
    const yy = m[3].length === 2 ? "20" + m[3] : m[3];
    if (parseInt(mm) > 12) [dd, mm] = [mm, dd];
    return { value: `${yy}-${mm}-${dd}` };
  }
  m = cleaned.match(/\b(\d{4})[/ .-](\d{1,2})\b/);
  if (m) return { value: `${m[1]}-${m[2].padStart(2, "0")}` };
  return null;
}

function normalizeDimensions(value: string): { value: string } | null {
  // "25 cm x 10 cm", "300x200 mm"
  const m = value.match(/(\d+(?:\.\d+)?)\s*(cm|mm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)/i);
  if (!m) return null;
  return { value: `${m[1]}${m[2]} x ${m[3]}${m[4]}` };
}

// --- field rules ---

const RULES: Rule[] = [
  {
    field: "mrp",
    labelPattern: /\b(mrp|max(imum)?[\s.]*(retail)?[\s.]*price|retail price)\b/i,
    method: "regex:money",
    normalize: (v, _full) => {
      // strip the label prefix before parsing money
      const moneyPart = v.replace(/.*?(mrp|retail\s+price|max(imum)?[\s.]*retail[\s.]*price)\s*[: -]?\s*/i, "");
      const n = normalizeMoney(moneyPart || v);
      return n ? { value: n.value, currency: n.currency, confidence: 0.95 } : null;
    },
  },
  {
    field: "unitSalePrice",
    labelPattern: /\b(price per (unit|kg|g|ml|l))\b|\b(unit price)\b/i,
    method: "regex:money",
    normalize: v => {
      const n = normalizeMoney(v);
      return n ? { value: n.value, currency: n.currency, confidence: 0.8 } : null;
    },
  },
  {
    field: "netQuantity",
    labelPattern: /\b(net[\s.]*(qty|quantity|wt|weight|content|vol(ume)?)|quantity|contains)\b/i,
    method: "regex:quantity",
    normalize: (v, full) => {
      const n = normalizeQuantity(v, full);
      return n ? { value: n.value, unit: n.unit, confidence: 0.9 } : null;
    },
  },
  {
    field: "manufacturerName",
    labelPattern: /\b(manufactured[\s.]*by|mfg[\s.]*by|mfr[\s.]*by|manufactured for)\b/i,
    method: "regex:entity-name",
    normalize: v => {
      const m = v.replace(/.*?(manufactured[\s.]*by|mfg\.?\s*by|mfr\.?\s*by|manufactured[\s.]*for)\s*:?\s*/i, "");
      const name = m.replace(/\s*\(.*\)\s*$/, "").replace(/[,;].*$/, "").trim();
      if (name.length >= 3 && name.length <= 120) return { value: name, confidence: 0.85 };
      return null;
    },
  },
  {
    field: "packerName",
    labelPattern: /\b(packed[\s.]*by|packaged[\s.]*by)\b/i,
    method: "regex:entity-name",
    normalize: v => {
      const m = v.replace(/.*?(packed|packaged)[\s.]*by\s*:?\s*/i, "");
      const name = m.replace(/[,;].*$/, "").trim();
      if (name.length >= 3) return { value: name, confidence: 0.85 };
      return null;
    },
  },
  {
    field: "importerName",
    labelPattern: /\b(imported[\s.]*by|importer)\b/i,
    method: "regex:entity-name",
    normalize: v => {
      const m = v.replace(/.*?(imported[\s.]*by|importer)\s*:?\s*/i, "");
      const name = m.replace(/[,;].*$/, "").trim();
      if (name.length >= 3) return { value: name, confidence: 0.8 };
      return null;
    },
  },
  {
    field: "countryOfOrigin",
    labelPattern: /\b(country[\s.]*of[\s.]*origin|origin|made[\s.]*in)\b/i,
    method: "regex:country",
    normalize: v => {
      const m = v.replace(/.*?(country[\s.]*of[\s.]*origin|origin|made[\s.]*in)\s*:?\s*/i, "");
      const country = m.replace(/[,;].*$/, "").trim();
      if (country.length >= 3 && country.length <= 40) return { value: country, confidence: 0.85 };
      return null;
    },
  },
  {
    field: "genericName",
    labelPattern: /\b(product|commodity|description)\s*:?\b/i,
    method: "regex:generic-name",
    normalize: v => {
      const m = v.replace(/.*?(product|commodity|description)\s*:?\s*/i, "");
      const name = m.trim();
      if (name.length >= 3 && name.length <= 100) return { value: name, confidence: 0.7 };
      return null;
    },
  },
  {
    field: "consumerCarePhone",
    labelPattern: /\b(consumer[\s.]*care|customer[\s.]*care|helpline|toll[\s.]*free|contact[\s.]*us)\b/i,
    method: "regex:phone",
    normalize: v => {
      const p = normalizePhone(v);
      return p ? { value: p.value, confidence: 0.9 } : null;
    },
  },
  {
    field: "consumerCareEmail",
    labelPattern: /\b(consumer[\s.]*care|customer[\s.]*care|contact)[\s.]*|@/i,
    method: "regex:email",
    normalize: v => {
      const e = normalizeEmail(v);
      return e ? { value: e.value, confidence: 0.95 } : null;
    },
  },
  {
    field: "consumerCareAddress",
    labelPattern: /\b(consumer[\s.]*care|customer[\s.]*care)[\s.]*address\b/i,
    method: "regex:address",
    normalize: v => {
      const m = v.replace(/.*?(consumer[\s.]*care|customer[\s.]*care)[\s.]*address\s*:?\s*/i, "");
      if (m.trim().length >= 8) return { value: m.trim(), confidence: 0.7 };
      return null;
    },
  },
  {
    field: "manufactureDate",
    labelPattern: /\b(mfg|manufactur(ed|ing)?|mfd|date[\s.]*of[\s.]*manufac)\b/i,
    method: "regex:date",
    normalize: v => {
      const d = normalizeDate(v);
      return d ? { value: d.value, confidence: 0.85 } : null;
    },
  },
  {
    field: "packingDate",
    labelPattern: /\b(pack(ed|ing)?[\s.]*date|pkt[\s.]*date|best[\s.]*before)\b/i,
    method: "regex:date",
    normalize: v => {
      const d = normalizeDate(v.replace(/best[\s.]*before/i, ""));
      return d ? { value: d.value, confidence: 0.8 } : null;
    },
  },
  {
    field: "importDate",
    labelPattern: /\b(import(ed)?[\s.]*date|doi)\b/i,
    method: "regex:date",
    normalize: v => {
      const d = normalizeDate(v);
      return d ? { value: d.value, confidence: 0.8 } : null;
    },
  },
  {
    field: "bestBefore",
    labelPattern: /\b(best[\s.]*before|bb)\b/i,
    method: "regex:date-or-duration",
    normalize: v => {
      const d = normalizeDate(v.replace(/best[\s.]*before/i, ""));
      if (d) return { value: d.value, confidence: 0.85 };
      const dur = v.match(/(\d+)\s*(day|month|year|week)s?/i);
      if (dur) return { value: `${dur[1]} ${dur[2].toLowerCase()}s`, confidence: 0.75 };
      return null;
    },
  },
  {
    field: "useBy",
    labelPattern: /\b(use[\s.]*by|expiry|exp)\b/i,
    method: "regex:date",
    normalize: v => {
      const d = normalizeDate(v.replace(/use[\s.]*by|exp(iry)?/i, ""));
      return d ? { value: d.value, confidence: 0.85 } : null;
    },
  },
  {
    field: "dimensions",
    labelPattern: /\b(dimensions?|size)\s*:?\b/i,
    method: "regex:dimensions",
    normalize: v => {
      const d = normalizeDimensions(v);
      return d ? { value: d.value, confidence: 0.8 } : null;
    },
  },
];

// Separate pass: email anywhere in text (emails are unambiguous)
function extractEmails(regions: OcrTextWithEvidence[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const r of regions) {
    const m = r.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (m) {
      out.push({
        field: "consumerCareEmail",
        rawText: r.text,
        normalizedValue: m[0].toLowerCase(),
        confidence: 0.95,
        detectionMethod: "regex:email-anywhere",
        bbox: (r.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
        ocrRegionIds: [r.id],
        ocrConfidence: r.confidence,
      });
    }
  }
  return out;
}

// Separate pass: phone numbers near consumer-care keywords OR standalone 10-digit/1800 patterns
function extractPhones(regions: OcrTextWithEvidence[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  for (const r of regions) {
    const isCare = /consumer|customer|helpline|toll|contact/i.test(r.text);
    const phoneM = r.text.match(/(?:\+91[\s-]?)?([6-9]\d{9})|\b(1800[\d\s-]{6,14})\b/);
    if (phoneM && (isCare || /^\s*(?:\+?91)?[\s-]?[6-9]\d{9}\s*$/.test(r.text))) {
      // Normalize the whole match's digits — handles 1800-266-1118 → 18002661118
      // (captures with internal separators), never concatenating the group twice.
      const digits = phoneM[0].replace(/[^0-9]/g, "");
      const tel = digits.length > 10 ? digits.slice(-10) : digits;
      out.push({
        field: "consumerCarePhone",
        rawText: r.text,
        normalizedValue: digits.startsWith("1800") ? digits : "+91" + tel,
        confidence: isCare ? 0.9 : 0.75,
        detectionMethod: "regex:phone",
        bbox: (r.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
        ocrRegionIds: [r.id],
        ocrConfidence: r.confidence,
      });
    }
  }
  return out;
}

/**
 * Extract declaration candidates from OCR regions. Deterministic only —
 * each candidate carries its source bbox and OCR region ids as evidence.
 */
export function extractDeclarations(regions: OcrTextWithEvidence[]): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  const fullText = regions.map(r => r.text).join(" ");

  for (const region of regions) {
    const text = region.text;
    for (const rule of RULES) {
      if (!rule.labelPattern.test(text)) continue;
      if (!rule.normalize) continue;
      const result = rule.normalize(text, fullText);
      if (!result) continue;
      candidates.push({
        field: rule.field,
        rawText: text,
        normalizedValue: result.value,
        unit: result.unit,
        currency: result.currency,
        confidence: Math.min(1, result.confidence * (0.7 + 0.3 * region.confidence)),
        detectionMethod: rule.method,
        bbox: (region.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
        ocrRegionIds: [region.id],
        ocrConfidence: region.confidence,
      });
    }
  }

  candidates.push(...extractEmails(regions));
  candidates.push(...extractPhones(regions));

  // Address heuristic: the region(s) following a name line that look like
  // postal addresses (plot/sector/pincode/road keywords) are that entity's address.
  const addressKeywords = /\b(plot|sector|road|street|pin ?code|\b\d{6}\b|industrial|estate|district|village|city|nagar|colony)\b/i;
  const nameFieldPattern = /\b(manufactured|packed|packaged|imported)[\s.]*by\b/i;
  for (let i = 0; i < regions.length; i++) {
    if (!nameFieldPattern.test(regions[i].text)) continue;
    const which = /packed|packaged/i.test(regions[i].text) ? "packer" : /imported/i.test(regions[i].text) ? "importer" : "manufacturer";
    const fieldKey = `${which}Address` as "manufacturerAddress" | "packerAddress" | "importerAddress";
    const collected: string[] = [];
    const collectedIds: string[] = [];
    const firstBbox = regions[i + 1]?.bbox;
    for (let j = i + 1; j < Math.min(i + 3, regions.length); j++) {
      const t = regions[j].text;
      if (nameFieldPattern.test(t) || /\b(mrp|net|price|date|qty|quantity)\b/i.test(t)) break;
      if (addressKeywords.test(t)) {
        collected.push(t);
        collectedIds.push(regions[j].id);
      }
    }
    if (collected.length > 0 && firstBbox) {
      const existing = candidates.find(c => c.field === fieldKey);
      if (!existing) {
        candidates.push({
          field: fieldKey,
          rawText: collected.join(", "),
          normalizedValue: collected.join(", "),
          confidence: 0.75,
          detectionMethod: "heuristic:address-neighbor",
          bbox: (firstBbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
          ocrRegionIds: collectedIds,
          ocrConfidence: regions[i].confidence,
        });
      }
    }
  }

  // Deduplicate per field: keep the highest-confidence candidate (and prefer
  // more specific methods, e.g. money over generic) for each field.
  const byField = new Map<string, FieldCandidate>();
  for (const c of candidates) {
    const existing = byField.get(c.field);
    if (!existing || c.confidence > existing.confidence) byField.set(c.field, c);
  }
  return Array.from(byField.values());
}

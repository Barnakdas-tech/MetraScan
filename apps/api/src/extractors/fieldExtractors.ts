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

const MARKETER_LABEL_PATTERN = /\b(?:marketed|mkt|mktg)\.?\s+by\b/i;
const STANDALONE_MARKETER_LABEL_PATTERN = /^\s*(?:marketed|mkt|mktg)\.?\s+by\s*[:.-]?\s*$/i;

// --- value normalizers (deterministic, no LLM) ---

export function normalizeMoney(value: string): { value: string; currency: string } | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  // Reject date patterns that happen to contain 4-digit years (e.g. MAY-2028, JUN-2026, 12/05/2026)
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s./-]+\d{2,4}\b/i.test(cleaned)) return null;
  if (/\b\d{1,2}[\s./-]+\d{1,2}[\s./-]+\d{2,4}\b/.test(cleaned)) return null;

  // "Rs. 120", "₹120", "INR 99.50", "120/-", "MRP ₹2199.00", "2199.00", "T398"
  const cleanedValue = cleaned.replace(/^[^0-9₹rRsSiInN]+/i, "");
  const m = cleanedValue.match(/(?:rs\.?|₹|inr)?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(?:\/?-)?/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/,/g, "."));
  if (isNaN(num) || num <= 0) return null;
  // Format integer amounts like 2199.00 without trailing .00
  const valStr = Number.isInteger(num) ? num.toString() : num.toFixed(2);
  return { value: valStr, currency: "INR" };
}

export function normalizeQuantity(value: string, fullText: string): { value: string; unit: string } | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  // Strip parenthetical non-metric secondary declarations like (1.1 lbs), (1.1lbs), (1.1 lb)
  const withoutParens = cleaned.replace(/\([^)]*(?:lbs?|oz|pounds?)[^)]*\)/gi, "").trim();

  // 250 g / 250g / 1.5 kg / 750 ml / 2 L / 10 pcs / 6 nos / 1 x 100 g / 500g e
  const m = withoutParens.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:x\s*([0-9]+(?:\.[0-9]+)?)\s*)?(kg|g|gm|grams?|l|litre|litres?|ltr|ml|cm|mm|m|pcs?|nos?|units?|pairs?)\b/i);
  if (!m || (!m[2] && !m[3])) {
    // If no unit directly attached, check for number followed by unit nearby or in fullText
    const numOnly = withoutParens.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);
    if (!numOnly) return null;
    const unitNear = fullText.match(/\b(kg|g|gm|ml|l|litre)\b/i);
    if (unitNear) {
      const unitMap: Record<string, string> = { g: "g", gm: "g", gram: "g", grams: "g", kg: "kg", l: "L", litre: "L", litres: "L", ltr: "L", ml: "ml" };
      return { value: numOnly[1], unit: unitMap[unitNear[1].toLowerCase()] ?? unitNear[1].toLowerCase() };
    }
    return null;
  }

  let num = m[1];
  const unit = (m[3] ?? "").toLowerCase();
  if (m[2]) {
    // multipack: "2 x 100 g" → total 200 g
    num = String(parseFloat(m[1]) * parseFloat(m[2]));
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
  return { value: num, unit: canon };
}

export function normalizePhone(value: string): { value: string } | null {
  const digits = value.replace(/[^0-9+]/g, "");
  // Indian consumer-care: 10-digit (often prefixed 91 / 0)
  const tel = digits.replace(/^\+?91/, "").replace(/^0/, "");
  if (/^[6-9][0-9]{9}$/.test(tel)) return { value: "+91" + tel };
  if (digits.startsWith("1800") && digits.length >= 10) return { value: digits.replace(/[^0-9]/g, "") };
  if (tel.length >= 10) {
    const last10 = tel.slice(-10);
    if (/^[6-9][0-9]{9}$/.test(last10)) return { value: "+91" + last10 };
    return { value: digits };
  }
  return null;
}

export function normalizeEmail(value: string): { value: string } | null {
  const m = value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return m ? { value: m[0].toLowerCase() } : null;
}

export function normalizeDate(value: string): { value: string } | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  // "SEP 2026", "JUN-2026", "MAY-2028", "09/2026", "12-09-2026", "2026-09", "12 SEP 26"
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  // Month-Year with hyphens, slashes, or whitespace (e.g. JUN-2026, MAY-2028, SEP 2026)
  let m = cleaned.match(/\b([a-z]{3})[a-z]*[\s./-]+(\d{4})\b/i);
  if (m && months[m[1].toLowerCase()]) return { value: `${m[2]}-${months[m[1].toLowerCase()]}` };

  // DD/MM/YYYY or DD-Month-YYYY
  m = cleaned.match(/\b(\d{1,2})[\s./-](\d{1,2}|[a-z]{3})[\s./-](\d{2,4})\b/i);
  if (m) {
    let dd = m[1].padStart(2, "0");
    let mm = months[m[2].toLowerCase()] ?? m[2].padStart(2, "0");
    const yy = m[3].length === 2 ? "20" + m[3] : m[3];
    if (parseInt(mm) > 12) [dd, mm] = [mm, dd];
    return { value: `${yy}-${mm}-${dd}` };
  }

  // YYYY-MM
  m = cleaned.match(/\b(\d{4})[\s./-](\d{1,2})\b/);
  if (m) return { value: `${m[1]}-${m[2].padStart(2, "0")}` };
  return null;
}

export function normalizeBatch(value: string): { value: string } | null {
  const cleaned = value
    .replace(/.*?(batch|lot)[\s.]*(no|number|code)?/i, "")
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/[^a-z0-9]+$/i, "")
    .trim();
  // Reject if it is another declaration label or obvious non-batch keyword
  if (/\b(mfg|exp|date|price|mrp|pkd|marketed|manufactured)\b/i.test(cleaned)) return null;
  if (cleaned.length >= 3 && cleaned.length <= 40 && /[a-z0-9]/i.test(cleaned)) {
    return { value: cleaned };
  }
  return null;
}

export function normalizeDimensions(value: string): { value: string } | null {
  // "25 cm x 10 cm", "300x200 mm"
  const m = value.match(/(\d+(?:\.\d+)?)\s*(cm|mm|m)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm|m)/i);
  if (!m) return null;
  return { value: `${m[1]}${m[2]} x ${m[3]}${m[4]}` };
}


const ENTITY_SUFFIX_PATTERN = /\b(?:pvt|private|ltd|limited|llp|inc|corp|corporation|holdings?|enterprises?|foods?|beverages?|industries|co|company)\b/i;

export function isLikelyEntityName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  if (isMarketingText(trimmed)) return false;
  if (/\b(?:mrp|rs\.?|₹|inr|net\s*qty|batch|exp|best\s*before|use\s*by|mfg|pkd|nutrition|nutritional|energy|protein|carbohydrate|fat|sugar|sodium|calories|serving|ingredients)\b/i.test(trimmed)) return false;
  if (/@|\+91\b|1800\d{6,}/.test(trimmed)) return false;
  if (/^\s*(?:plot|sector|flat|shop|p\.?o\.?\s*box|post\s*box|lane|road|street|building|phase)\b/i.test(trimmed)) return false;
  return true;
}
export function isMarketingText(text: string): boolean {
  const marketingPatterns = [
    /\b(maintains?|ensuring|mixability|purity|flavoring|packaging\s+are\s+owned|all\s+rights|unique\s+blend)\b/i,
    /\b(helps?\s+in|optimum|muscle\s+growth|rich\s+in|branched\s+chain|amino\s+acids?|can\s+be\s+used)\b/i,
    /\b(not\s+recommended\s+for|consult\s+your|physician|health\s+care|medical\s+condition|pregnant)\b/i,
    /\b(great\s+taste|recovery|endurance|under\s+the\s+control\s+of)\b/i,
  ];
  if (marketingPatterns.some(p => p.test(text))) return true;
  if (text.split(/\s+/).length > 8) return true;
  return false;
}

// --- field rules ---

const RULES: Rule[] = [
  {
    field: "mrp",
    labelPattern: /\b(mrp|max(imum)?[\s.]*(retail)?[\s.]*price|retail price)\b/i,
    method: "regex:money",
    normalize: (v, _full) => {
      const moneyPart = v.replace(/.*?(mrp|retail\s+price|max(imum)?[\s.]*retail[\s.]*price)\s*[: -]?\s*/i, "");
      const n = normalizeMoney(moneyPart || v);
      return n ? { value: n.value, currency: n.currency, confidence: 0.95 } : null;
    },
  },
  {
    field: "unitSalePrice",
    labelPattern: /\b(price per (unit|kg|g|ml|l))\b|\b(unit price|unit sale price)\b/i,
    method: "regex:money",
    normalize: v => {
      const n = normalizeMoney(v);
      return n ? { value: n.value, currency: n.currency, confidence: 0.8 } : null;
    },
  },
  {
    field: "netQuantity",
    labelPattern: /\b(ne[t1w][\s.]*(qty|quantity|wt?|weight|content|vol(ume)?)|quantity|contains|n[\s.]*w)\b/i,
    method: "regex:quantity",
    normalize: (v, full) => {
      const n = normalizeQuantity(v, full);
      return n ? { value: n.value, unit: n.unit, confidence: 0.95 } : null;
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
    field: "marketerName",
    labelPattern: MARKETER_LABEL_PATTERN,
    method: "regex:entity-name",
    normalize: v => {
      const m = v.replace(/.*?(?:marketed|mkt|mktg)\.?\s+by\s*[:.-]?\s*/i, "");
      const name = m.replace(/\s*\(.*\)\s*$/, "").replace(/[,;].*$/, "").trim();
      if (name.length >= 3 && name.length <= 120 && !isMarketingText(name)) {
        return { value: name, confidence: 0.85 };
      }
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
    labelPattern: /\b(name\s*of\s*(the\s*)?(commodity|product)|generic\s*name|commodity)\s*[: -]|^\s*product\s*[: -]/i,
    method: "regex:generic-name",
    normalize: v => {
      const m = v.replace(/.*?(name\s*of\s*(the\s*)?(commodity|product)|generic\s*name|commodity|product)\s*[: -]?\s*/i, "");
      const name = m.trim();
      if (isMarketingText(name)) return null;
      if (name.length >= 3 && name.length <= 80) return { value: name, confidence: 0.85 };
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
    labelPattern: /\b(pack(ed|ing)?[\s.]*date|pkt[\s.]*date)\b/i,
    method: "regex:date",
    normalize: v => {
      const d = normalizeDate(v);
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
    field: "batchNumber",
    labelPattern: /\b(batch[\s.]*(no|number|code)?|lot[\s.]*(no|number|code)?|b[\s.]*no)\b/i,
    method: "regex:batch",
    normalize: v => {
      const b = normalizeBatch(v);
      return b ? { value: b.value, confidence: 0.85 } : null;
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
  const fullTextLower = regions.map(r => r.text).join(" ").toLowerCase();
  const careContext = /consumer|customer|helpline|toll|contact|executive|feedback|complaint|care|query|queries|support|writeat/i;
  const hasGlobalCareContext = careContext.test(fullTextLower);

  for (const r of regions) {
    const isCare = careContext.test(r.text) || /executive|writeat/i.test(r.text);
    const phoneM = r.text.match(/(?:\+91[\s-]?)?([6-9]\d{9})|\b(1800[\d\s-]{6,14})\b/);
    if (phoneM && (isCare || hasGlobalCareContext || /^\s*(?:\+?91)?[\s-]?[6-9]\d{9}\s*$/.test(r.text))) {
      const digits = phoneM[0].replace(/[^0-9]/g, "");
      const tel = digits.length > 10 ? digits.slice(-10) : digits;
      const normalizedValue = digits.startsWith("1800") ? digits : "+91" + tel;
      out.push({
        field: "consumerCarePhone",
        rawText: r.text,
        normalizedValue,
        confidence: isCare ? 0.95 : 0.85,
        detectionMethod: "regex:phone",
        bbox: (r.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
        ocrRegionIds: [r.id],
        ocrConfidence: r.confidence,
      });
    }
  }
  return out;
}

// Semantic pass: recognized commodity generic descriptions (e.g. WHEY PROTEIN)
export function extractSemanticGenericNames(regions: OcrTextWithEvidence[]): FieldCandidate[] {
  const out: FieldCandidate[] = [];
  const genericPatterns = [
    /\b(whey\s+protein(\s+(isolate|hydrolysate|concentrate))?)\b/i,
    /\b(protein\s+powder|dietary\s+supplement|nutraceutical|food\s+supplement)\b/i,
    /\b(namkeen|tea\s+biscuits?|wheat\s+flour|refined\s+oil|mustard\s+oil)\b/i,
  ];
  for (const r of regions) {
    for (const pat of genericPatterns) {
      const m = r.text.match(pat);
      if (m) {
        out.push({
          field: "genericName",
          rawText: r.text,
          normalizedValue: m[1].toUpperCase(),
          confidence: 0.85,
          detectionMethod: "semantic:generic-name",
          bbox: (r.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
          ocrRegionIds: [r.id],
          ocrConfidence: r.confidence,
        });
        break;
      }
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

  // 1. Detect 2-column key-value tables (e.g. MRP, Expiry, Mfg Date, Batch No in parallel columns)
  const labelRules = RULES.filter(r => ["mrp", "unitSalePrice", "useBy", "manufactureDate", "batchNumber", "netQuantity"].includes(r.field));
  const matchedLabels: { region: OcrTextWithEvidence; rule: Rule; y: number; x: number }[] = [];
  for (const r of regions) {
    const rb = Array.isArray(r.bbox) ? (r.bbox as number[]) : null;
    if (!rb || typeof rb[0] !== "number" || typeof rb[1] !== "number") continue;
    for (const rule of labelRules) {
      if (rule.labelPattern.test(r.text)) {
        matchedLabels.push({ region: r, rule, y: rb[0], x: rb[1] });
        break;
      }
    }
  }

  // Cluster labels by column X
  const colClusters: { x: number; labels: typeof matchedLabels }[] = [];
  for (const l of matchedLabels) {
    let cl = colClusters.find(c => Math.abs(c.x - l.x) <= 35);
    if (!cl) {
      cl = { x: l.x, labels: [] };
      colClusters.push(cl);
    }
    cl.labels.push(l);
  }

  for (const cl of colClusters) {
    if (cl.labels.length < 2) continue;
    cl.labels.sort((a, b) => a.y - b.y);
    const minY = cl.labels[0].y - 35;
    const maxY = cl.labels[cl.labels.length - 1].y + 55;

    const rightCands = regions.filter(r => {
      const rb = Array.isArray(r.bbox) ? (r.bbox as number[]) : null;
      if (!rb || typeof rb[0] !== "number" || typeof rb[1] !== "number") return false;
      return rb[1] >= cl.x + 30 && rb[0] >= minY && rb[0] <= maxY;
    });

    const valClusters: { x: number; values: OcrTextWithEvidence[] }[] = [];
    for (const v of rightCands) {
      const rb = v.bbox as number[];
      let vc = valClusters.find(c => Math.abs(c.x - rb[1]) <= 35);
      if (!vc) {
        vc = { x: rb[1], values: [] };
        valClusters.push(vc);
      }
      vc.values.push(v);
    }

    valClusters.sort((a, b) => b.values.length - a.values.length);
    const bestValCol = valClusters[0];
    if (bestValCol && bestValCol.values.length >= 2) {
      bestValCol.values.sort((a, b) => (a.bbox as number[])[0] - (b.bbox as number[])[0]);
      cl.labels.forEach((l, idx) => {
        const v = bestValCol.values[idx];
        if (v && l.rule.normalize) {
          const combined = `${l.region.text} ${v.text}`;
          const res = l.rule.normalize(combined, fullText) ?? l.rule.normalize(v.text, fullText);
          if (res) {
            candidates.push({
              field: l.rule.field,
              rawText: combined,
              normalizedValue: res.value,
              unit: res.unit,
              currency: res.currency,
              confidence: Math.min(1, res.confidence * (0.7 + 0.3 * Math.min(l.region.confidence, v.confidence))),
              detectionMethod: `${l.rule.method}:table-column`,
              bbox: (v.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
              ocrRegionIds: [l.region.id, v.id],
              ocrConfidence: Math.min(l.region.confidence, v.confidence),
            });
          }
        }
      });
    }
  }

  // 2. Standard per-region rule extraction (and fallback horizontal right-alignment)
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const text = region.text;
    for (const rule of RULES) {
      if (!rule.labelPattern.test(text)) continue;
      if (!rule.normalize) continue;
      if (candidates.some(c => c.field === rule.field && c.detectionMethod?.includes("table-column"))) continue;

      let result = rule.normalize(text, fullText);
      let candBbox = (region.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null;
      let candRegionIds = [region.id];
      let candOcrConf = region.confidence;
      let pairedText = text;

      // Paired table/column extraction: if label had no value in same region
      const rBbox = Array.isArray(region.bbox) ? (region.bbox as number[]) : null;
      if (!result && rBbox && typeof rBbox[0] === "number" && typeof rBbox[1] === "number") {
        const [lx, ly] = rBbox;
        const candidateRegions: OcrTextWithEvidence[] = [];

        // Standalone marketer label: search candidates vertically below in the same column
        if (rule.field === "marketerName" || STANDALONE_MARKETER_LABEL_PATTERN.test(text)) {
          const belowCands = regions.filter(other => {
            if (other.id === region.id || !Array.isArray(other.bbox)) return false;
            const ob = other.bbox as number[];
            if (typeof ob[0] !== "number" || typeof ob[1] !== "number") return false;
            const [ox, oy] = ob;
            return Math.abs(ox - lx) <= 50 && oy > ly && (oy - ly) <= 150 && isLikelyEntityName(other.text);
          }).sort((a, b) => {
            const ab = a.bbox as number[];
            const bb = b.bbox as number[];
            const aHasSuffix = ENTITY_SUFFIX_PATTERN.test(a.text) ? 0 : 1;
            const bHasSuffix = ENTITY_SUFFIX_PATTERN.test(b.text) ? 0 : 1;
            if (aHasSuffix !== bHasSuffix) return aHasSuffix - bHasSuffix;
            return (ab[1] - ly) - (bb[1] - ly);
          });
          candidateRegions.push(...belowCands);
        }

        const yLabel = rBbox[0];
        const xLabel = rBbox[1];

        // Find regions horizontally aligned to the right (x >= xLabel + 15, |y - yLabel| <= 45)
        const rightCands = regions.filter(other => {
          if (other.id === region.id || !Array.isArray(other.bbox)) return false;
          const ob = other.bbox as number[];
          if (typeof ob[0] !== "number" || typeof ob[1] !== "number") return false;
          return Math.abs(ob[0] - yLabel) <= 45 && ob[1] >= xLabel + 15;
        }).sort((a, b) => {
          const ab = a.bbox as number[];
          const bb = b.bbox as number[];
          return Math.abs(ab[0] - yLabel) - Math.abs(bb[0] - yLabel);
        });

        // Also consider the immediately adjacent sequential region
        if (i + 1 < regions.length && !rightCands.some(c => c.id === regions[i + 1].id)) {
          rightCands.push(regions[i + 1]);
        }
        candidateRegions.push(...rightCands);

        for (const cand of candidateRegions) {
          const combined = text + " " + cand.text;
          const combinedRes = rule.normalize(combined, fullText) ?? rule.normalize(cand.text, fullText);
          if (combinedRes) {
            result = combinedRes;
            candBbox = (cand.bbox as number[])?.slice(0, 4) as [number, number, number, number] ?? candBbox;
            candRegionIds = [region.id, cand.id];
            candOcrConf = Math.min(region.confidence, cand.confidence);
            pairedText = `${text} ${cand.text}`.trim();
            break;
          }
        }
      }

      if (!result) continue;
      candidates.push({
        field: rule.field,
        rawText: pairedText,
        normalizedValue: result.value,
        unit: result.unit,
        currency: result.currency,
        confidence: Math.min(1, result.confidence * (0.7 + 0.3 * candOcrConf)),
        detectionMethod: candRegionIds.length > 1 ? `${rule.method}:paired` : rule.method,
        bbox: candBbox,
        ocrRegionIds: candRegionIds,
        ocrConfidence: candOcrConf,
      });
    }
  }

  candidates.push(...extractEmails(regions));
  candidates.push(...extractPhones(regions));

  // If no genericName was found via explicit label, scan for prominent generic product phrases
  if (!candidates.some(c => c.field === "genericName")) {
    candidates.push(...extractSemanticGenericNames(regions));
  }

  // Address heuristic: the region(s) following a name line that look like
  // postal addresses (plot/sector/pincode/road keywords) are that entity's address.
  const addressKeywords = /\b(plot|sector|road|street|pin ?code|\b[1-9]\d{5}\b|industrial|estate|district|village|city|nagar|colony|p\.?o\.?\s*box|post\s*box|box|enclave|phase|lane|floor|building|complex|bldg|opp|near|behind|delhi|mumbai|bengaluru|bangalore|kolkata|chennai|hyderabad|gurugram|gurgaon|noida|haryana)\b/i;
  const nameFieldPattern = /\b(manufactured|marketed|packed|packaged|imported)[\s.]*by\b/i;
  for (let i = 0; i < regions.length; i++) {
    if (!nameFieldPattern.test(regions[i].text)) continue;
    const which = /marketed/i.test(regions[i].text)
      ? "marketer"
      : /packed|packaged/i.test(regions[i].text)
      ? "packer"
      : /imported/i.test(regions[i].text)
      ? "importer"
      : "manufacturer";
    const fieldKey = `${which}Address` as "manufacturerAddress" | "packerAddress" | "importerAddress" | "marketerAddress";
    const compCandidate = candidates.find(c => c.field === `${which}Name`);
    const collected: string[] = [];
    const collectedIds: string[] = [];
    let firstBbox = regions[i + 1]?.bbox;
    for (let j = i + 1; j < Math.min(i + 5, regions.length); j++) {
      const t = regions[j].text;
      if (nameFieldPattern.test(t) || /\b(mrp|net|price|date|qty|quantity)\b/i.test(t)) break;
      // Skip lines that are purely consumer complaint / executive contact lines without address keywords
      if (/^\s*(executive|phone|email|toll|helpline|contact)\b/i.test(t) && !addressKeywords.test(t)) continue;
      // Do not collect entity/company name lines into the address
      if (compCandidate && (compCandidate.ocrRegionIds?.includes(regions[j].id) || compCandidate.normalizedValue === t.trim())) continue;
      if (ENTITY_SUFFIX_PATTERN.test(t)) continue;

      if (addressKeywords.test(t)) {
        // Strip trailing complaint / feedback trailers from address text
        const cleaned = t.replace(/[.,\s]*(for\s+complaints?|feedback|suggestions?|consumer\s*care|customer\s*care|in\s*case\s*of\s*complaints?).*$/i, "").trim();
        if (cleaned.length > 0) {
          collected.push(cleaned);
          collectedIds.push(regions[j].id);
        }
      }
    }

    // Spatial column fallback when adjacent sequential scan yields 0 lines
    // (e.g. multi-column OCR interleaving where address regions are separated in sequence index)
    if (collected.length === 0) {
      const anchorBbox = compCandidate?.bbox ?? (Array.isArray(regions[i].bbox) ? (regions[i].bbox as number[]) : null);
      if (anchorBbox && typeof anchorBbox[0] === "number" && typeof anchorBbox[1] === "number") {
        const [ax, ay] = anchorBbox;
        const columnAddrs = regions.filter(other => {
          if (other.id === regions[i].id || !Array.isArray(other.bbox)) return false;
          if (compCandidate?.ocrRegionIds?.includes(other.id)) return false;
          if (ENTITY_SUFFIX_PATTERN.test(other.text)) return false;
          const ob = other.bbox as number[];
          if (typeof ob[0] !== "number" || typeof ob[1] !== "number") return false;
          const [ox, oy] = ob;
          if (Math.abs(ox - ax) > 50) return false;
          if (oy <= ay) return false;
          if (nameFieldPattern.test(other.text)) return false;
          if (/\b(mrp|net|price|date|qty|quantity)\b/i.test(other.text)) return false;
          return addressKeywords.test(other.text);
        }).sort((a, b) => (a.bbox as number[])[1] - (b.bbox as number[])[1]);

        let lastY = ay;
        for (const r of columnAddrs) {
          const oy = (r.bbox as number[])[1];
          if (oy - lastY > 140) break;
          const cleaned = r.text.replace(/[.,\s]*(for\s+complaints?|feedback|suggestions?|consumer\s*care|customer\s*care|in\s*case\s*of\s*complaints?).*$/i, "").trim();
          if (cleaned.length > 0) {
            collected.push(cleaned);
            collectedIds.push(r.id);
            lastY = oy;
            if (!firstBbox) firstBbox = r.bbox;
          }
        }
      }
    }

    if (collected.length > 0 && (firstBbox || collectedIds.length > 0)) {
      const existing = candidates.find(c => c.field === fieldKey);
      if (!existing) {
        const fullAddr = collected.join(", ").replace(/[.,\s]*(for\s+complaints?|feedback|suggestions?|consumer\s*care|customer\s*care|in\s*case\s*of\s*complaints?).*$/i, "").trim();
        const addrBbox = regions.find(r => r.id === collectedIds[0])?.bbox ?? firstBbox;
        candidates.push({
          field: fieldKey,
          rawText: fullAddr,
          normalizedValue: fullAddr,
          confidence: 0.75,
          detectionMethod: "heuristic:address-neighbor",
          bbox: (addrBbox as number[])?.slice(0, 4) as [number, number, number, number] ?? null,
          ocrRegionIds: collectedIds,
          ocrConfidence: regions[i].confidence,
        });
      }
    }
  }

  // Date disambiguation: ensure manufactureDate <= useBy/bestBefore
  const mfg = candidates.find(c => c.field === "manufactureDate");
  const exp = candidates.find(c => c.field === "useBy" || c.field === "bestBefore");
  if (mfg && exp && mfg.normalizedValue && exp.normalizedValue && mfg.normalizedValue > exp.normalizedValue) {
    const tmpVal = mfg.normalizedValue;
    const tmpRaw = mfg.rawText;
    const tmpBbox = mfg.bbox;
    const tmpIds = mfg.ocrRegionIds;
    const tmpConf = mfg.confidence;
    const tmpOcr = mfg.ocrConfidence;

    mfg.normalizedValue = exp.normalizedValue;
    mfg.rawText = exp.rawText;
    mfg.bbox = exp.bbox;
    mfg.ocrRegionIds = exp.ocrRegionIds;
    mfg.confidence = exp.confidence;
    mfg.ocrConfidence = exp.ocrConfidence;

    exp.normalizedValue = tmpVal;
    exp.rawText = tmpRaw;
    exp.bbox = tmpBbox;
    exp.ocrRegionIds = tmpIds;
    exp.confidence = tmpConf;
    exp.ocrConfidence = tmpOcr;
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

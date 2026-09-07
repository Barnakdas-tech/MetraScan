/**
 * Product classification abstraction — keyword-based heuristic for Phase 4.
 * Confidence is honest: weak signals stay low; nothing is guessed high.
 */

export type ProductCategory =
  | "food" | "beverage" | "cosmetic" | "garment" | "household"
  | "electronic" | "chemical" | "industrial" | "other" | "unknown";

export interface ClassificationResult {
  category: ProductCategory;
  confidence: number;
  source: string;
  matchedKeywords: string[];
}

const CATEGORY_KEYWORDS: Record<Exclude<ProductCategory, "unknown" | "other">, string[]> = {
  food: [
    "biscuit", "bread", "cake", "rusk", "namkeen", "snack", "chips", "cereal",
    "atta", "flour", "rice", "pulse", "dal", "oil", "ghee", "butter", "cheese",
    "jam", "honey", "sauce", "ketchup", "pickle", "spice", "masala", "salt",
    "sugar", "tea", "coffee", "milk powder", "milk", "curd", "paneer", "biscuits",
    "noodle", "pasta", "soup", "chocolate", "candy", "sweet", "weaning", "baby food",
  ],
  beverage: [
    "juice", "drink", "beverage", "water", "soda", "cola", "lemonade",
    "aerated", "soft drink", "energy drink", "tonic", "sherbet", "syrup",
  ],
  cosmetic: [
    "cream", "lotion", "shampoo", "soap", "toothpaste", "powder", "lipstick",
    "perfume", "deodorant", "cosmetic", "hair oil", "face wash", "serum",
    "sunscreen", "moisturizer", "kajal", "kohl",
  ],
  garment: [
    "shirt", "t-shirt", "trouser", "jeans", "saree", "kurta", "garment",
    "apparel", "cloth", "sock", "underwear", "ready-made", "readymade", "dress",
  ],
  household: [
    "detergent", "cleaner", "dishwash", "mop", "broom", "brush", "napkin",
    "tissue", "foil", "wrap", "garbage", "bin", "incense", "agarbatti",
    "matchbox", "candle", "repellent", "freshener",
  ],
  electronic: [
    "cable", "wire", "charger", "battery", "lamp", "bulb", "led", "fan",
    "switch", "adapter", "headphone", "speaker", "remote", "electronic",
  ],
  chemical: [
    "paint", "varnish", "thinner", "acid", "solvent", "insecticide",
    "pesticide", "fertilizer", "cement", "adhesive", "resin", "chemical",
  ],
  industrial: [
    "industrial", "machinery", "bearing", "valve", "pipe", "tool", "hardware",
    "fastener", "screw", "bolt", "nut", "welding", "abrasive",
  ],
};

export function classifyProduct(texts: string[]): ClassificationResult {
  const combined = texts.join(" ").toLowerCase();
  const scores: Record<string, { score: number; matched: string[] }> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    const matched: string[] = [];
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        score += 1;
        matched.push(kw);
      }
    }
    if (score > 0) scores[category] = { score, matched };
  }

  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { category: "unknown", confidence: 0.2, source: "keyword-heuristic", matchedKeywords: [] };
  }
  entries.sort((a, b) => b[1].score - a[1].score);
  const [bestCategory, best] = entries[0];
  const second = entries[1]?.[1].score ?? 0;
  const total = entries.reduce((s, [, v]) => s + v.score, 0);

  // Confidence scales with signal strength and separation from runner-up.
  // Single weak keyword → low confidence (0.4-0.55). Multiple distinct hits → higher.
  const separation = best.score > 0 && second > 0 ? best.score / (best.score + second) : 1;
  const share = best.score / Math.max(total, 1);
  let confidence = 0.35 + Math.min(best.score, 4) * 0.12 + separation * 0.08 + share * 0.15;
  if (best.score === 1) confidence = Math.min(confidence, 0.55); // single hit never high
  confidence = Math.round(Math.min(0.9, Math.max(0.35, confidence)) * 100) / 100;

  return {
    category: bestCategory as ProductCategory,
    confidence,
    source: "keyword-heuristic",
    matchedKeywords: best.matched,
  };
}

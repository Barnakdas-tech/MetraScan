/**
 * Deterministic unit normalization + Rule 13 legality (source: Rules 2011, Rule 13, pp.12-13).
 * NO LLM involvement — pure table-driven logic.
 */

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gram: "g", grams: "g", gm: "g", gms: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  mg: "mg", milligram: "mg", milligrams: "mg",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", cc: "ml",
  l: "L", litre: "L", litres: "L", liter: "L", ltr: "L",
  cm: "cm", centimetre: "cm", centimetres: "cm",
  m: "m", metre: "m", metres: "m",
  sqm: "m2", "sq m": "m2", "square metre": "m2",
  pcs: "pcs", pc: "pcs", nos: "pcs", no: "pcs", pieces: "pcs", units: "pcs", u: "pcs", n: "pcs",
};

/** Normalize any common unit spelling to canonical form. Returns null for unknown units. */
export function normalizeUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const key = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[key] ?? null;
}

/** Rule 13(2)/(3): correct unit for the given quantity + unit family. */
export function correctUnitFor(quantity: number, unit: string): string | null {
  const u = normalizeUnit(unit);
  if (!u) return null;
  // Convert to base (g / ml / cm) for the threshold test, so inputs in ANY unit
  // (e.g., 1.5 L, 0.5 kg, 750 ml) resolve per Rule 13(2)/(3).
  const base = toBaseUnit(quantity, u);
  if (!base) return null;
  // Rule 13(2): below 1 kg → gram; below 1 L → ml; below 1 m → cm
  // Rule 13(3): ≥ 1 kg → kg (fractions as decimal or grams); ≥ 1 L → L; ≥ 1 m → m
  if (base.base === "g") return base.value >= 1000 ? "kg" : "g";
  if (base.base === "ml") return base.value >= 1000 ? "L" : "ml";
  if (base.base === "cm") return base.value >= 100 ? "m" : "cm";
  if (u === "pcs" || u === "m2") return u;
  return null;
}

/** Is this unit an SI unit permitted by Rule 13(5)? */
export function isPermittedUnit(unit: string): boolean {
  const u = normalizeUnit(unit);
  return u !== null && ["g", "kg", "mg", "ml", "L", "cm", "m", "m2", "pcs"].includes(u);
}

/** Units recognized as deliberately non-SI (known-unknown vs unknown). */
const KNOWN_NON_SI: Record<string, string> = {
  pounds: "lb", pound: "lb", lbs: "lb", lb: "lb",
  ounces: "oz", ounce: "oz", oz: "oz",
  gallons: "gal", gallon: "gal", gal: "gal",
  feet: "ft", foot: "ft", ft: "ft", inches: "in", inch: "in", in: "in",
};

export function isKnownNonSiUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const key = unit.trim().toLowerCase();
  return KNOWN_NON_SI[key] !== undefined;
}

/** Convert a quantity+unit to canonical base units (g / ml / cm / pcs). Returns null if unknown. */
export function toBaseUnit(quantity: number, unit: string): { value: number; base: string } | null {
  const u = normalizeUnit(unit);
  if (u === null) return null;
  switch (u) {
    case "mg": return { value: quantity / 1000, base: "g" };
    case "g": return { value: quantity, base: "g" };
    case "kg": return { value: quantity * 1000, base: "g" };
    case "ml": return { value: quantity, base: "ml" };
    case "L": return { value: quantity * 1000, base: "ml" };
    case "cm": return { value: quantity, base: "cm" };
    case "m": return { value: quantity * 100, base: "cm" };
    case "pcs": return { value: quantity, base: "pcs" };
    case "m2": return { value: quantity, base: "m2" };
    default: return null;
  }
}

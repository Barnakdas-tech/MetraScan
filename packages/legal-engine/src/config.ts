export const CONFIDENCE_THRESHOLD = 0.90;

export function getConfidenceThreshold(): number {
  if (typeof process !== "undefined" && process.env && process.env.CONFIDENCE_THRESHOLD) {
    const parsed = parseFloat(process.env.CONFIDENCE_THRESHOLD);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      return parsed;
    }
  }
  return CONFIDENCE_THRESHOLD;
}

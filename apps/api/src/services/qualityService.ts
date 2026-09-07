/**
 * ImageQualityService abstraction (foundation only — Phase 2).
 *
 * The real engine (later phase, backed by the AI service) will assess blur,
 * brightness, contrast, resolution, orientation, and text visibility. Here we
 * provide only an honest placeholder: basic resolution facts and
 * qualityStatus "PENDING" — never a fabricated AI score.
 */
export interface ImageQualityInput {
  width: number | null;
  height: number | null;
  sizeBytes: number;
}

export interface ImageQualityReport {
  qualityStatus: "PENDING";
  qualityScore: null;
  facts: {
    width: number | null;
    height: number | null;
    megapixels: number | null;
    sizeBytes: number;
  };
  checkedAt: string;
  note: string;
}

export class ImageQualityService {
  async assess(input: ImageQualityInput): Promise<ImageQualityReport> {
    const mp = input.width && input.height ? Number(((input.width * input.height) / 1_000_000).toFixed(2)) : null;
    return {
      qualityStatus: "PENDING",
      qualityScore: null,
      facts: { width: input.width, height: input.height, megapixels: mp, sizeBytes: input.sizeBytes },
      checkedAt: new Date().toISOString(),
      note: "Full quality analysis (blur, brightness, contrast, text visibility) runs in a later phase. No score is assigned yet.",
    };
  }
}

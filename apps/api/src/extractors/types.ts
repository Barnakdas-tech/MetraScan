import type { Prisma } from "../db/prismaTypes.js";

/** A single detected declaration candidate with full evidence trace. */
export interface FieldCandidate {
  field: string;
  rawText: string;
  normalizedValue: string;
  unit?: string;
  currency?: string;
  confidence: number; // extraction confidence (not legal compliance)
  detectionMethod: string;
  bbox: [number, number, number, number] | null;
  ocrRegionIds: string[];
  ocrConfidence: number;
}

export interface OcrTextWithEvidence {
  id: string; // OcrRegion id
  text: string;
  confidence: number;
  bbox: number[] | Prisma.JsonValue;
  imageId: string;
}

export type Json = Prisma.JsonValue;

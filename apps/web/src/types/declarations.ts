export interface Declaration {
  id: string;
  field: string;
  rawText: string;
  normalizedValue: string | null;
  correctedValue: string | null;
  correctionNote: string | null;
  unit?: string | null;
  currency?: string | null;
  confidence: number | null;
  ocrConfidence: number | null;
  detectionMethod: string | null;
  bbox: number[] | null;
  ocrRegionIds: string[] | null;
  imageId: string | null;
  image?: { id: string; originalFilename: string; sequence: number } | null;
}

export interface DeclarationsResponse {
  inspectionId: string;
  classification: { category: string | null; confidence: number | null; source: string | null } | null;
  declarations: Declaration[];
}

export interface ExtractionResult {
  inspectionId: string;
  declarationCount: number;
  classification: { category: string; confidence: number; source: string; matchedKeywords?: string[] };
  declarations: Declaration[];
  note: string;
}

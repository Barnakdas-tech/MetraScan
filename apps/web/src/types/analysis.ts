export interface OcrRegion {
  id: string;
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
  poly: [number, number][] | null;
}

export interface OcrInfo {
  provider: string;
  language: string;
  success: boolean;
  error: string | null;
  fullText: string;
  regionCount: number;
  processingMs: number;
  regions: OcrRegion[];
}

export interface AnalyzedImage {
  id: string;
  sequence: number;
  originalFilename: string;
  width: number | null;
  height: number | null;
  qualityScore: number | null;
  qualityStatus: string | null;
  ocrStatus: string | null;
  ocr: OcrInfo | null;
}

export interface AnalysisResult {
  inspectionId: string;
  inspectionStatus: string;
  images: AnalyzedImage[];
}

export interface AnalyzeSummary {
  inspectionId: string;
  aiServiceUp: boolean;
  summary: { images: number; processed: number; failed: number; partial: boolean };
  results: { imageId: string; status: string; error?: string; regionCount?: number; provider?: string }[];
  note: string;
}

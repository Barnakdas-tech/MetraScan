import axios from "axios";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Typed client for the Python AI service. React never talks to FastAPI
 * directly — the Node API is the only consumer.
 */
const client = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: env.AI_TIMEOUT_MS,
});

export interface QualityResponse {
  quality: {
    overallScore: number;
    status: "PASS" | "WARNING" | "FAIL";
    blurScore: number;
    brightnessScore: number;
    contrastScore: number;
    resolution: { width: number; height: number; megapixels: number };
    orientation: number;
    signals: Record<string, string>;
  };
  processing_ms: number;
}

export interface OcrRegionItem {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
  poly?: [number, number][];
}

export interface OcrResponse {
  provider: string;
  language: string;
  quality: QualityResponse["quality"];
  preprocessing: string[];
  regions: OcrRegionItem[];
  processing_ms: number;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await client.get("/health", { timeout: 3000 });
    return res.data?.status === "ok";
  } catch {
    return false;
  }
}

export async function analyzeQuality(imageBuffer: Buffer, mimeType: string): Promise<QualityResponse> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), "image");
    const res = await client.post<{ success: boolean; data: QualityResponse }>("/api/quality", form);
    return res.data.data;
  } catch (err) {
    throw toApiError(err, "Quality analysis failed at the AI service");
  }
}

export async function runOcr(imageBuffer: Buffer, mimeType: string): Promise<OcrResponse> {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(imageBuffer)], { type: mimeType }), "image");
    const res = await client.post<{ success: boolean; data: OcrResponse }>("/api/ocr", form);
    return res.data.data;
  } catch (err) {
    throw toApiError(err, "OCR failed at the AI service");
  }
}

function toApiError(err: unknown, fallback: string): ApiError {
  const e = err as import("axios").AxiosError<{ error?: { message?: string } }> & { code?: string };
  if (axios.isAxiosError(err)) {
    if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") {
      throw new ApiError(503, "AI_SERVICE_UNAVAILABLE", "The AI service is unreachable. Start it with: cd apps/ai && ./run.sh");
    }
    if (e.code === "ECONNABORTED" || e.code === "ETIMEDOUT") {
      throw new ApiError(504, "AI_SERVICE_TIMEOUT", "The AI service timed out while processing this image");
    }
    const status = e.response?.status;
    const message = e.response?.data?.error?.message;
    if (status === 400) throw new ApiError(400, "AI_INVALID_IMAGE", message ?? "The AI service could not read this image");
    if (status === 502) throw new ApiError(502, "OCR_FAILED", message ?? fallback);
    if (status === 503) throw new ApiError(503, "OCR_PROVIDER_UNAVAILABLE", message ?? "No OCR provider is available");
    throw new ApiError(502, "AI_SERVICE_ERROR", message ?? fallback);
  }
  throw new ApiError(502, "AI_SERVICE_ERROR", fallback);
}

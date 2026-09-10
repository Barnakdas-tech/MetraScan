import { prisma } from "../db/prisma.js";
import { storage } from "./storageService.js";
import { analyzeQuality, runOcr, checkHealth } from "./aiServiceClient.js";
import { canAccessInspection } from "./inspectionService.js";
import { ApiError } from "../utils/apiError.js";
import type { OcrRegionItem } from "./aiServiceClient.js";

/**
 * Phase 3 pipeline: quality -> preprocessing -> OCR -> persistence.
 * NO legal validation happens here — OCR output is an observation only.
 */
export async function analyzeInspection(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");
  if (!access.canEdit) throw ApiError.forbidden("Only the owning inspector or an admin can run analysis");

  const images = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    orderBy: { sequence: "asc" },
  });
  if (images.length === 0) throw ApiError.badRequest("Upload at least one image before running analysis");

  // Mark the inspection PROCESSING up-front so state is honest on partial failure
  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: "PROCESSING" } });

  const aiUp = await checkHealth();
  const results: Array<{
    imageId: string;
    status: "PROCESSED" | "SKIPPED" | "FAILED";
    error?: string;
    regionCount?: number;
    provider?: string;
  }> = [];

  for (const image of images) {
    try {
      const buffer = await storage.read(image.storageKey);

      // 1. Quality
      const quality = await analyzeQuality(buffer, image.mimeType);
      await prisma.inspectionImage.update({
        where: { id: image.id },
        data: {
          qualityScore: quality.quality.overallScore,
          analysisStatus: quality.quality.status, // PASS/WARNING/FAIL — a PHOTOGRAPHY signal, never legal compliance
        },
      });

      // 2. OCR (runs its own quality + preprocessing internally; we reuse the report)
      const ocr = await runOcr(buffer, image.mimeType);

      // 3. Persist: result header + regions. Previous runs are kept — OCR
      // history is evidence; re-analysis appends rather than deleting.
      const result = await prisma.ocrResult.create({
        data: {
          imageId: image.id,
          provider: ocr.provider,
          language: ocr.language,
          qualityReport: (quality.quality as unknown as never) ?? ({} as never),
          preprocessing: (ocr.preprocessing as unknown as never) ?? ([] as never),
          fullText: ocr.regions.map(r => r.text).join("\n"),
          regionCount: ocr.regions.length,
          processingMs: ocr.processing_ms,
          success: true,
        },
      });

      if (ocr.regions.length > 0) {
        await prisma.ocrRegion.createMany({
          data: ocr.regions.map((r: OcrRegionItem, i) => ({
            resultId: result.id,
            text: r.text,
            confidence: r.confidence,
            bbox: r.bbox as unknown as never,
            poly: r.poly ? (r.poly as unknown as never) : undefined,
            seq: i + 1,
          })),
        });
      }

      await prisma.inspectionImage.update({
        where: { id: image.id },
        data: { ocrStatus: "COMPLETED" },
      });

      results.push({ imageId: image.id, status: "PROCESSED", regionCount: ocr.regions.length, provider: ocr.provider });
    } catch (err) {
      // Partial processing: record the failure, keep going with remaining images
      await prisma.inspectionImage.update({
        where: { id: image.id },
        data: { ocrStatus: "FAILED", analysisStatus: "FAILED" },
      });
      await prisma.ocrResult.create({
        data: {
          imageId: image.id,
          provider: "none",
          language: "en",
          qualityReport: {} as never,
          preprocessing: [] as never,
          fullText: "",
          regionCount: 0,
          processingMs: 0,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      results.push({ imageId: image.id, status: "FAILED", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const anyProcessed = results.some(r => r.status === "PROCESSED");
  const anyFailed = results.some(r => r.status === "FAILED");
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: anyProcessed ? "COMPLETED" : "PROCESSING" },
  });

  return {
    inspectionId,
    aiServiceUp: aiUp,
    summary: {
      images: images.length,
      processed: results.filter(r => r.status === "PROCESSED").length,
      failed: results.filter(r => r.status === "FAILED").length,
      partial: anyProcessed && anyFailed,
    },
    results,
    note: "AI observations only — no legal compliance determination is made in this phase.",
  };
}

export async function getAnalysis(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  const images = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    orderBy: { sequence: "asc" },
    include: {
      ocrResults: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { regions: { orderBy: { seq: "asc" } } },
      },
    },
  });

  return {
    inspectionId,
    inspectionStatus: inspection.status,
    images: images.map(img => ({
      id: img.id,
      sequence: img.sequence,
      originalFilename: img.originalFilename,
      width: img.width,
      height: img.height,
      qualityScore: img.qualityScore,
      qualityStatus: img.analysisStatus,
      ocrStatus: img.ocrStatus,
      ocr: img.ocrResults[0]
        ? {
            provider: img.ocrResults[0].provider,
            language: img.ocrResults[0].language,
            success: img.ocrResults[0].success,
            error: img.ocrResults[0].error,
            fullText: img.ocrResults[0].fullText,
            regionCount: img.ocrResults[0].regionCount,
            processingMs: img.ocrResults[0].processingMs,
            regions: img.ocrResults[0].regions.map(r => ({
              id: r.id,
              text: r.text,
              confidence: r.confidence,
              bbox: r.bbox,
              poly: r.poly ?? null,
            })),
          }
        : null,
    })),
  };
}

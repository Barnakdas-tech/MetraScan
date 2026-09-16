import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessInspection } from "./inspectionService.js";
import { extractDeclarations } from "../extractors/fieldExtractors.js";
import { resolveFieldConflicts } from "../extractors/conflictDetector.js";
import { classifyProduct } from "../extractors/productClassifier.js";
import { audit } from "./auditService.js";
import type { FieldCandidate } from "../extractors/types.js";

/**
 * Phase 4: convert persisted OCR regions into structured declarations with
 * evidence, plus product classification. NO legal compliance decisions here.
 */
export async function extractAndStoreDeclarations(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");
  if (!access.canEdit) throw ApiError.forbidden("Only the owning inspector or an admin can run extraction");

  const images = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    orderBy: { sequence: "asc" },
    include: { ocrResults: { include: { regions: { orderBy: { seq: "asc" } } }, take: 1 } },
  });
  const withOcr = images.filter(i => i.ocrResults.length > 0);
  if (withOcr.length === 0) {
    throw ApiError.badRequest("Run OCR analysis first — extraction needs OCR regions to work from");
  }

  // Collect regions per image so each candidate carries its true imageId.
  const allCandidates: (FieldCandidate & { imageId: string })[] = [];
  const allTexts: string[] = [];
  for (const image of withOcr) {
    const result = image.ocrResults[0];
    const regions = result.regions.map(r => ({
      id: r.id,
      text: r.text,
      confidence: r.confidence,
      bbox: r.bbox as number[],
      imageId: image.id,
    }));
    for (const r of regions) allTexts.push(r.text);
    const candidates = extractDeclarations(regions);
    for (const c of candidates) allCandidates.push({ ...c, imageId: image.id });
  }

  // Resolve candidates across images per field: select highest-confidence primary
  // while preserving any conflicting observations from other images.
  const resolved = resolveFieldConflicts(allCandidates);

  // Preserve human corrections across re-extraction: upsert by (inspectionId, field).
  // The AI re-detection updates raw evidence; correctedValue/correctionNote/
  // correctedById survive untouched on the existing row.
  const created = await Promise.all(
    Array.from(resolved.values()).map(({ primary: c, conflicts }) =>
      prisma.declaration.upsert({
        where: { inspectionId_field: { inspectionId, field: c.field } },
        create: {
          inspectionId,
          imageId: c.imageId,
          field: c.field,
          rawText: c.rawText,
          normalizedValue: c.normalizedValue,
          unit: c.unit,
          currency: c.currency,
          ocrConfidence: c.ocrConfidence,
          extractionConfidence: c.confidence,
          detectionMethod: c.detectionMethod,
          bbox: c.bbox as never,
          ocrRegionIds: c.ocrRegionIds as never,
          conflicts: conflicts.length > 0 ? (conflicts as never) : undefined,
        },
        update: {
          imageId: c.imageId,
          rawText: c.rawText,
          normalizedValue: c.normalizedValue,
          unit: c.unit,
          currency: c.currency,
          ocrConfidence: c.ocrConfidence,
          extractionConfidence: c.confidence,
          detectionMethod: c.detectionMethod,
          bbox: c.bbox as never,
          ocrRegionIds: c.ocrRegionIds as never,
          conflicts: conflicts.length > 0 ? (conflicts as never) : undefined,
          // correctedValue / correctionNote / correctedById intentionally preserved
        },
      })
    )
  );

  // Product classification from all OCR text (+ product name if set)
  const product = inspection.productId ? await prisma.product.findUnique({ where: { id: inspection.productId } }) : null;
  const classTexts = [...allTexts];
  if (product?.name) classTexts.push(product.name);
  if (product?.category) classTexts.push(product.category);
  const classification = classifyProduct(classTexts);

  // Update product with classification (never overwrite a human-set category silently —
  // only fill if empty or previously heuristic)
  if (product && (product.categorySource === null || product.categorySource === "keyword-heuristic")) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        category: classification.category,
        categoryConfidence: classification.confidence,
        categorySource: classification.source,
      },
    });
  }

  return {
    inspectionId,
    declarationCount: created.length,
    classification,
    declarations: created.map(d => ({
      id: d.id,
      field: d.field,
      rawText: d.rawText,
      normalizedValue: d.normalizedValue,
      correctedValue: d.correctedValue,
      correctionNote: d.correctionNote,
      unit: d.unit,
      currency: d.currency,
      confidence: d.extractionConfidence,
      ocrConfidence: d.ocrConfidence,
      detectionMethod: d.detectionMethod,
      bbox: d.bbox,
      ocrRegionIds: d.ocrRegionIds,
      conflicts: d.conflicts as never,
      imageId: d.imageId,
    })),
    note: "Field detection is an AI observation with evidence — it is NOT a legal compliance determination.",
  };
}

export async function listDeclarations(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  const rows = await prisma.declaration.findMany({
    where: { inspectionId },
    orderBy: [{ field: "asc" }],
    include: { image: { select: { id: true, originalFilename: true, sequence: true } } },
  });
  const product = inspection.productId ? await prisma.product.findUnique({ where: { id: inspection.productId } }) : null;

  return {
    inspectionId,
    classification: product
      ? { category: product.category, confidence: product.categoryConfidence, source: product.categorySource }
      : null,
    declarations: rows.map(d => ({
      id: d.id,
      field: d.field,
      rawText: d.rawText,
      normalizedValue: d.normalizedValue,
      correctedValue: d.correctedValue,
      correctionNote: d.correctionNote,
      correctedById: d.correctedById,
      unit: d.unit,
      currency: d.currency,
      confidence: d.extractionConfidence,
      ocrConfidence: d.ocrConfidence,
      detectionMethod: d.detectionMethod,
      bbox: d.bbox,
      ocrRegionIds: d.ocrRegionIds,
      conflicts: d.conflicts as never,
      imageId: d.imageId,
      image: d.image,
    })),
  };
}

export async function updateDeclaration(
  inspectionId: string,
  declarationId: string,
  user: { sub: string; role: string },
  input: { correctedValue?: string | null; correctionNote?: string | null }
) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  const canEditDeclaration =
    user.role === "ADMIN" ||
    user.role === "REVIEWER" ||
    (user.role === "INSPECTOR" && inspection.inspectorId === user.sub);

  if (!canEditDeclaration) {
    if (user.role === "VIEWER") {
      throw ApiError.forbidden("VIEWER role cannot modify declarations");
    }
    if (user.role === "INSPECTOR") {
      throw ApiError.forbidden("Inspectors can only correct declarations on their own inspections");
    }
    throw ApiError.forbidden("Not authorized to modify declarations");
  }


  const existing = await prisma.declaration.findFirst({ where: { id: declarationId, inspectionId } });
  if (!existing) throw ApiError.notFound("Declaration not found");

  // Human correction: stored alongside the AI value; rawText/normalizedValue/evidence untouched.
  const updated = await prisma.declaration.update({
    where: { id: declarationId },
    data: {
      correctedValue: input.correctedValue ?? null,
      correctionNote: input.correctionNote ?? null,
      correctedById: user.sub,
    },
  });

  await audit(
    { id: user.sub, role: user.role as never },
    "DECLARATION_CORRECTED",
    "Declaration",
    declarationId,
    { inspectionId, field: existing.field, from: existing.normalizedValue, to: input.correctedValue ?? null }
  );

  return {
    id: updated.id,
    field: updated.field,
    rawText: updated.rawText,
    normalizedValue: updated.normalizedValue,
    correctedValue: updated.correctedValue,
    correctionNote: updated.correctionNote,
    unit: updated.unit,
    currency: updated.currency,
    confidence: updated.extractionConfidence,
    detectionMethod: updated.detectionMethod,
    bbox: updated.bbox,
    ocrRegionIds: updated.ocrRegionIds,
    conflicts: updated.conflicts as never,
    imageId: updated.imageId,
  };
}

import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessInspection } from "./inspectionService.js";
import { evaluateCompliance } from "@metrascan/legal-engine";
import type { ApplicabilityInput, DeclarationEvidence, VisualEvidence } from "@metrascan/legal-engine";

/** Runs the deterministic compliance engine over the inspection's real evidence. */
export async function runCompliance(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { product: true },
  });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");
  if (!access.canEdit) throw ApiError.forbidden("Only the owning inspector or an admin can run compliance");

  const declarations = await prisma.declaration.findMany({ where: { inspectionId } });
  const images = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    include: { ocrResults: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  // Visual evidence summary — did OCR run, and was quality sufficient?
  const ocrRan = images.some(i => i.ocrResults.length > 0);
  const totalRegions = await prisma.ocrRegion.count({
    where: { result: { image: { inspectionId } } },
  });
  const anySufficient = images.some(i => (i.analysisStatus ?? "") === "PASS" || (i.analysisStatus ?? "") === "WARNING");
  const visual: VisualEvidence = {
    anyImageSufficientQuality: anySufficient,
    ocrRan,
    totalRegions,
    imageCount: images.length,
  };

  // Net quantity for the applicability input
  const netQty = declarations.find(d => d.field === "netQuantity");
  const qtyValue = netQty ? Number(netQty.correctedValue ?? netQty.normalizedValue) : null;
  const quantity = Number.isFinite(qtyValue) ? qtyValue : null;

  const applicabilityInput: ApplicabilityInput = {
    inspectionDate: inspection.inspectionDate,
    packageType: inspection.packageType,
    intendedConsumer: inspection.intendedConsumer as any,
    productCategory: (inspection.product?.category as ApplicabilityInput["productCategory"]) ?? "unknown",
    quantity,
    quantityUnit: netQty?.unit ?? null,
    imported: inspection.packageType === "IMPORTED" ? true : null,
    countryOfOrigin: null,
    productSpecialCategory: null,
    specialLawCategory: null,
    packagePurpose: "SALE",
  };

  const declarationEvidence: DeclarationEvidence[] = declarations.map(d => ({
    field: d.field,
    rawText: d.rawText,
    normalizedValue: d.normalizedValue,
    correctedValue: d.correctedValue,
    unit: d.unit,
    currency: d.currency,
    confidence: d.extractionConfidence,
    imageId: d.imageId,
    bbox: (d.bbox as number[]) ?? null,
  }));

  const result = evaluateCompliance(applicabilityInput, declarationEvidence, visual);

  // --- ACTIVE LEARNING / CONFIDENCE GATE ---
  // The legal engine evaluates compliance assuming the extracted text is true.
  // We apply an active learning safety net: if the AI was uncertain about an extraction (< 0.7),
  // we do not automatically accept a PASS. We route it to a human.
  for (const outcome of result.results) {
    if (outcome.status === "PASS" && outcome.evidence) {
      // Find the declaration that matched this evidence
      const sourceDecl = declarations.find(d => 
        d.field === outcome.inputs?.field || 
        d.rawText === outcome.evidence?.text
      );
      
      const conf = sourceDecl?.extractionConfidence ?? 1.0;
      if (conf < 0.7) {
        outcome.status = "REVIEW";
        outcome.reason = `Active Learning Gate: Rule logically passed based on AI extraction, but AI confidence was very low (${Math.round(conf * 100)}%). Human verification required. ` + outcome.reason;
        outcome.source = (outcome.source || "") + " + AI Confidence Gate";
      }
    }
  }
  
  // Re-calculate overall verdict based on gated outcomes
  const hasFail = result.results.some(r => r.status === "FAIL");
  const hasReview = result.results.some(r => r.status === "REVIEW" || r.status === "MANUAL_REQUIRED");
  result.verdict = hasFail ? "NON_COMPLIANT" : hasReview ? "REVIEW_REQUIRED" : "COMPLIANT";
  // ------------------------------------------

  // Persist ValidationResults (replace previous run)
  await prisma.validationResult.deleteMany({ where: { inspectionId } });
  await prisma.violation.deleteMany({ where: { inspectionId, correctedByReview: false } });
  for (const outcome of result.results) {
    await prisma.validationResult.create({
      data: {
        inspectionId,
        ruleId: outcome.ruleId,
        status: outcome.status as never,
        confidence: outcome.confidence,
        reason: outcome.reason,
        evidence: (outcome.evidence as never) ?? undefined,
        validatorVersion: outcome.validatorVersion,
        inputs: (outcome.inputs as never) ?? undefined,
        source: outcome.source ?? null,
      },
    });
    if (outcome.status === "FAIL") {
      await prisma.violation.create({
        data: {
          inspectionId,
          ruleId: outcome.ruleId,
          severity: "MEDIUM",
          description: outcome.reason,
        },
      });
    }
  }

  // Update inspection overall result
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { overallResult: result.verdict === "COMPLIANT" ? "PASS" : result.verdict === "NON_COMPLIANT" ? "FAIL" : "REVIEW" },
  });

  return result;
}

export async function getCompliance(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  const results = await prisma.validationResult.findMany({
    where: { inspectionId },
    orderBy: { createdAt: "asc" },
  });
  const violations = await prisma.violation.findMany({ where: { inspectionId } });

  return {
    inspectionId,
    results: results.map(r => ({
      id: r.id,
      ruleId: r.ruleId,
      status: r.status,
      confidence: r.confidence,
      reason: r.reason,
      evidence: r.evidence,
      validatorVersion: r.validatorVersion,
      inputs: r.inputs,
      source: r.source,
      humanStatus: r.humanStatus,
      humanComment: r.humanComment,
      reviewedById: r.reviewedById,
      reviewedAt: r.reviewedAt,
    })),
    violations,
    overallResult: inspection.overallResult,
  };
}

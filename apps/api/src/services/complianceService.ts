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
    conflicts: (d.conflicts as any) ?? null,
  }));

  const result = evaluateCompliance(applicabilityInput, declarationEvidence, visual);

  // --- CROSS-IMAGE CONFLICT & ACTIVE LEARNING SAFETY GATE ---
  // 1. Cross-image conflicts: if AI detected conflicting declarations across images
  // (and the inspector hasn't manually corrected the field), route to REVIEW.
  for (const outcome of result.results) {
    // Check if any declaration related to this outcome has unresolved cross-image conflicts
    const conflictingDecl = declarations.find(d => {
      const hasConflicts = !d.correctedValue && d.conflicts && Array.isArray(d.conflicts) && d.conflicts.length > 0;
      if (!hasConflicts) return false;
      if (d.field === outcome.inputs?.field) return true;
      if (d.rawText === outcome.evidence?.text) return true;
      if (d.field === "mrp" && outcome.ruleId === "R6.1e") return true;
      if (d.field === "netQuantity" && outcome.ruleId === "R6.1c") return true;
      if ((d.field === "manufacturerName" || d.field === "manufacturerAddress" || d.field === "marketerName" || d.field === "marketerAddress") && outcome.ruleId === "R6.1a") return true;
      if (d.field === "genericName" && outcome.ruleId === "R6.1b") return true;
      if ((d.field === "manufactureDate" || d.field === "packingDate") && outcome.ruleId === "R6.1d") return true;
      if ((d.field === "consumerCarePhone" || d.field === "consumerCareEmail") && outcome.ruleId === "R6.2") return true;
      return false;
    });

    if (conflictingDecl && outcome.status === "PASS") {
      outcome.status = "REVIEW";
      outcome.confidence = 0.5;
      const conflictsList = (conflictingDecl.conflicts as any[]) || [];
      const conflictSnippet = conflictsList.map(c => `"${c.rawText}" (${c.normalizedValue ?? "unparsed"})`).join(", ");
      outcome.reason = `Conflicting ${conflictingDecl.field} declarations detected across package images: "${conflictingDecl.rawText}" vs ${conflictSnippet}. Manual verification required.`;
      outcome.source = (outcome.source || "") + " + Cross-Image Conflict Gate";
      outcome.evidence = {
        imageId: conflictingDecl.imageId,
        bbox: (conflictingDecl.bbox as number[]) ?? null,
        text: conflictingDecl.rawText,
        conflict: {
          field: conflictingDecl.field,
          primary: {
            imageId: conflictingDecl.imageId,
            text: conflictingDecl.rawText,
            value: conflictingDecl.normalizedValue,
            bbox: (conflictingDecl.bbox as number[]) ?? null,
          },
          conflicting: conflictsList.map(c => ({
            imageId: c.imageId,
            text: c.rawText,
            value: c.normalizedValue,
            bbox: c.bbox ?? null,
          })),
        },
      };
    }
  }

  // 2. Active Learning gate: if the AI was uncertain (< 0.7), route to REVIEW
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

  // Append-only audit trail: supersede (never delete) previous run rows, then
  // write the new run as current. Historical evidence stays queryable.
  const previousRun = await prisma.validationResult.findMany({
    where: { inspectionId, supersededById: null },
    select: { id: true, ruleId: true, status: true, humanStatus: true },
  });
  for (const outcome of result.results) {
    const created = await prisma.validationResult.create({
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
    // Point any previous row for the same rule at the new row (supersession).
    const prev = previousRun.find(p => p.ruleId === outcome.ruleId);
    if (prev) {
      await prisma.validationResult.update({
        where: { id: prev.id },
        data: { supersededById: created.id },
      });
    }
    if (outcome.status === "FAIL") {
      const existingOpen = await prisma.violation.findFirst({
        where: { inspectionId, ruleId: outcome.ruleId, correctedByReview: false },
      });
      if (!existingOpen) {
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
    where: { inspectionId, supersededById: null },
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

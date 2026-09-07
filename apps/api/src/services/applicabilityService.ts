import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessInspection } from "./inspectionService.js";
import { evaluateApplicability } from "@metrascan/legal-engine";
import type { ApplicabilityInput, ApplicabilityResult } from "@metrascan/legal-engine";

/**
 * Runs the applicability engine for an inspection using its ACTUAL evidence:
 * package type, product category, and the extracted net quantity declaration.
 * The engine decides WHAT must be checked — never compliance.
 */
export async function getApplicability(inspectionId: string, user: { sub: string; role: string }): Promise<ApplicabilityResult> {
  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    include: { product: true },
  });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  // Pull the extracted net quantity (best evidence for the Rule 3 / Rule 26 boundaries)
  const netQty = await prisma.declaration.findFirst({
    where: { inspectionId, field: "netQuantity" },
    orderBy: { createdAt: "desc" },
  });
  const quantityValue = netQty ? Number(netQty.correctedValue ?? netQty.normalizedValue) : null;
  const quantityUnit = netQty?.unit ?? null;
  const quantity = Number.isFinite(quantityValue) ? quantityValue : null;

  const input: ApplicabilityInput = {
    inspectionDate: inspection.inspectionDate,
    packageType: inspection.packageType,
    // Provide the actual captured intended consumer (defaults to UNKNOWN if not specified)
    intendedConsumer: inspection.intendedConsumer as any,
    productCategory: (inspection.product?.category as ApplicabilityInput["productCategory"]) ?? "unknown",
    quantity,
    quantityUnit,
    imported: inspection.packageType === "IMPORTED" ? true : null,
    countryOfOrigin: null,
    productSpecialCategory: null,
    specialLawCategory: null,
    packagePurpose: "SALE",
  };

  return evaluateApplicability(input);
}

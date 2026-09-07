import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessInspection } from "./inspectionService.js";
import { audit } from "./auditService.js";

const REVIEW_ACTIONS = ["ACCEPT", "REJECT", "EDIT_DECLARATION", "CHANGE_RESULT", "COMMENT", "MARK_MANUAL"] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export interface ReviewInput {
  action: ReviewAction;
  ruleId?: string;
  targetId?: string; // ValidationResult id (for accept/reject/change) or Declaration id (for edit)
  newValue?: string | null;
  comment?: string | null;
}

async function requireReviewAccess(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");
  // Reviewer/Admin may act on any inspection; Inspectors on their own; VIEWER read-only.
  if (user.role === "VIEWER") throw ApiError.forbidden("VIEWER role cannot submit review actions");
  if (user.role === "INSPECTOR" && !access.canEdit) throw ApiError.forbidden("Inspectors can review only their own inspections");
  return inspection;
}

/**
 * Records one review action. Every action:
 * - is audited (user, timestamp, inspection, action, oldValue, newValue, comment)
 * - never overwrites the AI result — humanStatus lives beside the AI status.
 */
export async function submitReview(inspectionId: string, user: { sub: string; role: string }, input: ReviewInput) {
  await requireReviewAccess(inspectionId, user);
  const { action } = input;

  let oldValue: string | null = null;
  let newValue: string | null = input.newValue ?? null;

  if (action === "ACCEPT" || action === "REJECT" || action === "CHANGE_RESULT" || action === "MARK_MANUAL") {
    if (!input.targetId) throw ApiError.badRequest("targetId (ValidationResult id) is required for this action");
    const result = await prisma.validationResult.findFirst({ where: { id: input.targetId, inspectionId } });
    if (!result) throw ApiError.notFound("Validation result not found");

    oldValue = result.humanStatus ?? result.status; // previous effective status
    let humanStatus: typeof result.humanStatus;
    if (action === "ACCEPT") humanStatus = result.status; // confirm the AI finding
    else if (action === "REJECT") humanStatus = result.status === "FAIL" ? "PASS" : result.status === "PASS" ? "FAIL" : result.status;
    else if (action === "CHANGE_RESULT") humanStatus = (newValue as never) ?? null;
    else humanStatus = "MANUAL_REQUIRED";

    await prisma.validationResult.update({
      where: { id: result.id },
      data: {
        humanStatus,
        humanComment: input.comment ?? null,
        reviewedById: user.sub,
        reviewedAt: new Date(),
      },
    });

    const allResults = await prisma.validationResult.findMany({ where: { inspectionId } });
    const applicable = allResults.filter(r => (r.humanStatus ?? r.status) !== "NOT_APPLICABLE");
    const failed = applicable.filter(r => (r.humanStatus ?? r.status) === "FAIL");
    const reviews = applicable.filter(r => (r.humanStatus ?? r.status) === "REVIEW");
    const manual = applicable.filter(r => (r.humanStatus ?? r.status) === "MANUAL_REQUIRED");
    const passed = applicable.filter(r => (r.humanStatus ?? r.status) === "PASS");

    let overallResult: "PASS" | "FAIL" | "REVIEW";
    if (failed.length > 0) overallResult = "FAIL";
    else if (reviews.length > 0 || manual.length > 0) overallResult = "REVIEW";
    else if (passed.length > 0) overallResult = "PASS";
    else overallResult = "REVIEW";

    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { overallResult },
    });
    newValue = humanStatus;
    if (action === "CHANGE_RESULT" && newValue === oldValue) newValue = oldValue;

    // Persist the review record (decision history)
    await prisma.review.create({
      data: {
        inspectionId,
        reviewerId: user.sub,
        decision: action,
        notes: input.comment ?? null,
        ruleId: result.ruleId,
        targetId: result.id,
        oldValue,
        newValue,
      },
    });
  } else if (action === "EDIT_DECLARATION") {
    if (!input.targetId) throw ApiError.badRequest("targetId (Declaration id) is required for this action");
    const declaration = await prisma.declaration.findFirst({ where: { id: input.targetId, inspectionId } });
    if (!declaration) throw ApiError.notFound("Declaration not found");
    oldValue = declaration.correctedValue ?? declaration.normalizedValue;
    await prisma.declaration.update({
      where: { id: declaration.id },
      data: { correctedValue: newValue, correctionNote: input.comment ?? null, correctedById: user.sub },
    });
    await prisma.review.create({
      data: {
        inspectionId,
        reviewerId: user.sub,
        decision: action,
        notes: input.comment ?? null,
        ruleId: declaration.field,
        targetId: declaration.id,
        oldValue,
        newValue,
      },
    });
  } else if (action === "COMMENT") {
    await prisma.review.create({
      data: {
        inspectionId,
        reviewerId: user.sub,
        decision: action,
        notes: input.comment ?? null,
      },
    });
  } else {
    throw ApiError.badRequest(`Unknown action. Allowed: ${REVIEW_ACTIONS.join(", ")}`);
  }

  // Audit every review action (belt-and-braces alongside the Review rows)
  await audit(
    { id: user.sub, role: user.role as never },
    "REVIEW_" + action,
    "Inspection",
    inspectionId,
    { action, ruleId: input.ruleId ?? null, targetId: input.targetId ?? null, oldValue, newValue, comment: input.comment ?? null }
  );

  return { ok: true, action, oldValue, newValue };
}

export async function getReviewHistory(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");

  const reviews = await prisma.review.findMany({
    where: { inspectionId },
    orderBy: { createdAt: "desc" },
    include: { reviewer: { select: { id: true, name: true, role: true } } },
  });
  const auditLogs = await prisma.auditLog.findMany({
    where: { entityType: "Inspection", entityId: inspectionId, action: { startsWith: "REVIEW_" } },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { id: true, name: true, role: true } } },
  });

  return { inspectionId, reviews, auditLogs };
}

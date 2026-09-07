import { prisma } from "../db/prisma.js";

/**
 * Dashboard data — real database numbers only. No fake data, no invented trends.
 * An empty database yields zero counts and empty arrays.
 */
export async function getSummary(user: { sub: string; role: string }) {
  const scope = inspectionScope(user);
  const [total, compliant, nonCompliant, reviewRequired, openViolations] = await Promise.all([
    prisma.inspection.count({ where: scope }),
    prisma.inspection.count({ where: { ...scope, overallResult: "PASS" } }),
    prisma.inspection.count({ where: { ...scope, overallResult: "FAIL" } }),
    prisma.inspection.count({ where: { ...scope, overallResult: "REVIEW" } }),
    prisma.violation.count({
      where: { inspection: { ...(scope.inspectorId ? { inspectorId: scope.inspectorId } : {}) }, correctedByReview: false },
    }),
  ]);
  return { totalInspections: total, compliant, nonCompliant, reviewRequired, openViolations };
}

export async function getRecent(user: { sub: string; role: string }) {
  const scope = inspectionScope(user);
  const inspections = await prisma.inspection.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      product: { select: { name: true, brand: true } },
      inspector: { select: { name: true } },
    },
  });
  return inspections.map(i => ({
    id: i.id,
    inspectionNumber: i.inspectionNumber,
    isDemo: i.isDemo,
    status: i.status,
    overallResult: i.overallResult,
    product: i.product ? i.product.name + (i.product.brand ? " (" + i.product.brand + ")" : "") : null,
    inspector: i.inspector?.name ?? null,
    createdAt: i.createdAt,
  }));
}

export async function getViolations(user: { sub: string; role: string }) {
  const scope = inspectionScope(user);
  const violations = await prisma.violation.findMany({
    where: { inspection: { ...(scope.inspectorId ? { inspectorId: scope.inspectorId } : {}) } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      inspection: {
        select: {
          id: true,
          inspectionNumber: true,
          inspectionDate: true,
          product: { select: { name: true, category: true } },
        },
      },
      validationResult: { select: { status: true, humanStatus: true } },
    },
  });
  return violations.map(v => ({
    id: v.id,
    ruleId: v.ruleId,
    category: v.validationResult?.humanStatus ?? v.validationResult?.status ?? "UNRESOLVED",
    status: v.correctedByReview ? "CORRECTED" : "OPEN",
    description: v.description,
    date: v.createdAt,
    product: v.inspection.product?.name ?? null,
    productCategory: v.inspection.product?.category ?? null,
    inspectionNumber: v.inspection.inspectionNumber,
    inspectionId: v.inspection.id,
  }));
}

export async function getTrends(user: { sub: string; role: string }) {
  const scope = inspectionScope(user);

  // Inspections grouped by outcome per month (last 12 months of REAL data)
  const inspections = await prisma.inspection.findMany({
    where: scope,
    select: { createdAt: true, overallResult: true },
    orderBy: { createdAt: "asc" },
  });
  const byMonth = new Map<string, { month: string; total: number; compliant: number; nonCompliant: number; reviewRequired: number }>();
  for (const insp of inspections) {
    const key = insp.createdAt.toISOString().slice(0, 7); // YYYY-MM
    let entry = byMonth.get(key);
    if (!entry) {
      entry = { month: key, total: 0, compliant: 0, nonCompliant: 0, reviewRequired: 0 };
      byMonth.set(key, entry);
    }
    entry.total += 1;
    if (insp.overallResult === "PASS") entry.compliant += 1;
    else if (insp.overallResult === "FAIL") entry.nonCompliant += 1;
    else if (insp.overallResult === "REVIEW") entry.reviewRequired += 1;
  }
  const inspectionOutcomes = Array.from(byMonth.values());

  // Violations by rule (real counts only)
  const violationsByRuleRaw = await prisma.violation.groupBy({
    by: ["ruleId"],
    where: { inspection: { ...(scope.inspectorId ? { inspectorId: scope.inspectorId } : {}) } },
    _count: { ruleId: true },
    orderBy: { _count: { ruleId: "desc" } },
  });
  const violationsByRule = violationsByRuleRaw.map(v => ({ ruleId: v.ruleId, count: v._count.ruleId }));

  // Violations by product category (via inspection -> product)
  const violationRows = await prisma.violation.findMany({
    where: { inspection: { ...(scope.inspectorId ? { inspectorId: scope.inspectorId } : {}) } },
    select: { inspection: { select: { product: { select: { category: true } } } } },
  });
  const catCounts = new Map<string, number>();
  for (const v of violationRows) {
    const cat = v.inspection.product?.category ?? "uncategorized";
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }
  const violationsByCategory = Array.from(catCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Review rate (fraction of inspections with at least one review action)
  const inspectionsWithReview = await prisma.inspection.count({
    where: { ...scope, reviews: { some: {} } },
  });
  const total = inspections.length;
  const reviewRate = total > 0 ? inspectionsWithReview / total : null; // null when no data

  // Common missing declarations: FAIL results whose reason mentions "not detected"
  const failResults = await prisma.validationResult.findMany({
    where: {
      inspection: scope,
      status: "FAIL",
      reason: { contains: "not detected" },
    },
    select: { ruleId: true },
  });
  const missingCounts = new Map<string, number>();
  for (const r of failResults) missingCounts.set(r.ruleId, (missingCounts.get(r.ruleId) ?? 0) + 1);
  const commonMissingDeclarations = Array.from(missingCounts.entries())
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { inspectionOutcomes, violationsByRule, violationsByCategory, reviewRate, commonMissingDeclarations };
}

function inspectionScope(user: { sub: string; role: string }) {
  // INSPECTORs see only their own; REVIEWER/ADMIN/VIEWER see all.
  return user.role === "INSPECTOR" ? { inspectorId: user.sub } : {};
}

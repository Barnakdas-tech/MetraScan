import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import type { CreateInspectionInput } from "../validators/inspectionSchemas.js";
import { generateInspectionNumber } from "./inspectionNumberService.js";

export interface InspectionAccess {
  canView: boolean;
  canEdit: boolean;
}

/**
 * Access control:
 * - ADMIN: full access to every inspection
 * - INSPECTOR: view/edit only their own inspections
 * - REVIEWER/VIEWER: view all inspections (review/oversight), never edit
 */
export function canAccessInspection(
  user: { sub: string; role: string },
  inspection: { inspectorId: string | null }
): InspectionAccess {
  if (user.role === "ADMIN") return { canView: true, canEdit: true };
  if (user.role === "INSPECTOR") {
    const own = inspection.inspectorId === user.sub;
    return { canView: own, canEdit: own };
  }
  if (user.role === "REVIEWER" || user.role === "VIEWER") return { canView: true, canEdit: false };
  return { canView: false, canEdit: false };
}

export async function createInspection(input: CreateInspectionInput, inspectorId: string) {
  let date = input.inspectionDate ?? new Date();
  // Clamp to a 7-day window around today: prevents backdating to a laxer rule
  // regime or future-dating (both distort effective-date resolution).
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (Math.abs(date.getTime() - now) > 7 * dayMs) {
    date = new Date(now);
  }
  const year = date.getFullYear();
  const data: Prisma.InspectionCreateInput = {
    inspectionNumber: await generateInspectionNumber(year),
    status: "DRAFT",
    packageType: input.packageType,
    intendedConsumer: input.intendedConsumer,
    inspectionDate: date,
    year,
    location: input.location,
    notes: input.notes,
    inspector: { connect: { id: inspectorId } },
  };

  if (input.product) {
    data.product = {
      create: {
        name: input.product.name,
        genericName: input.product.genericName,
        brand: input.product.brand,
        manufacturer: input.product.manufacturer,
        category: input.product.category,
      },
    };
  }

  return prisma.inspection.create({ data, include: { product: true, inspector: { select: { id: true, name: true } } } });
}

export async function listInspections(user: { sub: string; role: string }) {
  const where =
    user.role === "INSPECTOR"
      ? Prisma.validator<Prisma.InspectionWhereInput>()({ inspectorId: user.sub })
      : undefined;
  return prisma.inspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { id: true, name: true, brand: true } },
      inspector: { select: { id: true, name: true } },
    },
  });
}

/** Search + filter + sort + paginate inspection history. Returns real data only. */
export async function listInspectionsPaged(
  user: { sub: string; role: string },
  query: {
    q?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
    productCategory?: string;
    inspectorId?: string;
    violationRuleId?: string;
    sortBy: "createdAt" | "inspectionDate" | "inspectionNumber" | "status";
    sortOrder: "asc" | "desc";
    page: number;
    pageSize: number;
  }
) {
  const baseWhere = user.role === "INSPECTOR" ? { inspectorId: user.sub } : {};

  const and: Prisma.InspectionWhereInput[] = [baseWhere];

  if (query.q) {
    const s = { contains: query.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { inspectionNumber: s },
        { location: s },
        { notes: s },
        { product: { is: { name: s } } },
        { product: { is: { brand: s } } },
      ],
    });
  }
  if (query.dateFrom || query.dateTo) {
    const range: Record<string, Date> = {};
    if (query.dateFrom) range.gte = query.dateFrom;
    if (query.dateTo) range.lte = query.dateTo;
    and.push({ inspectionDate: range });
  }
  if (query.status) and.push({ status: query.status as never });
  if (query.productCategory) and.push({ product: { is: { category: query.productCategory } } });
  if (query.inspectorId) and.push({ inspectorId: query.inspectorId });
  if (query.violationRuleId) {
    and.push({ violations: { some: { ruleId: query.violationRuleId } } });
  }

  const where: Prisma.InspectionWhereInput = { AND: and };
  const total = await prisma.inspection.count({ where });

  const inspections = await prisma.inspection.findMany({
    where,
    orderBy: { [query.sortBy]: query.sortOrder },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    include: {
      product: { select: { id: true, name: true, brand: true, category: true } },
      inspector: { select: { id: true, name: true } },
      _count: { select: { violations: true } },
    },
  });

  return {
    items: inspections,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getInspectionById(id: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      product: true,
      inspector: { select: { id: true, name: true } },
      images: {
        select: {
          id: true,
          originalFilename: true,
          mimeType: true,
          fileSize: true,
          width: true,
          height: true,
          sequence: true,
          uploadStatus: true,
          createdAt: true,
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found"); // 404, not 403: no existence leak
  return inspection;
}

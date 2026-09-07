import { Prisma } from "../generated/prisma/index.js";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function listProducts(params: { q?: string; category?: string; page: number; pageSize: number }) {
  const where: Prisma.ProductWhereInput = {};
  const and: Prisma.ProductWhereInput[] = [];
  if (params.q) {
    const s = { contains: params.q, mode: "insensitive" as const };
    and.push({ OR: [{ name: s }, { brand: s }, { genericName: s }, { manufacturer: s }] });
  }
  if (params.category) and.push({ category: params.category });
  if (and.length > 0) where.AND = and;

  const total = await prisma.product.count({ where });
  const products = await prisma.product.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (params.page - 1) * params.pageSize,
    take: params.pageSize,
    include: { _count: { select: { inspections: true } } },
  });
  return {
    items: products,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    },
  };
}

export async function getProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      inspections: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          inspectionNumber: true,
          status: true,
          overallResult: true,
          inspectionDate: true,
          createdAt: true,
        },
      },
      _count: { select: { inspections: true } },
    },
  });
  if (!product) throw ApiError.notFound("Product not found");

  // Compliance history: validation results across this product's inspections
  const complianceHistory = await prisma.validationResult.findMany({
    where: { inspection: { productId } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      ruleId: true,
      status: true,
      humanStatus: true,
      confidence: true,
      reason: true,
      createdAt: true,
      inspection: { select: { inspectionNumber: true, inspectionDate: true } },
    },
  });

  return { product, complianceHistory };
}

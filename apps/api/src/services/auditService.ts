import type { Role } from "../db/prismaTypes.js";
import { prisma } from "../db/prisma.js";
import { Prisma } from "../generated/prisma/index.js";
import { ApiError } from "../utils/apiError.js";

export async function audit(
  actor: { id: string; role: Role } | null,
  action: string,
  entityType: string,
  entityId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id,
        action,
        entityType,
        entityId,
        metadata: metadata as never,
      },
    });
  } catch (err) {
    // Audit logging must never break the main request flow.
    console.error("[audit] failed to write audit log:", err);
  }
}

export async function listAuditLogs(
  adminUser: { sub: string; role: string },
  query: { page?: number; pageSize?: number; action?: string; entityType?: string }
) {
  if (adminUser.role !== "ADMIN") {
    throw ApiError.forbidden("Only ADMIN role can view system audit logs");
  }
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
  const where: Prisma.AuditLogWhereInput = {};
  if (query.action) where.action = { contains: query.action, mode: "insensitive" };
  if (query.entityType) where.entityType = query.entityType;

  const total = await prisma.auditLog.count({ where });
  const items = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}


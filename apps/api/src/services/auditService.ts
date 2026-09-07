import type { Role } from "../db/prismaTypes.js";
import { prisma } from "../db/prisma.js";

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

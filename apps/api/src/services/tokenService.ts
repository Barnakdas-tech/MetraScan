import { prisma } from "../db/prisma.js";

export async function isTokenRevoked(jti: string | undefined, userId: string | undefined): Promise<boolean> {
  if (!jti || !userId) return true;
  const revoked = await prisma.revokedToken.findUnique({ where: { jti } });
  if (!revoked) return false;
  if (revoked.expiresAt.getTime() <= Date.now()) {
    await prisma.revokedToken.delete({ where: { jti } }).catch(() => undefined);
  }
  return true;
}

export async function revokeToken(jti: string, userId: string, expiresAt: Date): Promise<void> {
  await prisma.revokedToken.create({ data: { jti, userId, expiresAt } }).catch(() => undefined);
}

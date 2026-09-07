import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import bcrypt from "bcryptjs";
import { audit } from "./auditService.js";

export async function updateProfile(userId: string, data: { name?: string; email?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found");

  if (data.email && data.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw ApiError.badRequest("Email is already in use");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name ?? user.name,
      email: data.email ?? user.email,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  await audit({ id: userId, role: user.role as never }, "USER_UPDATED", "User", userId, { 
    oldName: user.name, newName: updated.name, 
    oldEmail: user.email, newEmail: updated.email 
  });

  return updated;
}

export async function updatePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User not found");

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Current password is incorrect");

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  });

  await audit({ id: userId, role: user.role as never }, "PASSWORD_CHANGED", "User", userId);

  return { message: "Password updated successfully" };
}

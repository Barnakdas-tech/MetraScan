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

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER";
}

export async function listUsers(adminUser: { sub: string; role: string }) {
  if (adminUser.role !== "ADMIN") {
    throw ApiError.forbidden("Only ADMIN role can view the user list");
  }
  return prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createUser(adminUser: { sub: string; role: string }, input: CreateUserInput) {
  if (adminUser.role !== "ADMIN") {
    throw ApiError.forbidden("Only ADMIN role can create users");
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.badRequest("A user with this email address already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive: true,
    },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });

  await audit(
    { id: adminUser.sub, role: "ADMIN" },
    "USER_CREATED",
    "User",
    user.id,
    { email: user.email, name: user.name, role: user.role }
  );

  return user;
}

export async function updateUserRole(
  adminUser: { sub: string; role: string },
  targetUserId: string,
  newRole: "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER"
) {
  if (adminUser.role !== "ADMIN") {
    throw ApiError.forbidden("Only ADMIN role can modify user roles");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw ApiError.notFound("User not found");

  // Prevent admin self-lockout: an admin cannot demote their own account
  if (adminUser.sub === targetUserId && target.role === "ADMIN" && newRole !== "ADMIN") {
    throw ApiError.forbidden("Admins cannot revoke their own administrative privileges; another admin must make this change.");
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
  });

  await audit(
    { id: adminUser.sub, role: "ADMIN" },
    "USER_ROLE_CHANGED",
    "User",
    targetUserId,
    { oldRole: target.role, newRole }
  );

  return updated;
}

export async function updateUserStatus(
  adminUser: { sub: string; role: string },
  targetUserId: string,
  isActive: boolean
) {
  if (adminUser.role !== "ADMIN") {
    throw ApiError.forbidden("Only ADMIN role can modify user account status");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw ApiError.notFound("User not found");

  // Prevent admin self-lockout: an admin cannot deactivate their own account
  if (adminUser.sub === targetUserId && !isActive) {
    throw ApiError.forbidden("Admins cannot deactivate their own account.");
  }

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isActive },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
  });

  await audit(
    { id: adminUser.sub, role: "ADMIN" },
    "USER_STATUS_CHANGED",
    "User",
    targetUserId,
    { oldStatus: target.isActive, newStatus: isActive }
  );

  return updated;
}


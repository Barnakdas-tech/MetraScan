import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import type { LoginInput, RegisterInput } from "../validators/authSchemas.js";

const SALT_ROUNDS = 12;
const TOKEN_TTL_SECONDS = env.NODE_ENV === "production" ? 8 * 60 * 60 : 24 * 60 * 60;

export async function register(input: RegisterInput) {
  if (env.NODE_ENV === "production") {
    throw ApiError.forbidden("Registration is disabled. Contact an administrator for account provisioning.");
  }
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.forbidden("Registration is not available for this email.");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash, role: "INSPECTOR" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return user;
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) throw ApiError.unauthorized("Invalid email or password");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw ApiError.unauthorized("Invalid email or password");

  const token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role, jti: crypto.randomUUID() },
    env.JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS } as jwt.SignOptions
  );
  return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

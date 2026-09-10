import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import { isTokenRevoked } from "../services/tokenService.js";
import type { Role } from "../db/prismaTypes.js";

export interface AuthPayload {
  sub: string;
  email: string;
  role: Role;
  jti?: string;
}

declare module "express" {
  interface Request {
    user?: AuthPayload;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    // Denylist revoked tokens (logout / password change).
    if (await isTokenRevoked(payload.jti, payload.sub)) {
      throw new Error("revoked");
    }
    // Re-check live account state so role changes and deactivation apply
    // immediately instead of at JWT expiry.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { role: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new Error("inactive");
    }
    req.user = { sub: payload.sub, email: payload.email, role: user.role };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

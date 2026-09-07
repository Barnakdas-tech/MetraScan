import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";
import type { Role } from "../db/prismaTypes.js";

export interface AuthPayload {
  sub: string;
  email: string;
  role: Role;
}

declare module "express" {
  interface Request {
    user?: AuthPayload;
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = { sub: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

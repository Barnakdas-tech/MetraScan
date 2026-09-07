import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";
import type { Role } from "../db/prismaTypes.js";

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' cannot access this resource`));
    }
    next();
  };
}

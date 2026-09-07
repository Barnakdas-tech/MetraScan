import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/apiError.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest("Validation failed", result.error.flatten().fieldErrors));
    }
    req.body = result.data;
    next();
  };
}

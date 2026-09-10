import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) console.error("[ApiError]", err);
    return void res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  // Prisma known errors
  const anyErr = err as { code?: string; message?: string; type?: string };
  if (anyErr?.code === "P2002") {
    return void res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "A record with the same unique value already exists" },
    });
  }
  if (anyErr?.code === "P2025") {
    return void res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "The requested record was not found" },
    });
  }
  // Multer file-size limit
  if (anyErr?.code === "LIMIT_FILE_SIZE") {
    return void res.status(413).json({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "File exceeds the 10 MB limit" },
    });
  }
  // Body-parser / multer payload limits and malformed multipart bodies
  if (
    anyErr?.type === "entity.too.large" ||
    anyErr?.message?.includes("request entity too large") ||
    anyErr?.code === "LIMIT_UNEXPECTED_FILE"
  ) {
    return void res.status(413).json({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds the allowed size" },
    });
  }
  if (anyErr?.message?.includes("Unexpected end of") || anyErr?.message?.includes("malformed")) {
    return void res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Malformed request body" },
    });
  }

  console.error("[Unhandled]", err);
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : (anyErr?.message ?? "Internal server error");
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message, details: env.NODE_ENV === "production" ? undefined : String(anyErr) },
  });
}

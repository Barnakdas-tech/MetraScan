import type { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data });
}

export function sendError(res: Response, code: string, message: string, statusCode = 400, details?: unknown): void {
  res.status(statusCode).json({ success: false, error: { code, message, details } });
}

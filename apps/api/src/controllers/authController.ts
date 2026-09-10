import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { register, login, getMe } from "../services/authService.js";
import { revokeToken } from "../services/tokenService.js";

export const registerController = asyncHandler(async (req: Request, res: Response) => {
  const user = await register(req.body);
  sendSuccess(res, user, 201);
});

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await login(req.body);
  sendSuccess(res, result);
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  const user = await getMe(req.user!.sub);
  sendSuccess(res, user);
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  // Server-side revocation: the presented token cannot be replayed after logout.
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { jti?: string; sub?: string; exp?: number };
      if (payload.jti && payload.sub && payload.exp) {
        await revokeToken(payload.jti, payload.sub, new Date(payload.exp * 1000));
      }
    } catch {
      // Invalid tokens have nothing to revoke; the response stays 200.
    }
  }
  sendSuccess(res, { message: "Logged out" });
});

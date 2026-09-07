import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { register, login, getMe } from "../services/authService.js";

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

export const logoutController = asyncHandler(async (_req: Request, res: Response) => {
  // JWTs are stateless; the client discards the token. Kept as an explicit
  // endpoint for API symmetry and future token revocation support.
  sendSuccess(res, { message: "Logged out" });
});

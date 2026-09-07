import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { updateProfile, updatePassword } from "../services/userService.js";

export const updateProfileController = asyncHandler(async (req: Request, res: Response) => {
  const user = await updateProfile(req.user!.sub, req.body);
  sendSuccess(res, user);
});

export const updatePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updatePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, result);
});

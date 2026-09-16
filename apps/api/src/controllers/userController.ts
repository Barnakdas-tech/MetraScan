import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { updateProfile, updatePassword, listUsers, createUser, updateUserRole, updateUserStatus } from "../services/userService.js";

export const updateProfileController = asyncHandler(async (req: Request, res: Response) => {
  const user = await updateProfile(req.user!.sub, req.body);
  sendSuccess(res, user);
});

export const updatePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updatePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
  sendSuccess(res, result);
});

export const listUsersController = asyncHandler(async (req: Request, res: Response) => {
  const users = await listUsers(req.user!);
  sendSuccess(res, users);
});

export const createUserController = asyncHandler(async (req: Request, res: Response) => {
  const user = await createUser(req.user!, req.body);
  sendSuccess(res, user, 201);
});

export const updateUserRoleController = asyncHandler(async (req: Request, res: Response) => {
  const updated = await updateUserRole(req.user!, req.params.id, req.body.role);
  sendSuccess(res, updated);
});

export const updateUserStatusController = asyncHandler(async (req: Request, res: Response) => {
  const updated = await updateUserStatus(req.user!, req.params.id, req.body.isActive);
  sendSuccess(res, updated);
});


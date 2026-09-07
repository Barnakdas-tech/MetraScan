import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { ApiError } from "../utils/apiError.js";
import {
  extractAndStoreDeclarations,
  listDeclarations,
  updateDeclaration,
} from "../services/declarationService.js";

const correctionSchema = z.object({
  correctedValue: z.string().max(500).nullable().optional(),
  correctionNote: z.string().max(1000).nullable().optional(),
});

export const extractDeclarationsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await extractAndStoreDeclarations(req.params.id, req.user!);
  sendSuccess(res, result, 200);
});

export const listDeclarationsController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await listDeclarations(req.params.id, req.user!));
});

export const updateDeclarationController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  const result = await updateDeclaration(req.params.id, req.params.declarationId, req.user!, parsed.data);
  sendSuccess(res, result);
});

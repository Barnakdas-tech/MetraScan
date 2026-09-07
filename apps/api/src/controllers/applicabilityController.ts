import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { getApplicability } from "../services/applicabilityService.js";

export const getApplicabilityController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getApplicability(req.params.id, req.user!));
});

import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { runCompliance, getCompliance } from "../services/complianceService.js";

export const runComplianceController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await runCompliance(req.params.id, req.user!));
});

export const getComplianceController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getCompliance(req.params.id, req.user!));
});

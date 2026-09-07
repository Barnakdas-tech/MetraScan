import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { analyzeInspection, getAnalysis } from "../services/analysisService.js";

export const analyzeController = asyncHandler(async (req: Request, res: Response) => {
  const result = await analyzeInspection(req.params.id, req.user!);
  sendSuccess(res, result, 200);
});

export const getAnalysisController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getAnalysis(req.params.id, req.user!);
  sendSuccess(res, result);
});

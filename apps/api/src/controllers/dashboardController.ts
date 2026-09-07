import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { getSummary, getRecent, getViolations, getTrends } from "../services/dashboardService.js";

export const summaryController = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await getSummary(_req.user!));
});
export const recentController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getRecent(req.user!));
});
export const violationsController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getViolations(req.user!));
});
export const trendsController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getTrends(req.user!));
});

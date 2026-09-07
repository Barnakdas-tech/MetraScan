import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { generateReport, getReport, getReportFile, listReports } from "../services/reportService.js";

export const listReportsController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await listReports(req.user!));
});

export const generateReportController = asyncHandler(async (req: Request, res: Response) => {
  const report = await generateReport(req.params.id, req.user!);
  sendSuccess(res, report, 201);
});

export const getReportController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getReport(req.params.id, req.user!));
});

export const downloadReportController = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, filename } = await getReportFile(req.params.id, req.user!);
  res.setHeader("Content-Type", "application/pdf");
  
  if (req.query.inline === 'true') {
    res.setHeader("Content-Disposition", 'inline; filename="' + filename + '"');
  } else {
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
  }
  
  res.send(buffer);
});

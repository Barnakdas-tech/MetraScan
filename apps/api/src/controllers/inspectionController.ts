import type { Request, Response } from "express";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { createInspection, listInspections, getInspectionById } from "../services/inspectionService.js";
import { listInspectionsPaged } from "../services/inspectionService.js";
import { historyQuerySchema } from "../validators/historySchemas.js";

export const createInspectionController = asyncHandler(async (req: Request, res: Response) => {
  const inspection = await createInspection(req.body, req.user!.sub);
  sendSuccess(res, inspection, 201);
});

export const listInspectionsController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    if (Object.keys(req.query).length === 0) {
      sendSuccess(res, await listInspections(req.user!));
      return;
    }
    throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten().fieldErrors);
  }
  sendSuccess(res, await listInspectionsPaged(req.user!, parsed.data));
});

export const getInspectionController = asyncHandler(async (req: Request, res: Response) => {
  const inspection = await getInspectionById(req.params.inspectionId, req.user!);
  sendSuccess(res, inspection);
});

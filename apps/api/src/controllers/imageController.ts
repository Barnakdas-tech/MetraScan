import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { uploadImages, listImages, deleteImage, reorderImages } from "../services/imageUploadService.js";
import { canAccessInspection, getInspectionById } from "../services/inspectionService.js";
import { ApiError } from "../utils/apiError.js";
import type { MulterFile } from "../middleware/upload.js";
import { z } from "zod";

async function requireInspectionAccess(req: Request, edit: boolean) {
  const inspection = await getInspectionById(req.params.id, req.user!);
  const access = canAccessInspection(req.user!, inspection);
  if (edit && !access.canEdit) throw ApiError.forbidden("You cannot modify this inspection");
  if (!edit && !access.canView) throw ApiError.notFound("Inspection not found");
  return inspection;
}

export const uploadImagesController = asyncHandler(async (req: Request, res: Response) => {
  await requireInspectionAccess(req, true);
  const files = (req.files as MulterFile[]) ?? [];
  if (files.length === 0) throw ApiError.badRequest("No image files provided under the 'images' field");
  const result = await uploadImages(req.params.id, files);
  const allGood = result.failed.length === 0;
  sendSuccess(res, result, allGood ? 201 : 207);
});

export const listImagesController = asyncHandler(async (req: Request, res: Response) => {
  await requireInspectionAccess(req, false);
  sendSuccess(res, await listImages(req.params.id));
});

export const deleteImageController = asyncHandler(async (req: Request, res: Response) => {
  await requireInspectionAccess(req, true);
  await deleteImage(req.params.id, req.params.imageId);
  sendSuccess(res, { message: "Image deleted" });
});

const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1) });

export const reorderImagesController = asyncHandler(async (req: Request, res: Response) => {
  await requireInspectionAccess(req, true);
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  sendSuccess(res, await reorderImages(req.params.id, parsed.data.orderedIds));
});

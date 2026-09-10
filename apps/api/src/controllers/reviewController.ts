import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { ApiError } from "../utils/apiError.js";
import { submitReview, getReviewHistory } from "../services/reviewService.js";

const reviewSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "EDIT_DECLARATION", "CHANGE_RESULT", "COMMENT", "MARK_MANUAL"]),
  ruleId: z.string().optional(),
  targetId: z.string().uuid().optional(),
  newValue: z.enum(["PASS", "FAIL", "REVIEW", "MANUAL_REQUIRED"]).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
});

export const submitReviewController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  const result = await submitReview(req.params.id, req.user!, parsed.data);
  sendSuccess(res, result, 201);
});

export const getReviewHistoryController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getReviewHistory(req.params.id, req.user!));
});

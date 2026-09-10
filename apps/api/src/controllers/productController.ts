import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { ApiError } from "../utils/apiError.js";
import { listProducts, getProduct } from "../services/productService.js";

const listSchema = z.object({
  q: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listProductsController = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query parameters", parsed.error.flatten().fieldErrors);
  sendSuccess(res, await listProducts(parsed.data));
});

export const getProductController = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getProduct(req.params.id, req.user!));
});

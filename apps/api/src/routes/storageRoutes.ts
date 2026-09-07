import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { storage } from "../services/storageService.js";
import { ApiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export const router = Router();

// Authenticated image serving. Keys are server-generated UUID paths; this
// keeps package photos behind login (they are enforcement evidence).
router.get("/:key(*)", requireAuth, asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.key ?? "");
  if (!key.startsWith("images/")) throw ApiError.notFound();
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw ApiError.notFound();
  let buffer: Buffer;
  try {
    buffer = await storage.read(key);
  } catch {
    throw ApiError.notFound();
  }
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(buffer);
}));

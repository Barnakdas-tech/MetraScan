import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { canAccessInspection } from "../services/inspectionService.js";
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
  // Object-level authorization: the key must belong to an image on an
  // inspection this user may view (or be an inspection thumbnail/report the
  // same check covers via its image row).
  const img = await prisma.inspectionImage.findFirst({
    where: { OR: [{ storageKey: key }, { thumbnailKey: key }] },
    select: { inspection: { select: { id: true, inspectorId: true } } },
  });
  const report = img ? null : await prisma.report.findFirst({ where: { storageKey: key }, include: { inspection: true } });
  if (!img && !report) throw ApiError.notFound();
  const inspection = img ? img.inspection : report!.inspection;
  const access = canAccessInspection(req.user!, inspection);
  if (!access.canView) throw ApiError.notFound();
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

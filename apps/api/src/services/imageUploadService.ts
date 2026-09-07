import type { MulterFile } from "../middleware/upload.js";
import sharp from "sharp";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { storage } from "./storageService.js";
import { validateImage } from "./imageService.js";

export interface SavedImage {
  id: string;
  inspectionId: string;
  storageKey: string;
  thumbnailKey: string | null;
  thumbnailUrl: string | null;
  url: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  sequence: number;
  uploadStatus: string;
  createdAt: Date;
}

function toDto(img: { id: string; inspectionId: string; storageKey: string; thumbnailKey: string | null; originalFilename: string; mimeType: string; fileSize: number; width: number | null; height: number | null; sequence: number; uploadStatus: string; createdAt: Date }): SavedImage {
  return {
    ...img,
    url: storage.publicUrl(img.storageKey),
    thumbnailUrl: img.thumbnailKey ? storage.publicUrl(img.thumbnailKey) : null,
  };
}

/** Small JPEG thumbnail for fast grid rendering; the original file is never modified. */
async function makeThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).rotate().resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
}

/**
 * Validates and persists multiple images for an inspection. Files that fail
 * validation are reported per-file; valid ones are saved. All-or-nothing is
 * NOT applied so one bad file doesn't discard good captures.
 */
export async function uploadImages(
  inspectionId: string,
  files: MulterFile[]
): Promise<{ uploaded: SavedImage[]; failed: { originalFilename: string; reason: string }[] }> {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");

  const last = await prisma.inspectionImage.findFirst({
    where: { inspectionId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  let seq = (last?.sequence ?? 0) + 1;

  const uploaded: SavedImage[] = [];
  const failed: { originalFilename: string; reason: string }[] = [];

  for (const file of files) {
    try {
      const { extension, width, height } = await validateImage(file);
      const { storageKey } = await storage.save(file.buffer, file.mimetype, extension);
      // Thumbnail generation is best-effort: on failure the grid falls back to the original.
      let thumbnailKey: string | null = null;
      try {
        const thumb = await makeThumbnail(file.buffer);
        thumbnailKey = (await storage.save(thumb, "image/jpeg", ".jpg")).storageKey;
      } catch {
        thumbnailKey = null;
      }
      const img = await prisma.inspectionImage.create({
        data: {
          inspectionId,
          storageKey,
          thumbnailKey,
          originalFilename: file.originalname.slice(0, 255),
          mimeType: file.mimetype,
          fileSize: file.buffer.length,
          width,
          height,
          sequence: seq,
          uploadStatus: "UPLOADED",
        },
      });
      uploaded.push(toDto(img));
      seq += 1;
    } catch (err) {
      failed.push({ originalFilename: file.originalname.slice(0, 255), reason: err instanceof Error ? err.message : "Validation failed" });
    }
  }

  return { uploaded, failed };
}

export async function listImages(inspectionId: string): Promise<SavedImage[]> {
  const rows = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    orderBy: { sequence: "asc" },
    select: {
      id: true,
      inspectionId: true,
      storageKey: true,
      thumbnailKey: true,
      originalFilename: true,
      mimeType: true,
      fileSize: true,
      width: true,
      height: true,
      sequence: true,
      uploadStatus: true,
      createdAt: true,
    },
  });
  return rows.map(toDto);
}

export async function deleteImage(inspectionId: string, imageId: string): Promise<void> {
  const img = await prisma.inspectionImage.findFirst({ where: { id: imageId, inspectionId } });
  if (!img) throw ApiError.notFound("Image not found");
  await prisma.inspectionImage.delete({ where: { id: img.id } });
  await storage.delete(img.storageKey);
  // Close sequence gaps so ordering stays clean
  const remaining = await prisma.inspectionImage.findMany({
    where: { inspectionId },
    orderBy: { sequence: "asc" },
    select: { id: true },
  });
  await prisma.$transaction(
    remaining.map((r, i) => prisma.inspectionImage.update({ where: { id: r.id }, data: { sequence: i + 1 } }))
  );
}

export async function reorderImages(inspectionId: string, orderedIds: string[]): Promise<SavedImage[]> {
  const images = await prisma.inspectionImage.findMany({ where: { inspectionId }, select: { id: true } });
  const existing = new Set(images.map(i => i.id));
  const valid = orderedIds.filter(id => existing.has(id));
  if (valid.length !== images.length) {
    throw ApiError.badRequest("orderedIds must contain exactly the inspection's image ids");
  }
  await prisma.$transaction(
    valid.map((id, i) => prisma.inspectionImage.update({ where: { id }, data: { sequence: i + 1 } }))
  );
  return listImages(inspectionId);
}

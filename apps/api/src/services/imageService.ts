import sharp from "sharp";
import type { MulterFile } from "../middleware/upload.js";

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Deterministic image validation: correct declared MIME, non-empty, real
 * decodable image of an allowed type. Dimensions come from the decoded header.
 */
export async function validateImage(file: MulterFile): Promise<{
  extension: string;
  width: number;
  height: number;
}> {
  if (!file || file.buffer.length === 0) throw new Error("Image file is empty");
  const declared = (file.mimetype || "").toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES[declared];
  if (!extension) {
    throw new Error(`Unsupported file type '${declared || "unknown"}'. Allowed: JPEG, PNG, WEBP.`);
  }
  if (file.buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`File exceeds the 10 MB limit (${(file.buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  }

  // Decode with sharp: catches corrupt/truncated files and gives true dimensions.
  // rotate() with no args auto-applies EXIF orientation so width/height match
  // the browser's displayed dimensions and the AI service's OCR coordinates.
  let meta;
  try {
    meta = await sharp(file.buffer).rotate().metadata();
  } catch {
    throw new Error("File is not a valid, decodable image");
  }
  if (!meta.width || !meta.height) throw new Error("File is not a valid, decodable image");
  // Sniff-format mismatch check: declared JPEG must actually be JPEG, etc.
  const sniffed = meta.format;
  const expected = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[declared];
  if (sniffed !== expected) {
    throw new Error(`File content does not match its declared type (detected ${sniffed ?? "unknown"})`);
  }
  return { extension, width: meta.width, height: meta.height };
}

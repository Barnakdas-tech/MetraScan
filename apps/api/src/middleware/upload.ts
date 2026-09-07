import multer from "multer";
import { MAX_IMAGE_BYTES } from "../services/imageService.js";

export interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 8, fields: 10, parts: 12 },
});

/** Accepts up to 8 images under the "images" field. Files stay in memory for validation. */
export const uploadImages = upload.array("images", 8);

import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../utils/apiError.js";

/**
 * Storage abstraction. Local-disk implementation for development; the same
 * interface will be backed by S3-compatible object storage in production.
 */
export interface StorageProvider {
  save(buffer: Buffer, mimeType: string, extension: string): Promise<{ storageKey: string; sizeBytes: number }>;
  delete(storageKey: string): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  publicUrl(storageKey: string): string;
}

class LocalDiskStorage implements StorageProvider {
  private root: string;

  constructor(root: string) {
    this.root = path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
  }

  async save(buffer: Buffer, _mimeType: string, extension: string): Promise<{ storageKey: string; sizeBytes: number }> {
    // Safe filename: server-generated UUID only. User-supplied names are never used as keys.
    const storageKey = `images/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;
    const absPath = path.join(this.root, storageKey);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, buffer);
    return { storageKey, sizeBytes: buffer.byteLength };
  }

  async delete(storageKey: string): Promise<void> {
    // storageKey is always server-generated (images/YYYY-MM-DD/uuid.ext) — but
    // still normalize and refuse anything that tries to escape the storage root.
    const absPath = path.normalize(path.join(this.root, storageKey));
    if (!absPath.startsWith(this.root + path.sep)) throw ApiError.badRequest("Invalid storage key");
    await unlink(absPath).catch(() => undefined);
  }

  async read(storageKey: string): Promise<Buffer> {
    const absPath = path.normalize(path.join(this.root, storageKey));
    if (!absPath.startsWith(this.root + path.sep)) throw ApiError.badRequest("Invalid storage key");
    return readFile(absPath);
  }

  publicUrl(storageKey: string): string {
    return `/api/v1/storage/${encodeURIComponent(storageKey)}`;
  }
}

export const storage: StorageProvider = new LocalDiskStorage(env.STORAGE_PATH);

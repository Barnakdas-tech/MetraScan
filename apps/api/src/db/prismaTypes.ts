// Central re-export of generated Prisma types (single source of truth for the app).
export type { Role, Prisma, InspectionStatus, PackageType, ValidationStatus, UploadStatus } from "../generated/prisma/index.js";

/** Status values a human reviewer may set (subset of ValidationStatus). */
export const HUMAN_STATUS_VALUES = ["PASS", "FAIL", "REVIEW", "MANUAL_REQUIRED"] as const;

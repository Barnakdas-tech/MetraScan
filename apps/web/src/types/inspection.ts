export type Role = "ADMIN" | "INSPECTOR" | "REVIEWER" | "VIEWER";

export interface Inspection {
  id: string;
  inspectionNumber: string;
  status: "DRAFT" | "PROCESSING" | "COMPLETED" | "UNDER_REVIEW" | "CLOSED";
  inspectorId: string | null;
  productId: string | null;
  packageType: "RETAIL" | "WHOLESALE" | "IMPORTED" | "UNKNOWN";
  intendedConsumer: "RETAIL" | "INDUSTRIAL" | "INSTITUTIONAL" | "UNKNOWN";
  inspectionDate: string;
  year: number;
  location: string | null;
  notes: string | null;
  overallResult: string | null;
  isDemo?: boolean;
  demoLabel?: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { id: string; name: string; brand: string | null } | null;
  inspector?: { id: string; name: string } | null;
}

export interface InspectionImage {
  id: string;
  inspectionId: string;
  storageKey: string;
  url: string;
  thumbnailUrl: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  sequence: number;
  uploadStatus: "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED";
  createdAt: string;
}

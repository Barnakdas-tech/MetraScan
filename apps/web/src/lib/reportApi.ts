import { api } from "./api";

export interface ReportSummary {
  passed: number;
  failed: number;
  review: number;
  manual: number;
}

export interface HistoricalReport {
  reportId: string;
  inspectionId: string;
  inspectionNumber: string;
  inspectionDate: string;
  createdAt: string;
  productName: string | null;
  productCategory: string | null;
  overallResult: "PASS" | "FAIL" | "REVIEW" | "NOT_APPLICABLE" | "MANUAL_REQUIRED" | null;
  summary: ReportSummary;
}

export async function getReports(): Promise<HistoricalReport[]> {
  const { data } = await api.get<{ data: HistoricalReport[] }>("/reports");
  return data.data;
}

// Download PDF is typically handled by setting window.location.href to the backend URL, 
// or fetching it as a blob. The existing implementation might be downloading it.
// Let's check how the UI currently downloads the PDF.

import { api } from "./api";
import type { Inspection, InspectionImage } from "../types/inspection";

interface Envelope<T> { success: boolean; data: T }

export interface CreateInspectionInput {
  packageType: "RETAIL" | "WHOLESALE" | "IMPORTED" | "UNKNOWN";
  intendedConsumer?: string;
  inspectionDate?: string;
  location?: string;
  notes?: string;
  product?: {
    name: string;
    genericName?: string;
    brand?: string;
    manufacturer?: string;
    category?: string;
  };
}

export async function createInspection(payload: CreateInspectionInput): Promise<Inspection> {
  const res = await api.post<Envelope<Inspection>>("/inspections", payload);
  return res.data.data;
}

export async function getInspection(id: string): Promise<Inspection> {
  const res = await api.get<Envelope<Inspection>>("/inspections/" + id);
  return res.data.data;
}

export async function listInspections(): Promise<Inspection[]> {
  const res = await api.get<Envelope<Inspection[]>>("/inspections");
  return res.data.data;
}

export async function uploadImages(
  inspectionId: string,
  files: File[]
): Promise<{ uploaded: InspectionImage[]; failed: { originalFilename: string; reason: string }[] }> {
  const form = new FormData();
  for (const f of files) form.append("images", f);
  const res = await api.post<Envelope<{ uploaded: InspectionImage[]; failed: { originalFilename: string; reason: string }[] }>>(
    "/inspections/" + inspectionId + "/images",
    form
  );
  return res.data.data;
}

export async function listImages(inspectionId: string): Promise<InspectionImage[]> {
  const res = await api.get<Envelope<InspectionImage[]>>("/inspections/" + inspectionId + "/images");
  return res.data.data;
}

export async function deleteImage(inspectionId: string, imageId: string): Promise<void> {
  await api.delete("/inspections/" + inspectionId + "/images/" + imageId);
}

export async function reorderImages(inspectionId: string, orderedIds: string[]): Promise<InspectionImage[]> {
  const res = await api.patch<Envelope<InspectionImage[]>>("/inspections/" + inspectionId + "/images/reorder", { orderedIds });
  return res.data.data;
}

import type { AnalysisResult, AnalyzeSummary } from "../types/analysis";

export async function analyzeInspection(inspectionId: string): Promise<AnalyzeSummary> {
  const res = await api.post<Envelope<AnalyzeSummary>>("/inspections/" + inspectionId + "/analyze");
  return res.data.data;
}

export async function getAnalysis(inspectionId: string): Promise<AnalysisResult> {
  const res = await api.get<Envelope<AnalysisResult>>("/inspections/" + inspectionId + "/analysis");
  return res.data.data;
}

import type { DeclarationsResponse, ExtractionResult, Declaration } from "../types/declarations";
import type { ApplicabilityResult } from "../types/applicability";
import type { ComplianceResult } from "../types/compliance";
import type { ReviewHistory } from "../types/review";
import type { StoredValidationResult, StoredViolation } from "../types/review";

export async function extractDeclarations(inspectionId: string): Promise<ExtractionResult> {
  const res = await api.post<Envelope<ExtractionResult>>("/inspections/" + inspectionId + "/declarations/extract");
  return res.data.data;
}

export async function getDeclarations(inspectionId: string): Promise<DeclarationsResponse> {
  const res = await api.get<Envelope<DeclarationsResponse>>("/inspections/" + inspectionId + "/declarations");
  return res.data.data;
}

export async function correctDeclaration(
  inspectionId: string,
  declarationId: string,
  payload: { correctedValue: string | null; correctionNote: string | null }
): Promise<Declaration> {
  const res = await api.patch<Envelope<Declaration>>(
    "/inspections/" + inspectionId + "/declarations/" + declarationId,
    payload
  );
  return res.data.data;
}

export async function getApplicability(inspectionId: string): Promise<ApplicabilityResult> {
  const res = await api.get<Envelope<ApplicabilityResult>>("/inspections/" + inspectionId + "/applicability");
  return res.data.data;
}

export async function runCompliance(inspectionId: string): Promise<ComplianceResult> {
  const res = await api.post<Envelope<ComplianceResult>>("/inspections/" + inspectionId + "/compliance");
  return res.data.data;
}

export async function submitReview(
  inspectionId: string,
  payload: { action: string; targetId?: string; newValue?: string | null; comment?: string | null; ruleId?: string }
): Promise<{ ok: boolean; action: string; oldValue: string | null; newValue: string | null }> {
  const res = await api.post<Envelope<{ ok: boolean; action: string; oldValue: string | null; newValue: string | null }>>(
    "/inspections/" + inspectionId + "/review",
    payload
  );
  return res.data.data;
}

export async function getReviewHistory(inspectionId: string): Promise<ReviewHistory> {
  const res = await api.get<Envelope<ReviewHistory>>("/inspections/" + inspectionId + "/review");
  return res.data.data;
}

export async function getCompliance(inspectionId: string): Promise<{
  inspectionId: string;
  results: StoredValidationResult[];
  violations: StoredViolation[];
  overallResult: string | null;
}> {
  const res = await api.get<Envelope<{
    inspectionId: string;
    results: StoredValidationResult[];
    violations: StoredViolation[];
    overallResult: string | null;
  }>>("/inspections/" + inspectionId + "/compliance");
  return res.data.data;
}

export async function generateReport(inspectionId: string): Promise<{ id: string; inspectionId: string }> {
  const res = await api.post<Envelope<{ id: string; inspectionId: string }>>("/inspections/" + inspectionId + "/report");
  return res.data.data;
}

import type { DashboardSummary, RecentInspection, DashboardViolation, Trends, HistoryResponse, ProductsResponse } from "../types/dashboard";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await api.get<Envelope<DashboardSummary>>("/dashboard/summary");
  return res.data.data;
}

export async function getDashboardRecent(): Promise<RecentInspection[]> {
  const res = await api.get<Envelope<RecentInspection[]>>("/dashboard/recent");
  return res.data.data;
}

export async function getDashboardViolations(): Promise<DashboardViolation[]> {
  const res = await api.get<Envelope<DashboardViolation[]>>("/dashboard/violations");
  return res.data.data;
}

export async function getTrends(): Promise<Trends> {
  const res = await api.get<Envelope<Trends>>("/dashboard/trends");
  return res.data.data;
}

export async function getInspectionHistory(params: Record<string, string>): Promise<HistoryResponse> {
  const res = await api.get<Envelope<HistoryResponse>>("/inspections", { params });
  return res.data.data;
}

export async function listProducts(params: Record<string, string>): Promise<ProductsResponse> {
  const res = await api.get<Envelope<ProductsResponse>>("/products", { params });
  return res.data.data;
}

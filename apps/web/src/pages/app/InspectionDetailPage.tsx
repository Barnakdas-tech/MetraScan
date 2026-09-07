import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LoadingState from "../../components/ui/LoadingState";
import ImageDropzone from "../../components/ImageDropzone";
import ImageViewer from "../../components/ImageViewer";
import OcrViewer from "../../components/OcrViewer";
import DeclarationsPanel from "../../components/DeclarationsPanel";
import ApplicableRulesPanel from "../../components/ApplicableRulesPanel";
import CompliancePanel from "../../components/CompliancePanel";
import { getInspection, listImages, uploadImages, deleteImage, reorderImages, analyzeInspection, getAnalysis } from "../../lib/inspectionApi";
import { getErrorMessage, downloadAuthenticatedFile } from "../../lib/api";
import type { Inspection, InspectionImage } from "../../types/inspection";
import type { AnalysisResult } from "../../types/analysis";
import type { DeclarationsResponse } from "../../types/declarations";
import type { ApplicabilityResult } from "../../types/applicability";
import type { ComplianceResult } from "../../types/compliance";
import type { ReviewHistory } from "../../types/review";
import { extractDeclarations, getDeclarations, getApplicability, runCompliance, getReviewHistory, getCompliance, generateReport } from "../../lib/inspectionApi";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function InspectionDetailPage() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [images, setImages] = useState<InspectionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<{ originalFilename: string; reason: string }[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [declarations, setDeclarations] = useState<DeclarationsResponse | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [applicability, setApplicability] = useState<ApplicabilityResult | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [runningCompliance, setRunningCompliance] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportReady, setReportReady] = useState<{ id: string } | null>(null);
  const [reviewHistory, setReviewHistory] = useState<ReviewHistory | null>(null);
  const [storedResults, setStoredResults] = useState<import("../../types/review").StoredValidationResult[]>([]);

  const applyComplianceData = (complianceData: any) => {
    if (complianceData && complianceData.results) setStoredResults(complianceData.results);
    if (complianceData && complianceData.results.length > 0) {
      const rs = complianceData.results;
      const counts = { applicableChecked: 0, passed: 0, failed: 0, review: 0, manualRequired: 0, notApplicable: 0 };
      for (const r of rs) {
        const effectiveStatus = r.humanStatus ?? r.status;
        counts.applicableChecked += 1;
        if (effectiveStatus === "PASS") counts.passed += 1;
        else if (effectiveStatus === "FAIL") counts.failed += 1;
        else if (effectiveStatus === "REVIEW") counts.review += 1;
        else if (effectiveStatus === "MANUAL_REQUIRED") counts.manualRequired += 1;
        else counts.notApplicable += 1;
      }
      const verdict =
        complianceData.overallResult === "PASS" ? "COMPLIANT"
        : complianceData.overallResult === "FAIL" ? "NON_COMPLIANT"
        : "REVIEW_REQUIRED";
      setCompliance({
        verdict,
        results: rs.map((r: any) => ({
          ruleId: r.ruleId,
          status: r.status,
          confidence: r.confidence,
          reason: r.reason,
          evidence: r.evidence,
          inputs: (r.inputs as Record<string, unknown>) ?? {},
          validatorVersion: r.validatorVersion ?? "",
          source: r.source ?? undefined,
        })),
        summary: counts,
        note: "Restored from stored compliance results. Re-run the check to recompute.",
      });
    }
  };

  const load = useCallback(async () => {
    if (!inspectionId) return;
    setLoading(true);
    setError(null);
    try {
      const [insp, imgs, analysisData, declarationsData, applicabilityData, reviewHistoryData, storedComplianceData] = await Promise.all([
        getInspection(inspectionId),
        listImages(inspectionId),
        getAnalysis(inspectionId).catch(() => null as AnalysisResult | null),
        getDeclarations(inspectionId).catch(() => null as DeclarationsResponse | null),
        getApplicability(inspectionId).catch(() => null as ApplicabilityResult | null),
        getReviewHistory(inspectionId).catch(() => null as ReviewHistory | null),
        getCompliance(inspectionId).catch(() => null),
      ]);
      if (reviewHistoryData) setReviewHistory(reviewHistoryData);
      applyComplianceData(storedComplianceData);
      setInspection(insp);
      setImages(imgs);
      if (analysisData) setAnalysis(analysisData);
      if (declarationsData) setDeclarations(declarationsData);
      if (applicabilityData) setApplicability(applicabilityData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFiles = async (files: File[]) => {
    if (!inspectionId) return;
    setUploading(true);
    setUploadErrors([]);
    try {
      const result = await uploadImages(inspectionId, files);
      setImages(prev => {
        const map = new Map(prev.map(i => [i.id, i]));
        for (const img of result.uploaded) map.set(img.id, img);
        return Array.from(map.values()).sort((a, b) => a.sequence - b.sequence);
      });
      setUploadErrors(result.failed);
    } catch (err) {
      setUploadErrors([{ originalFilename: files[0]?.name ?? "upload", reason: getErrorMessage(err) }]);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!inspectionId) return;
    setImages(prev => prev.filter(i => i.id !== imageId));
    try {
      await deleteImage(inspectionId, imageId);
      const fresh = await listImages(inspectionId);
      setImages(fresh);
    } catch (err) {
      setError(getErrorMessage(err));
      void load();
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...images];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    try {
      const saved = await reorderImages(inspectionId!, next.map(i => i.id));
      setImages(saved);
    } catch {
      void load();
    }
  };

  const handleAnalyze = async () => {
    if (!inspectionId) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await analyzeInspection(inspectionId);
      const fresh = await getAnalysis(inspectionId);
      setAnalysis(fresh);
      // Also refresh inspection status (PROCESSING -> COMPLETED)
      const insp = await getInspection(inspectionId);
      setInspection(insp);
    } catch (err) {
      setAnalyzeError(getErrorMessage(err));
     } finally {
      setAnalyzing(false);
    }
  };

  const handleExtract = async () => {
    if (!inspectionId) return;
    setExtracting(true);
    setExtractError(null);
    try {
      await extractDeclarations(inspectionId);
      setDeclarations(await getDeclarations(inspectionId));
      setApplicability(await getApplicability(inspectionId));
    } catch (err) {
      setExtractError(getErrorMessage(err));
    } finally {
      setExtracting(false);
    }
  };

  const handleRunCompliance = async () => {
    if (!inspectionId) return;
    setRunningCompliance(true);
    setComplianceError(null);
    try {
      await runCompliance(inspectionId);
      const fresh = await getCompliance(inspectionId);
      applyComplianceData(fresh);
      const insp = await getInspection(inspectionId);
      setInspection(insp);
    } catch (err) {
      setComplianceError(getErrorMessage(err));
    } finally {
      setRunningCompliance(false);
    }
  };


  const handleGenerateReport = async () => {
    if (!inspectionId) return;
    setGeneratingReport(true);
    try {
      setReportReady(await generateReport(inspectionId));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!inspection || !reportReady) return;
    await downloadAuthenticatedFile(
      "/reports/" + reportReady.id + "/download",
      inspection.inspectionNumber + "-compliance-report.pdf",
    );
  };

  if (loading && !inspection) return <LoadingState label="Loading inspection..." />;
  if (error && !inspection) return <ErrorState message={error} retry={load} />;
  if (!inspection) return null;

  return (
    <div>
      <PageHeader
        title={inspection.inspectionNumber}
        description={`${inspection.product?.name ?? "Unidentified product"} · ${formatDate(inspection.inspectionDate)}`}
        actions={
          <div className="flex items-center gap-2">
            {inspection.isDemo && <Badge tone="warning">DEMO DATA</Badge>}
            <Badge tone="info">{inspection.status}</Badge>
            <Button
              variant="secondary"
              onClick={handleGenerateReport}
              isLoading={generatingReport}
              disabled={!compliance || inspection.status !== "COMPLETED"}
            >
              Generate Report
            </Button>
            {reportReady && (
              <Button onClick={handleDownloadReport}>Download PDF</Button>
            )}
          </div>
        }
      />

      <div className="mx-auto mt-6 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          <Card title="Inspection metadata" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Status</dt>
              <dd className="text-right font-medium text-slate-800">{inspection.status}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Package type</dt>
              <dd className="text-right font-medium text-slate-800">{inspection.packageType}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Intended consumer</dt>
              <dd className="text-right font-medium text-slate-800">{inspection.intendedConsumer}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Date</dt>
              <dd className="text-right font-medium text-slate-800">{formatDate(inspection.inspectionDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Location</dt>
              <dd className="text-right font-medium text-slate-800">{inspection.location ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Inspector</dt>
              <dd className="text-right font-medium text-slate-800">{inspection.inspector?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Product</dt>
              <dd className="text-right font-medium text-slate-800">
                {inspection.product ? `${inspection.product.name}${inspection.product.brand ? ` (${inspection.product.brand})` : ""}` : "—"}
              </dd>
            </div>
          </dl>
          {inspection.notes && (
            <p className="mt-4 border-t border-surface-border pt-3 text-sm text-slate-600">{inspection.notes}</p>
          )}
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {/* Analyze + quality + OCR */}
          <Card
            title="AI analysis (quality + OCR)"
            actions={
              <Button onClick={handleAnalyze} isLoading={analyzing} disabled={images.length === 0 || uploading}>
                {analyzing ? "Analyzing…" : "Run analysis"}
              </Button>
            }
          >
            {analyzeError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{analyzeError}</span>
                <Button variant="secondary" size="sm" onClick={handleAnalyze} isLoading={analyzing}>
                  Retry
                </Button>
              </div>
            )}
            <p className="text-xs leading-relaxed text-slate-500">
              Runs image-quality checks and OCR for every uploaded image. Results are <span className="font-medium">AI observations
              only</span> — quality PASS/WARNING/FAIL describes the photograph, not legal compliance. No legal validation
              happens in this phase.
            </p>
            {analysis && (
              <div className="mt-3 space-y-4">
                {analysis.images.map(aimg => (
                  <div key={aimg.id} className="rounded-md border border-surface-border p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium text-slate-700">#{aimg.sequence} · {aimg.originalFilename}</span>
                      {aimg.qualityScore !== null && (
                        <Badge tone={aimg.qualityStatus === "PASS" ? "success" : aimg.qualityStatus === "WARNING" ? "warning" : "danger"}>
                          Quality {aimg.qualityStatus} · {aimg.qualityScore}/100
                        </Badge>
                      )}
                      {aimg.ocrStatus && (
                        <Badge tone={aimg.ocrStatus === "COMPLETED" ? "success" : aimg.ocrStatus === "FAILED" ? "danger" : "default"}>
                          OCR {aimg.ocrStatus}
                        </Badge>
                      )}
                    </div>
                    <OcrViewer
                      image={aimg}
                      url={images.find(i => i.id === aimg.id)?.url ?? ""}
                    />
                  </div>
                ))}
              </div>
           )}
          </Card>

          <Card title="Applicable rules">
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Deterministic legal-applicability analysis: <span className="font-medium">which provisions must be checked</span> for
              this inspection, with a source-cited explanation for every decision. This is not a compliance verdict.
            </p>
            {applicability ? (
              <ApplicableRulesPanel result={applicability} />
            ) : (
              <p className="rounded-md border border-dashed border-surface-border px-4 py-8 text-center text-sm text-slate-500">
                Applicability loads with the inspection context.
              </p>
            )}
          </Card>

          <Card
            title="Detected declarations"
            actions={
              <Button onClick={handleExtract} isLoading={extracting} disabled={!analysis || analyzing}>
                {extracting ? "Extracting…" : "Extract declarations"}
              </Button>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Field detection is an <span className="font-medium">AI observation with evidence</span> — detected does NOT
              mean legally compliant. Deterministic parsing (MRP, quantity, phone, email, dates) runs on OCR output;
              every declaration keeps its source image, bounding box, and OCR regions.
            </p>
            {extractError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{extractError}</span>
                <Button variant="secondary" size="sm" onClick={handleExtract} isLoading={extracting}>Retry</Button>
              </div>
            )}
            {declarations && declarations.classification && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-600">Product classification:</span>
                <Badge tone="info">{declarations.classification.category ?? "unknown"}</Badge>
                {declarations.classification.confidence !== null && (
                  <span className="text-slate-400">
                    {Math.round(declarations.classification.confidence * 100)}% confidence
                    {declarations.classification.confidence < 0.55 && " (uncertain — low signal)"}
                  </span>
                )}
              </div>
            )}
            {declarations && declarations.declarations.length > 0 ? (
              <DeclarationsPanel
                inspectionId={inspectionId!}
                declarations={declarations.declarations}
                images={images}
                onChanged={async () => setDeclarations(await getDeclarations(inspectionId!))}
              />
            ) : (
              <p className="rounded-md border border-dashed border-surface-border px-4 py-8 text-center text-sm text-slate-500">
                {analysis
                  ? "No declarations extracted yet — run extraction to convert OCR text into structured fields."
                  : "Run analysis first — extraction works on OCR results."}
              </p>
            )}
          </Card>

          <Card
            title="Package images"
            actions={
              <Badge tone={uploading ? "warning" : "default"}>
                {uploading ? "Uploading" : `${images.length} image${images.length === 1 ? "" : "s"}`}
              </Badge>
            }
          >
            <div className="mb-4 rounded-md border border-brand/30 bg-brand-light px-3.5 py-2.5 text-xs leading-relaxed text-brand-dark">
              <span className="font-semibold">Recommended captures:</span> 1) Front / main label · 2) Back label · 3)
              Side, bottom, or top label if relevant. A package may need more or fewer images — capture every panel
              bearing declarations.
            </div>
            <ImageDropzone onFiles={handleFiles} disabled={uploading} />
            {uploading && (
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-surface-border border-t-brand" />
                Uploading images...
              </div>
            )}
            {uploadErrors.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {uploadErrors.map((f, i) => (
                  <div key={i} className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span className="font-medium">{f.originalFilename}</span>: {f.reason}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Compliance results"
            actions={
              <div className="flex items-center gap-2">
                <Button onClick={handleRunCompliance} isLoading={runningCompliance} disabled={!analysis}>
                  {runningCompliance ? "Validating…" : "Run compliance check"}
                </Button>
                <Button variant="secondary" onClick={handleGenerateReport} isLoading={generatingReport} disabled={!analysis}>
                  {generatingReport ? "Generating…" : "Generate report"}
                </Button>
              </div>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              Deterministic validation of extracted declarations against the applicable provisions. AI supplied
              the observations; every PASS/FAIL/REVIEW below is computed by rule code. Physical checks (font
              sizes, spacing, contrast) return MANUAL_REQUIRED — they need calibrated instruments.
            </p>
            {complianceError && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                <span>{complianceError}</span>
                <Button variant="secondary" size="sm" onClick={handleRunCompliance} isLoading={runningCompliance}>Retry</Button>
              </div>
            )}
            {compliance ? (
              <CompliancePanel
                result={compliance}
                inspectionId={inspectionId!}
                declarations={declarations?.declarations ?? []}
                images={images}
                storedResults={storedResults}
                onReviewed={async () => {
                  setReviewHistory(await getReviewHistory(inspectionId!));
                  const fresh = await getCompliance(inspectionId!);
                  applyComplianceData(fresh);
                }}
              />
            ) : (
              <p className="rounded-md border border-dashed border-surface-border px-4 py-8 text-center text-sm text-slate-500">
                Run the compliance check to validate detected declarations against applicable rules.
              </p>
            )}
            {reportReady && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <span>Report generated.</span>
                <Button variant="secondary" size="sm" onClick={handleDownloadReport}>
                  Download PDF
                </Button>
              </div>
            )}
          </Card>

          <Card title="Review history">
            {reviewHistory && reviewHistory.reviews.length > 0 ? (
              <div className="space-y-2">
                {reviewHistory.reviews.map(r => (
                  <div key={r.id} className="rounded-md border border-surface-border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">{r.decision.replace("_", " ")}</Badge>
                      {r.ruleId && <span className="text-xs font-medium text-slate-600">{r.ruleId}</span>}
                      <span className="text-xs text-slate-400">
                        {r.reviewer?.name ?? "Unknown"} · {new Date(r.createdAt).toLocaleString("en-IN")}
                      </span>
                    </div>
                    {(r.oldValue || r.newValue) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {r.oldValue ?? "—"} → {r.newValue ?? "—"}
                      </p>
                    )}
                    {r.notes && <p className="mt-1 text-xs text-slate-600">“{r.notes}”</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-surface-border px-4 py-6 text-center text-sm text-slate-500">
                No review actions recorded yet. Open any compliance result to review it.
              </p>
            )}
          </Card>

          <Card title="Uploaded images">
            {images.length === 0 ? (
              <EmptyState
                icon="⧉"
                title="No images yet"
                description="Upload photographs of the package panels bearing mandatory declarations."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {images.map((img, idx) => (
                  <div key={img.id} className="space-y-2 rounded-md border border-surface-border p-3">
                      <ImageViewer
                      src={img.thumbnailUrl || img.url}
                      zoomSrc={img.url}
                      alt={img.originalFilename}
                      caption={`${img.sequence} · ${img.originalFilename} · ${formatBytes(img.fileSize)}${img.width ? ` · ${img.width}×${img.height}` : ""}`}
                    />
                    <div className="flex items-center justify-between">
                      <Badge tone="success">{img.uploadStatus}</Badge>
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" onClick={() => move(idx, -1)} disabled={idx === 0}>←</Button>
                        <Button variant="ghost" size="sm" onClick={() => move(idx, 1)} disabled={idx === images.length - 1}>→</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(img.id)}>Delete</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Pipeline status">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-md border border-surface-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Uploads</p>
                  <p className="mt-1 text-slate-700">
                    {images.length === 0
                      ? "No images yet"
                      : images.filter((i) => i.uploadStatus === "UPLOADED").length + " of " + images.length + " uploaded"}
                  </p>
                </div>
                <div className="rounded-md border border-surface-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Quality check</p>
                  <p className="mt-1 text-slate-700">
                    {analysis?.images.filter((i) => i.qualityStatus).length ?? 0} of {images.length} checked
                  </p>
                </div>
                <div className="rounded-md border border-surface-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">OCR</p>
                  <p className="mt-1 text-slate-700">
                    {analysis?.images.filter((i) => i.ocrStatus === "COMPLETED").length ?? 0} of {images.length} completed
                  </p>
                </div>
                <div className="rounded-md border border-surface-border p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Declarations</p>
                  <p className="mt-1 text-slate-700">
                    {declarations?.declarations.length ?? 0} extracted
                  </p>
                </div>
              </div>
              {analysis && analysis.images.some((i) => i.ocrStatus === "FAILED") && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  One or more images failed OCR processing. Check the AI analysis section above for details.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
    </div>
  );
}

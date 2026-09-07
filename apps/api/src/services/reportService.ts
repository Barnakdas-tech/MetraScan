import PDFDocument from "pdfkit";
import { readFileSync } from "node:fs";
import { prisma } from "../db/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { canAccessInspection } from "./inspectionService.js";
import { storage } from "./storageService.js";
import { audit } from "./auditService.js";
import path from "node:path";
import { env } from "../config/env.js";

const BRAND_BLUE = "#0f4c81";
const SLATE = "#475569";
const RED = "#b91c1c";
const AMBER = "#b45309";
const GREEN = "#15803d";

const STATUS_LABELS: Record<string, string> = {
  PASS: "PASS",
  FAIL: "FAIL",
  REVIEW: "REVIEW",
  NOT_APPLICABLE: "NOT APPLICABLE",
  MANUAL_REQUIRED: "MANUAL REQUIRED",
};

export async function listReports(user: { sub: string; role: string }) {
  const scope = user.role === "INSPECTOR" ? { inspectorId: user.sub } : {};
  
  const reports = await prisma.report.findMany({
    where: {
      inspection: scope
    },
    orderBy: { createdAt: "desc" },
    include: {
      inspection: {
        include: {
          product: { select: { name: true, category: true } },
          results: { select: { status: true, humanStatus: true } }
        }
      }
    }
  });

  return reports.map(r => {
    let passed = 0;
    let failed = 0;
    let review = 0;
    let manual = 0;
    
    for (const res of r.inspection.results) {
      const effective = res.humanStatus ?? res.status;
      if (effective === "PASS") passed += 1;
      else if (effective === "FAIL") failed += 1;
      else if (effective === "REVIEW") review += 1;
      else if (effective === "MANUAL_REQUIRED") manual += 1;
    }

    return {
      reportId: r.id,
      inspectionId: r.inspection.id,
      inspectionNumber: r.inspection.inspectionNumber,
      inspectionDate: r.inspection.inspectionDate,
      createdAt: r.createdAt,
      productName: r.inspection.product?.name ?? null,
      productCategory: r.inspection.product?.category ?? null,
      overallResult: r.inspection.overallResult,
      summary: { passed, failed, review, manual }
    };
  });
}

async function requireReportAccess(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await prisma.inspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw ApiError.notFound("Inspection not found");
  const access = canAccessInspection(user, inspection);
  if (!access.canView) throw ApiError.notFound("Inspection not found");
  return inspection;
}

/** Generates and persists a professional compliance report PDF for the inspection. */
export async function generateReport(inspectionId: string, user: { sub: string; role: string }) {
  const inspection = await requireReportAccess(inspectionId, user);

  // Gather all report data in one pass
  const [product, images, declarations, validationResults, violations, reviews, inspector] =
    await Promise.all([
      inspection.productId ? prisma.product.findUnique({ where: { id: inspection.productId } }) : null,
      prisma.inspectionImage.findMany({ where: { inspectionId }, orderBy: { sequence: "asc" } }),
      prisma.declaration.findMany({ where: { inspectionId }, orderBy: { field: "asc" } }),
      prisma.validationResult.findMany({ where: { inspectionId }, orderBy: { createdAt: "asc" } }),
      prisma.violation.findMany({ where: { inspectionId } }),
      prisma.review.findMany({ where: { inspectionId }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true } } } }),
      prisma.user.findUnique({ where: { id: inspection.inspectorId ?? "" }, select: { name: true } }),
    ]);

  const summary = summarize(validationResults);

  // Build PDF into a buffer
  const pdfBuffer = await buildPdf({
    inspectionNumber: inspection.inspectionNumber,
    inspectionDate: inspection.inspectionDate,
    inspectorName: inspector?.name ?? "Unknown",
    location: inspection.location ?? "Not specified",
    packageType: inspection.packageType,
    product,
    images,
    declarations,
    validationResults,
    violations,
    reviews,
    summary,
  });

  // Persist via storage abstraction
  const { storageKey } = await storage.save(pdfBuffer, "application/pdf", ".pdf");

  const report = await prisma.report.create({
    data: {
      inspectionId,
      generatedById: user.sub,
      format: "PDF",
      storageKey,
    },
  });

  await audit({ id: user.sub, role: user.role as never }, "REPORT_GENERATED", "Report", report.id, { inspectionId });

  return { id: report.id, inspectionId, storageKey, createdAt: report.createdAt };
}

function summarize(results: { status: string; humanStatus: string | null }[]) {
  const counts = { passed: 0, failed: 0, review: 0, manual: 0, notApplicable: 0 };
  for (const r of results) {
    const effective = r.humanStatus ?? r.status;
    if (effective === "PASS") counts.passed += 1;
    else if (effective === "FAIL") counts.failed += 1;
    else if (effective === "REVIEW") counts.review += 1;
    else if (effective === "MANUAL_REQUIRED") counts.manual += 1;
    else counts.notApplicable += 1;
  }
  return counts;
}

interface ReportData {
  inspectionNumber: string;
  inspectionDate: Date;
  inspectorName: string;
  location: string;
  packageType: string;
  product: { name: string; brand: string | null; category: string | null; manufacturer: string | null; genericName: string | null } | null;
  images: { id: string; originalFilename: string; storageKey: string; sequence: number }[];
  declarations: { field: string; rawText: string; normalizedValue: string | null; correctedValue: string | null; unit: string | null; extractionConfidence: number | null }[];
  validationResults: { ruleId: string; status: string; confidence: number; reason: string; humanStatus: string | null; humanComment: string | null; source: string | null }[];
  violations: { ruleId: string; description: string }[];
  reviews: { decision: string; notes: string | null; oldValue: string | null; newValue: string | null; createdAt: Date; reviewer: { name: string } | null }[];
  summary: { passed: number; failed: number; review: number; manual: number; notApplicable: number };
}

function buildPdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 48, right: 48 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const pageW = doc.page.width;
    const L = 48;
    const R = pageW - 48;
    const contentW = R - L;

    // ---------- Header (first page) ----------
    doc.rect(0, 0, pageW, 6).fill(BRAND_BLUE);

    // Branding block
    doc.fillColor(BRAND_BLUE).font("Helvetica-Bold").fontSize(20).text("MetraScan", L, 40, { continued: false });
    doc.fillColor(SLATE).font("Helvetica").fontSize(9).text("AI-assisted Legal Metrology Inspection Platform", L, 62);
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#0f172a").text("Automated Compliance Screening Report", L, 84);
    doc.fontSize(8).fillColor(SLATE).text("Legal Metrology (Packaged Commodities) Rules, 2011", L, 102);
    doc.moveTo(L, 116).lineTo(R, 116).lineWidth(1).strokeColor("#e2e5ea").stroke();
    doc.y = 126;
    // Footer note at the bottom of the cover info (kept simple; auto-pagination handles the rest)

    // ---------- Inspection summary ----------
    section(doc, "Inspection Summary");
    const summaryRows: [string, string][] = [
      ["Inspection Number", data.inspectionNumber],
      ["Inspection Date", data.inspectionDate.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })],
      ["Inspector", data.inspectorName],
      ["Location", data.location],
      ["Package Type", data.packageType],
      ["Product", data.product ? data.product.name + (data.product.brand ? " (" + data.product.brand + ")" : "") : "Not specified"],
      ["Product Category", data.product?.category ?? "Unknown"],
      ["Origin", data.packageType === "IMPORTED" ? "Imported" : "Domestic"],
    ];
    table(doc, summaryRows, contentW);
    gap(doc, 10);

    // ---------- Compliance summary ----------
    section(doc, "Automated Compliance Screening Summary");
    const anyFail = data.summary.failed > 0;
    const verdictText = anyFail ? "NON-COMPLIANT (automated screening)" : data.summary.review + data.summary.manual > 0 ? "REVIEW REQUIRED" : "COMPLIANT (automated screening)";
    doc.font("Helvetica-Bold").fontSize(10).fillColor(anyFail ? RED : data.summary.review + data.summary.manual > 0 ? AMBER : GREEN);
    doc.text("Screening result: " + verdictText, L, doc.y, { width: contentW });
    doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
    doc.text(
      data.summary.passed + " checks passed · " +
      data.summary.failed + " failed · " +
      data.summary.review + " require review · " +
      data.summary.manual + " require manual inspection · " +
      data.summary.notApplicable + " not applicable",
      L, doc.y + 4, { width: contentW }
    );
    gap(doc, 8);
    doc.fillColor(SLATE).fontSize(8.5).font("Helvetica-Oblique");
    doc.text(
      "This is an automated compliance screening result produced by deterministic rule-engine code from AI-extracted observations. It is NOT a legal certification. The final determination is subject to authorized inspection and review by a Legal Metrology Officer.",
      L, doc.y + 2, { width: contentW }
    );
    doc.fillColor("#0f172a").font("Helvetica");
    gap(doc, 12);

    // ---------- Declarations ----------
    section(doc, "Extracted Declarations (AI observations)");
    if (data.declarations.length === 0) {
      para(doc, "No declarations extracted.", SLATE);
    } else {
      const declRows: [string, string][] = data.declarations.map(d => {
        const val = d.correctedValue ?? d.normalizedValue ?? "—";
        const unit = d.unit ? " " + d.unit : "";
        const conf = d.extractionConfidence !== null ? Math.round(d.extractionConfidence * 100) + "%" : "—";
        return [d.field, val + unit + (d.correctedValue ? " (corrected)" : "") + "  ·  " + conf];
      });
      table(doc, declRows, contentW, true);
    }
    gap(doc, 12);
    // ---------- Compliance checks ----------
    section(doc, "Compliance Checks (AI screening + human decisions)");
    const checkRows: [string, string][] = data.validationResults.map(r => {
      const ai = STATUS_LABELS[r.status] ?? r.status;
      const human = r.humanStatus ? " -> Human: " + (STATUS_LABELS[r.humanStatus] ?? r.humanStatus) : "";
      const conf = Math.round(r.confidence * 100) + "%";
      return [r.ruleId, ai + human + "  ·  " + conf + "  ·  " + truncate(r.reason, 90)];
    });
    if (checkRows.length === 0) para(doc, "No compliance checks recorded.", SLATE);
    else table(doc, checkRows, contentW, true);
    gap(doc, 12);

    // ---------- Violations ----------
    section(doc, "Violations (automated findings)");
    if (data.violations.length === 0) {
      para(doc, "No violations recorded by the automated screening.", GREEN);
    } else {
      const vRows: [string, string][] = data.violations.map(v => [v.ruleId, truncate(v.description, 100)]);
      table(doc, vRows, contentW, true);
    }
    gap(doc, 12);

    // ---------- Human review ----------
    section(doc, "Human Review Decisions");
    if (data.reviews.length === 0) {
      para(doc, "No human review actions recorded for this inspection.", SLATE);
    } else {
      data.reviews.forEach(r => {
        const line1 = r.decision + " — " + (r.reviewer?.name ?? "Unknown") + " · " + r.createdAt.toLocaleString("en-IN");
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a").text(line1, 48, doc.y, { width: contentW });
        let line2 = "";
        if (r.oldValue || r.newValue) line2 += (r.oldValue ?? "-") + " -> " + (r.newValue ?? "-") + "  ";
        if (r.notes) line2 += '"' + r.notes + '"';
        if (line2) {
          doc.font("Helvetica").fontSize(8.5).fillColor(SLATE).text(line2, 48, doc.y, { width: contentW });
        }
        doc.moveDown(0.4);
      });
    }
    gap(doc, 12);

    // ---------- Evidence images ----------
    section(doc, "Evidence Images");
    if (data.images.length === 0) {
      para(doc, "No images captured for this inspection.", SLATE);
    } else {
      const imgW = (contentW - 12) / 2;
      const x = 48;
      data.images.forEach(img => {
        try {
          const buf = readFileSync(path.join(getStorageRoot(), img.storageKey));
          doc.moveDown(0.5);
          const topBefore = doc.y;
          doc.image(buf, x, doc.y, { fit: [imgW, imgW * 0.75], align: "center" });
          doc.moveDown(0.2);
          doc.font("Helvetica").fontSize(7.5).fillColor(SLATE)
            .text("Image " + img.sequence + " — " + img.originalFilename, 48, doc.y, { width: contentW, align: "left" });
          doc.y = topBefore + imgW * 0.75 + 30;
        } catch {
          // image file missing — skip gracefully
        }
      });
    }
    gap(doc, 12);

    // ---------- Limitations ----------
    section(doc, "Limitations & Disclaimers");
    doc.font("Helvetica").fontSize(8.5).fillColor(SLATE);
    [
      "This report is an AI-assisted automated compliance screening. It does not constitute a legal certification of the package.",
      "Findings marked MANUAL REQUIRED (e.g., numeral height under Rule 7, clear-space under Rule 8, contrast under Rule 9) require calibrated physical measurement and cannot be concluded from photographs.",
      "OCR-based observations depend on image quality; a declaration not detected is not proof of absence unless image quality was sufficient to establish it.",
      "Human review decisions recorded above are shown separately from, and never replace, the original AI findings.",
      "The final determination is subject to authorized inspection/review by a Legal Metrology Officer.",
    ].forEach(t => {
      doc.fillColor(SLATE).text("• " + t, 48, doc.y, { width: contentW });
      doc.moveDown(0.2);
    });
    gap(doc, 14);

    // ---------- Audit ----------
    // Keep the audit block together: if it cannot fit on the current page, start a fresh one.
    if (doc.y + 150 > doc.page.maxY()) {
      doc.addPage();
    }
    section(doc, "Audit Information");
    para(doc, "Report generated at: " + new Date().toLocaleString("en-IN"), "#0f172a");
    para(doc, "Report format: PDF (server-side generation)", "#0f172a");
    para(doc, "Total review actions recorded: " + data.reviews.length, "#0f172a");

    // Closing note (single occurrence — avoids pdfkit per-page-stamping pitfalls)
    doc.moveDown(0.8);
    doc.moveTo(48, doc.y).lineTo(R, doc.y).lineWidth(0.5).strokeColor("#e2e5ea").stroke();
    doc.moveDown(0.3);
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(SLATE)
      .text("MetraScan — AI-assisted inspection system. Supports, never replaces, the Legal Metrology Officer.", 48, doc.y, { width: contentW, align: "center" });

    doc.end();
  });
}

function getStorageRoot(): string {
  const p = env.STORAGE_PATH;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}


function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(BRAND_BLUE).text(title.toUpperCase(), { width: doc.page.width - 96 });
  doc.moveDown(0.2);
  const y = doc.y;
  doc.moveTo(48, y).lineTo(doc.page.width - 48, y).lineWidth(0.5).strokeColor("#e2e5ea").stroke();
  doc.moveDown(0.5);
}

function table(doc: PDFKit.PDFDocument, rows: [string, string][], width: number, small = false) {
  const labelW = Math.min(160, width * 0.32);
  const valueW = width - labelW;
  const fs = small ? 7.5 : 8.5;
  rows.forEach(([label, value]) => {
    // Render each row as one flow-paragraph: label in bold inline, then value — pdfkit paginates naturally.
    doc.font("Helvetica-Bold").fontSize(fs).fillColor("#0f172a").text(label + "  ", 48, doc.y, { width: labelW, continued: true, lineBreak: false });
    doc.font("Helvetica").fillColor("#334155").text(value, 48 + labelW, doc.y, { width: valueW, indent: 0 });
    doc.moveDown(0.15);
  });
  doc.moveDown(0.4);
}

function para(doc: PDFKit.PDFDocument, text: string, color: string) {
  doc.font("Helvetica").fontSize(8.5).fillColor(color).text(text, 48, doc.y, { width: doc.page.width - 96 });
  doc.moveDown(0.3);
}

function gap(doc: PDFKit.PDFDocument, h: number) {
  doc.y += h;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export async function getReport(reportId: string, user: { sub: string; role: string }) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: { inspection: true, generatedBy: { select: { name: true } } },
  });
  if (!report) throw ApiError.notFound("Report not found");
  const access = canAccessInspection(user, report.inspection);
  if (!access.canView) throw ApiError.notFound("Report not found");

  return {
    id: report.id,
    inspectionId: report.inspectionId,
    inspectionNumber: report.inspection.inspectionNumber,
    format: report.format,
    storageKey: report.storageKey,
    generatedBy: report.generatedBy?.name ?? null,
    createdAt: report.createdAt,
  };
}

export async function getReportFile(reportId: string, user: { sub: string; role: string }) {
  const report = await getReport(reportId, user);
  if (!report.storageKey) throw ApiError.notFound("Report file not found");
  const buffer = await storage.read(report.storageKey);
  return { buffer, filename: "MetraScan-Report-" + report.inspectionNumber + ".pdf" };
}

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'INSPECTOR', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'UNDER_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('RETAIL', 'WHOLESALE', 'IMPORTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConsumerType" AS ENUM ('RETAIL', 'INDUSTRIAL', 'INSTITUTIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PASS', 'FAIL', 'REVIEW', 'NOT_APPLICABLE', 'MANUAL_REQUIRED');

-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('OCR', 'VISION', 'QR', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'INSPECTOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevokedToken" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspectorId" TEXT,
    "productId" TEXT,
    "packageType" "PackageType" NOT NULL DEFAULT 'UNKNOWN',
    "intendedConsumer" "ConsumerType" NOT NULL DEFAULT 'UNKNOWN',
    "inspectionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT,
    "notes" TEXT,
    "year" INTEGER NOT NULL,
    "overallResult" "ValidationStatus",
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionCounter" (
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "InspectionCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "InspectionImage" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'UPLOADED',
    "qualityScore" DOUBLE PRECISION,
    "ocrStatus" TEXT,
    "analysisStatus" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrResult" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "qualityReport" JSONB NOT NULL,
    "preprocessing" JSONB NOT NULL,
    "fullText" TEXT NOT NULL,
    "regionCount" INTEGER NOT NULL,
    "processingMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrRegion" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "bbox" JSONB NOT NULL,
    "poly" JSONB,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcrRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "brand" TEXT,
    "manufacturer" TEXT,
    "category" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "categorySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Declaration" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "imageId" TEXT,
    "field" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "correctedValue" TEXT,
    "correctionNote" TEXT,
    "correctedById" TEXT,
    "unit" TEXT,
    "currency" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "extractionConfidence" DOUBLE PRECISION,
    "detectionMethod" TEXT,
    "bbox" JSONB,
    "ocrRegionIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Declaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleNumber" TEXT NOT NULL,
    "subRule" TEXT,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requirement" TEXT NOT NULL,
    "scope" TEXT,
    "applicability" JSONB,
    "exceptions" JSONB,
    "requiredEvidence" JSONB,
    "validatorKey" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "declarationId" TEXT,
    "ruleVersionId" TEXT,
    "ruleId" TEXT NOT NULL,
    "status" "ValidationStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "validatorVersion" TEXT,
    "inputs" JSONB,
    "source" TEXT,
    "humanStatus" "ValidationStatus",
    "humanComment" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Violation" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "validationResultId" TEXT,
    "ruleId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "correctedByReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "imageId" TEXT,
    "kind" "EvidenceKind" NOT NULL,
    "bbox" JSONB,
    "snippet" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "ruleId" TEXT,
    "targetId" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "generatedById" TEXT,
    "format" "ReportFormat" NOT NULL DEFAULT 'PDF',
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RevokedToken_jti_key" ON "RevokedToken"("jti");

-- CreateIndex
CREATE INDEX "RevokedToken_userId_idx" ON "RevokedToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_inspectionNumber_key" ON "Inspection"("inspectionNumber");

-- CreateIndex
CREATE INDEX "Inspection_status_createdAt_idx" ON "Inspection"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Inspection_year_inspectionNumber_idx" ON "Inspection"("year", "inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionImage_storageKey_key" ON "InspectionImage"("storageKey");

-- CreateIndex
CREATE INDEX "InspectionImage_inspectionId_idx" ON "InspectionImage"("inspectionId");

-- CreateIndex
CREATE INDEX "OcrResult_imageId_idx" ON "OcrResult"("imageId");

-- CreateIndex
CREATE INDEX "OcrRegion_resultId_seq_idx" ON "OcrRegion"("resultId", "seq");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Declaration_inspectionId_field_key" ON "Declaration"("inspectionId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_ruleKey_key" ON "Rule"("ruleKey");

-- CreateIndex
CREATE INDEX "RuleVersion_ruleId_effectiveFrom_idx" ON "RuleVersion"("ruleId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ValidationResult_inspectionId_status_idx" ON "ValidationResult"("inspectionId", "status");

-- CreateIndex
CREATE INDEX "Violation_inspectionId_idx" ON "Violation"("inspectionId");

-- CreateIndex
CREATE INDEX "Evidence_inspectionId_kind_idx" ON "Evidence"("inspectionId", "kind");

-- CreateIndex
CREATE INDEX "Review_inspectionId_idx" ON "Review"("inspectionId");

-- CreateIndex
CREATE INDEX "Report_inspectionId_idx" ON "Report"("inspectionId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "RevokedToken" ADD CONSTRAINT "RevokedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionImage" ADD CONSTRAINT "InspectionImage_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrResult" ADD CONSTRAINT "OcrResult_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "InspectionImage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrRegion" ADD CONSTRAINT "OcrRegion_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "OcrResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "InspectionImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Declaration" ADD CONSTRAINT "Declaration_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_declarationId_fkey" FOREIGN KEY ("declarationId") REFERENCES "Declaration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationResult" ADD CONSTRAINT "ValidationResult_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Violation" ADD CONSTRAINT "Violation_validationResultId_fkey" FOREIGN KEY ("validationResultId") REFERENCES "ValidationResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { validateBody } from "../middleware/validate.js";
import { createInspectionSchema } from "../validators/inspectionSchemas.js";
import { uploadImages } from "../middleware/upload.js";
import {
  createInspectionController,
  listInspectionsController,
  getInspectionController,
} from "../controllers/inspectionController.js";
import {
  uploadImagesController,
  listImagesController,
  deleteImageController,
  reorderImagesController,
} from "../controllers/imageController.js";
import { analyzeController, getAnalysisController } from "../controllers/analysisController.js";
import {
  extractDeclarationsController,
  listDeclarationsController,
  updateDeclarationController,
} from "../controllers/declarationController.js";
import { getApplicabilityController } from "../controllers/applicabilityController.js";
import { runComplianceController, getComplianceController } from "../controllers/complianceController.js";
import { submitReviewController, getReviewHistoryController } from "../controllers/reviewController.js";
import { generateReportController } from "../controllers/reportController.js";

const router = Router();

// All inspection routes require authentication
router.use(requireAuth);

router.post("/", requireRole("INSPECTOR", "ADMIN"), validateBody(createInspectionSchema), createInspectionController);
router.get("/", listInspectionsController);
router.get("/:inspectionId", getInspectionController);
router.get("/:id/images", listImagesController);
router.post("/:id/images", requireRole("INSPECTOR", "ADMIN"), uploadImages, uploadImagesController);
router.delete("/:id/images/:imageId", requireRole("INSPECTOR", "ADMIN"), deleteImageController);
router.patch("/:id/images/reorder", requireRole("INSPECTOR", "ADMIN"), reorderImagesController);
router.post("/:id/analyze", requireRole("INSPECTOR", "ADMIN"), analyzeController);
router.get("/:id/analysis", getAnalysisController);
router.post("/:id/declarations/extract", requireRole("INSPECTOR", "ADMIN"), extractDeclarationsController);
router.get("/:id/declarations", listDeclarationsController);
router.patch("/:id/declarations/:declarationId", requireRole("INSPECTOR", "ADMIN"), updateDeclarationController);
router.get("/:id/applicability", getApplicabilityController);
router.post("/:id/compliance", requireRole("INSPECTOR", "ADMIN"), runComplianceController);
router.get("/:id/compliance", getComplianceController);
router.post("/:id/review", requireRole("INSPECTOR", "ADMIN", "REVIEWER"), submitReviewController);
router.get("/:id/review", getReviewHistoryController);
router.post("/:id/report", requireRole("INSPECTOR", "ADMIN", "REVIEWER"), generateReportController);

export default router;

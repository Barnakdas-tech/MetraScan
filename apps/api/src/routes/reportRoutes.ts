import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getReportController, downloadReportController, listReportsController } from "../controllers/reportController.js";

const router = Router();
router.use(requireAuth);
router.get("/", listReportsController);
router.get("/:id", getReportController);
router.get("/:id/download", downloadReportController);

export default router;

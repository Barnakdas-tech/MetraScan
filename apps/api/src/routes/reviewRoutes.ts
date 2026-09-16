import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { getReviewQueueController } from "../controllers/reviewController.js";

const router = Router();
router.use(requireAuth);

router.get("/queue", requireRole("REVIEWER", "ADMIN"), getReviewQueueController);

export default router;

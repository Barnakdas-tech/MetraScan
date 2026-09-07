import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { summaryController, recentController, violationsController, trendsController } from "../controllers/dashboardController.js";

const router = Router();
router.use(requireAuth);
router.get("/summary", summaryController);
router.get("/recent", recentController);
router.get("/violations", violationsController);
router.get("/trends", trendsController);

export default router;

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/http.js";
import { listAuditLogs } from "../services/auditService.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 50;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;

    const result = await listAuditLogs(req.user!, { page, pageSize, action, entityType });
    sendSuccess(res, result);
  })
);

export default router;

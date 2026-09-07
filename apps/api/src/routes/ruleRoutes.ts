import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getRules, getRuleById } from "../services/ruleService.js";

export const router = Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  const rules = getRules();
  res.json({ ok: true, data: rules });
});

router.get("/:ruleId", (req, res) => {
  const rule = getRuleById(req.params.ruleId);
  if (!rule) {
    res.status(404).json({ ok: false, error: { message: "Rule not found", code: "NOT_FOUND" } });
    return;
  }
  res.json({ ok: true, data: rule });
});

export default router;

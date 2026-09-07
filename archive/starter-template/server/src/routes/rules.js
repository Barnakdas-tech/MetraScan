import { Router } from "express";
import rules from "../../../legal/rules.json" with { type: "json" };
const router = Router();
router.get("/", (_req,res) => res.json(rules));
export default router;

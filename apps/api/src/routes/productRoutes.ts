import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listProductsController, getProductController } from "../controllers/productController.js";

const router = Router();
router.use(requireAuth);
router.get("/", listProductsController);
router.get("/:id", getProductController);

export default router;

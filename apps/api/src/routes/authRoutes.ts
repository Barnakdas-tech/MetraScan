import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validators/authSchemas.js";
import { registerController, loginController, meController, logoutController } from "../controllers/authController.js";

const router = Router();

router.post("/register", validateBody(registerSchema), registerController);
router.post("/login", validateBody(loginSchema), loginController);
router.post("/logout", requireAuth, logoutController);
router.get("/me", requireAuth, meController);

export default router;

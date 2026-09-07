import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { updateProfileSchema, updatePasswordSchema } from "../validators/userSchemas.js";
import { updateProfileController, updatePasswordController } from "../controllers/userController.js";
import { meController } from "../controllers/authController.js";

const router = Router();
router.use(requireAuth);

router.get("/me", meController);
router.patch("/me", validateBody(updateProfileSchema), updateProfileController);
router.post("/me/password", validateBody(updatePasswordSchema), updatePasswordController);

export default router;

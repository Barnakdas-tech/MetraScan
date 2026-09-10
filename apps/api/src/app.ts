import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import inspectionRoutes from "./routes/inspectionRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import { router as storageRoutes } from "./routes/storageRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import ruleRoutes from "./routes/ruleRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimit.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use("/api", apiLimiter);
  app.use(express.json({ limit: "2mb" }));
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const e = err as { type?: string; status?: number };
    if (e?.type === "entity.parse.failed" || e?.status === 400) {
      return void res.status(400).json({ success: false, error: { code: "BAD_REQUEST", message: "Request body is not valid JSON" } });
    }
    next(err);
  });

  app.use("/api/v1/health", healthRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/inspections", inspectionRoutes);
  app.use("/api/v1/storage", storageRoutes);
  app.use("/api/v1/reports", reportRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);
  app.use("/api/v1/products", productRoutes);
  app.use("/api/v1/rules", ruleRoutes);
  app.use("/api/v1/users", userRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

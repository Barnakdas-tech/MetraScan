import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRouter from "./routes/health.js";
import rulesRouter from "./routes/rules.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({limit:"10mb"}));
app.use("/api/health", healthRouter);
app.use("/api/rules", rulesRouter);

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`MetraScan API: http://localhost:${port}`));

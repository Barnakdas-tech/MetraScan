import dotenv from "dotenv";
import crypto from "node:crypto";
import path from "node:path";
import { z } from "zod";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  AI_TIMEOUT_MS: z.coerce.number().default(120000),
  // The shared secret MUST be provided by the environment. A repo-visible
  // default would let anyone who reads the code call the AI service directly.
  // In production a missing token is fatal; elsewhere a random per-process
  // value is generated so dev servers still run (they simply cannot talk to
  // the AI service until the operator sets a real shared token in both apps).
  AI_SERVICE_TOKEN: z.string().min(16).optional(),
  STORAGE_PATH: z.string().default("./storage"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (!env.AI_SERVICE_TOKEN) {
  if (env.NODE_ENV === "production") {
    // Fail closed: production must configure a real shared secret.
    console.error("AI_SERVICE_TOKEN is required in production");
    process.exit(1);
  }
  // Dev/test without explicit config: random per-process value. AI calls are
  // rejected until a matching token is configured on both services — the
  // point is that no repo-visible default ever makes the service callable.
  env.AI_SERVICE_TOKEN = crypto.randomBytes(24).toString("hex");
}

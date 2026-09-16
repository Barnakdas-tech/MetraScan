import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();
const server = app.listen(env.API_PORT, "0.0.0.0", () => {
  console.log(`MetraScan API listening on http://0.0.0.0:${env.API_PORT}`);
});

// Graceful shutdown
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}

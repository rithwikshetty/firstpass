export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { logger } = await import("./lib/logger");
  logger.info("app.startup", {
    runtime: process.env.NEXT_RUNTIME,
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.LOG_LEVEL || "info",
  });
}

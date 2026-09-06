import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const REQUIRED_ENV = ["APP_PASSWORD", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

// Resolve env exactly the way a production Next.js build does (.env,
// .env.production, .env.local, .env.production.local and process.env), so
// this check agrees with what the app will actually see.
const { combinedEnv } = loadEnvConfig(process.cwd(), false, {
  info: () => {},
  error: (...args) => console.error(...args),
});

const missing = REQUIRED_ENV.filter((name) => !combinedEnv[name]?.trim());

if (missing.length) {
  console.error(`Missing required production env: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Required production env is configured.");

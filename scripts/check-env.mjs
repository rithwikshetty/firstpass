import { existsSync, readFileSync } from "node:fs";

const REQUIRED_ENV = ["APP_PASSWORD", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"];

function loadLocalEnv() {
  if (!existsSync(".env")) return {};

  return Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [
        match[1],
        match[2].replace(/^['"]|['"]$/g, ""),
      ]),
  );
}

const localEnv = loadLocalEnv();
const missing = REQUIRED_ENV.filter(
  (name) => !(process.env[name] || localEnv[name])?.trim(),
);

if (missing.length) {
  console.error(`Missing required production env: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Required production env is configured.");

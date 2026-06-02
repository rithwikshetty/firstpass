export const REQUIRED_SERVER_ENV = [
  "APP_PASSWORD",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
] as const;

export function missingServerEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return REQUIRED_SERVER_ENV.filter((name) => !env[name]?.trim());
}

export function hasRequiredServerEnv(env: NodeJS.ProcessEnv = process.env) {
  return missingServerEnv(env).length === 0;
}

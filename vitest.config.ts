import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Dummy values so model SDK clients (constructed at import) don't throw and
    // the auth gate has a secret. Individual tests override as needed.
    env: {
      APP_PASSWORD: "test-password",
      ANTHROPIC_API_KEY: "sk-test-anthropic",
      OPENAI_API_KEY: "sk-test-openai",
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});

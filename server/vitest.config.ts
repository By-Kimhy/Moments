import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests run against the database in DATABASE_URL (see ../.env). Every test signs in with fresh
// random phone numbers, so they don't depend on or disturb existing data. The .env is loaded
// here, before any test module (and the Prisma client) is imported.
const envFile = path.resolve(import.meta.dirname, "../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    env: { NODE_ENV: "test" },
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});

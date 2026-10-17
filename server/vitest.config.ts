import { defineConfig } from "vitest/config";

// Tests run against the database in DATABASE_URL (see ../.env). Every test signs in with fresh
// random phone numbers, so they don't depend on or disturb existing data.
export default defineConfig({
  test: {
    env: { NODE_ENV: "test" },
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});

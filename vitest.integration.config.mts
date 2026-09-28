import { defineConfig } from "vitest/config";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pruebas de integración contra PostgreSQL real (base de datos de pruebas aparte).
 *   TEST_DATABASE_URL=postgresql://…/ridermex_test npm run test:integration
 * El script aplica las migraciones antes de correr.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://ridermex:ridermex@localhost:5432/ridermex_test?schema=public",
      APP_ENV: "development",
      APP_URL: "https://portal.test",
      HASH_SECRET: "integration-test-secret-0000000000",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: path.join(os.tmpdir(), "ridermex-int-storage"),
      AI_PROVIDER: "none",
      NOTIFY_PROVIDER: "none",
      NOTIFY_EACH_APPLICATION: "false",
    },
  },
});

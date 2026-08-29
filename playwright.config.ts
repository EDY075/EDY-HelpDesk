import { defineConfig, devices } from "@playwright/test";

const e2eEnvironment = {
  NODE_ENV: "test", API_HOST: "127.0.0.1", API_PORT: "8181", WEB_ORIGIN: "http://127.0.0.1:4273",
  DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:./storage/e2e/edy-helpdesk-e2e.db", LOG_LEVEL: "silent", PORTFOLIO_DEMO: "true",
  SESSION_IDLE_MINUTES: "30", SESSION_ABSOLUTE_HOURS: "12",
  INTEGRATION_SENTINEL_ENABLED: "false", INTEGRATION_SIEM_ENABLED: "false", INTEGRATION_ANALYTICS_ENABLED: "false",
  INTEGRATION_TIMEOUT_MS: "3000", INTEGRATION_MAX_ATTEMPTS: "5", INTEGRATION_BACKOFF_BASE_MS: "1000",
  VITE_API_PROXY_TARGET: "http://127.0.0.1:8181",
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: "storage/e2e/test-results",
  reporter: [["list"], ["html", { outputFolder: "storage/e2e/playwright-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4273",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: [
    { command: "npm run build:packages && npx concurrently -k -n API,WORKER \"npm run dev:api\" \"npm run dev:worker\"", url: "http://127.0.0.1:8181/api/v1/ready", reuseExistingServer: false, timeout: 120_000, env: e2eEnvironment },
    { command: "npm run dev -w @edy/web -- --port 4273 --strictPort", url: "http://127.0.0.1:4273/login", reuseExistingServer: false, timeout: 120_000, env: e2eEnvironment },
  ],
});

import { defineConfig, devices } from "@playwright/test";

// Always runs against the production build (served by tests/serve.mjs), never the dev server. One worker: shared machine.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 90_000,
  use: { baseURL: "http://localhost:4361/sentinel-anomaly-lab/" },
  webServer: {
    command: "npm run build && node tests/serve.mjs",
    url: "http://localhost:4361/sentinel-anomaly-lab/",
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});

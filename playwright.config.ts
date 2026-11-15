import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Fresh, isolated embedded database for every run; the demo seed is created on boot.
  webServer: {
    command: `rm -rf .data/e2e && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PGLITE_DATA_DIR: ".data/e2e", DEMO_AUTH_ENABLED: "true", SESSION_SECRET: "e2e-test-secret-0123456789abcdef0123456789" },
  },
});

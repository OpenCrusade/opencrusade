import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./tests/e2e/env";

/**
 * E2E config, v2 (2026-06).
 *
 * Auth is fully headless: `auth.setup.ts` exchanges the refresh tokens
 * in .env.local for access tokens and seeds the app's localStorage
 * session. No interactive Google sign-in anywhere.
 *
 * Specs run strictly in order against a dev server at E2E_BASE_URL
 * (default http://localhost:8471, started here if it is not running).
 * Accounts and the base URL come from .env.local; see tests/e2e/env.ts.
 */


export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000, // Sheets round-trips are slow; battle spec does dozens
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  // One retry absorbs transient network blips and Google 5xx answers. Specs are written to be retry-safe: unique
  // names per run, idempotent applies, cleanup collects every id.
  retries: 1,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["line"]],

  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true, // tolerate a self-signed dev certificate
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "e2e",
      testMatch: /specs\/.*\.spec\.ts$/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        // Default context = GM. Specs that need the player open a
        // second context explicitly via helpers.playerContext().
        storageState: "tests/e2e/.auth/gm.json",
      },
    },
  ],

  // The suite signs in with Google Sheets access, so it always runs
  // against a server in the default access mode, whatever .env.local
  // says, on the port in E2E_BASE_URL. Give the tests a different port
  // from your everyday dev server if that one uses per-file access.
  // reuseExistingServer makes this a no-op when one is already up.
  webServer: {
    command: "npm run dev",
    env: {
      VITE_GOOGLE_ACCESS: "sheets",
      DEV_PORT: new URL(BASE_URL).port || "8471",
    },
    url: BASE_URL,
    reuseExistingServer: true,
    ignoreHTTPSErrors: true,
    timeout: 30_000,
  },
});

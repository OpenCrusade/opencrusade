/**
 * Settings for the E2E suite, read from the shell environment or from
 * .env.local in the project root (the shell wins).
 *
 *   E2E_GM_EMAIL      Google account that creates the crusade.
 *   E2E_PLAYER_EMAIL  Google account that joins it.
 *   E2E_BASE_URL      Where the tests' own copy of the app is served.
 *                     Default http://localhost:8471. Playwright starts it
 *                     there, in the default access mode, if nothing is running.
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(DIRNAME, "../..");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadEnvLocal();

function email(name: string): string {
  // Empty when unset, so that listing the specs works without any
  // set-up. auth.setup.ts fails with a clear message before a real run.
  return (process.env[name] ?? "").trim().toLowerCase();
}

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8471";

export const GM_EMAIL = email("E2E_GM_EMAIL");
export const PLAYER_EMAIL = email("E2E_PLAYER_EMAIL");

/**
 * The name the app gives a player by default: the part of the email
 * address before the "@". Sheet tabs are named after it too.
 */
export const GM_NAME = GM_EMAIL.split("@")[0];
export const PLAYER_NAME = PLAYER_EMAIL.split("@")[0];

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

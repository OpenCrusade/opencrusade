/**
 * Shared helpers for the E2E suite.
 */

import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

export { BASE_URL, GM_EMAIL, PLAYER_EMAIL, GM_NAME, PLAYER_NAME, escapeRegExp } from "./env";

const AUTH_DIR = path.resolve(DIRNAME, ".auth");
export const SHARED_STATE_FILE = path.join(AUTH_DIR, "shared-state.json");

// ── Cross-spec state (crusade id, roster ids, unit names…) ─────────

export interface SharedState {
  crusadeName?: string;
  crusadeId?: string;
  gmRosterId?: string;
  playerRosterId?: string;
  battleId?: string;
  gmCharacterUnit?: string;
  gmSquadUnit?: string;
  playerUnit?: string;
  /** The standing fixture spreadsheet (GM-owned, shared with the player). */
  fixtureId?: string;
}

export function readShared(): SharedState {
  try {
    return JSON.parse(fs.readFileSync(SHARED_STATE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

export function writeShared(patch: Partial<SharedState>): void {
  const merged = { ...readShared(), ...patch };
  fs.writeFileSync(SHARED_STATE_FILE, JSON.stringify(merged, null, 2));
}


// ── Second browser context (player account) ────────────────────────

export async function playerContext(
  browser: Browser,
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: path.join(AUTH_DIR, "player.json"),
    ignoreHTTPSErrors: true,
  });
}

// ── Direct Sheets API access (assertions) ──────────────────────────

function tokenFor(account: "gm" | "player"): string {
  const raw = JSON.parse(
    fs.readFileSync(path.join(AUTH_DIR, `${account}-token.json`), "utf-8"),
  );
  return raw.accessToken;
}

/** Computed cell values of a range, read straight from Google. */
export async function sheetValues(
  account: "gm" | "player",
  spreadsheetId: string,
  range: string,
): Promise<(string | number | boolean)[][]> {
  // Google allows about 60 reads a minute per account, shared with the
  // app under test, so a refused read is retried after a pause, the
  // same way the app itself does.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${tokenFor(account)}` } },
    );
    if (res.status !== 429 || attempt >= 4) break;
    await new Promise((r) => setTimeout(r, [5000, 10000, 20000, 30000][attempt]));
  }
  if (!res.ok) throw new Error(`sheet read ${range} → ${res.status}`);
  return ((await res.json()) as { values?: (string | number | boolean)[][] })
    .values ?? [];
}

export function fixtureUrl(): string {
  const { fixtureId } = readShared();
  if (!fixtureId) throw new Error("fixtureId missing, auth setup must run first");
  return `https://docs.google.com/spreadsheets/d/${fixtureId}/edit`;
}

// ── Page-level conveniences ─────────────────────────────────────────

/** Wait for the app to be interactive on a page (header rendered). */
export async function appReady(page: Page) {
  await expect(page.getByText("OpenCrusade").first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function clickButton(page: Page, name: string | RegExp) {
  const btn = page.getByRole("button", { name });
  await expect(btn).toBeEnabled({ timeout: 20_000 });
  await btn.click();
}

/** Unique-per-run tag so repeated runs never collide. */
export function newRunTag(): string {
  return Date.now().toString(36);
}

/**
 * Wait until background saves to Google Sheets have finished. Each
 * test runs in a throwaway browser profile, so an edit still being
 * saved when the test ends would be lost with it.
 */
export async function waitForSynced(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveText(
    /All changes saved/i,
    { timeout: 60_000 },
  );
}

const openHandled = new WeakSet<Page>();

/**
 * Go to a crusade page. A crusade this browser hasn't opened before
 * asks "Open this crusade?" first; press it whenever it appears.
 */
export async function gotoCrusade(page: Page, path: string): Promise<void> {
  if (!openHandled.has(page)) {
    openHandled.add(page);
    await page.addLocatorHandler(
      page.getByRole("button", { name: "Open this crusade" }),
      async (button) => {
        await button.click().catch(() => undefined);
      },
    );
  }
  await page.goto(path);
}

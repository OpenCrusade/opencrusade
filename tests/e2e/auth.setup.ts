/**
 * Auth setup, no browser, no OAuth UI.
 *
 * Exchanges the refresh tokens in .env.local (captured once via
 * scripts/capture-refresh-tokens.mjs) for fresh access tokens,
 * then writes Playwright storageState files whose localStorage carries
 * the app's Zustand session (`opencrusade-session`).
 *
 * Also wipes the fixture spreadsheet (SHEETS_FIXTURE_ID) back to one
 * blank tab. The app cannot share or delete spreadsheets (no Drive
 * permission), so the suite reuses one sheet that the GM test account
 * owns and has shared with the player test account by hand, once.
 */

import { test as setup } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { BASE_URL, GM_EMAIL, PLAYER_EMAIL } from "./env";

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

const AUTH_DIR = path.resolve(DIRNAME, ".auth");

const SCOPE_SPREADSHEETS = "https://www.googleapis.com/auth/spreadsheets";

/** The app's own web OAuth client, the one the refresh tokens belong to. */
function clientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_WEB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID / GOOGLE_WEB_CLIENT_SECRET missing from .env.local",
    );
  }
  return { clientId, clientSecret };
}

interface MintedSession {
  accessToken: string;
  expiresAt: number;
  scopes: string[];
  user: { googleId: string; email: string; displayName: string };
}

async function mintSession(refreshToken: string): Promise<MintedSession> {
  const { clientId, clientSecret } = clientCreds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${await res.text()}`);
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  });
  if (!ui.ok) throw new Error(`userinfo failed: ${ui.status}`);
  const u = (await ui.json()) as {
    sub: string;
    email: string;
    name?: string;
  };

  const scopes = body.scope.split(" ").filter(Boolean);
  if (!scopes.includes(SCOPE_SPREADSHEETS)) {
    throw new Error("refresh token lacks the spreadsheets scope, re-run the capture script");
  }

  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in - 60) * 1000,
    scopes,
    user: { googleId: u.sub, email: u.email, displayName: u.name ?? u.email.split("@")[0] },
  };
}

function storageState(session: MintedSession) {
  const zustand = {
    state: {
      user: session.user,
      session: {
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        scopes: session.scopes,
      },
      sheetsGrantedBefore: true,
    },
    version: 0,
  };
  return {
    cookies: [],
    origins: [
      {
        origin: BASE_URL,
        localStorage: [
          {
            name: "opencrusade-session",
            value: JSON.stringify(zustand),
          },
        ],
      },
    ],
  };
}

setup("mint sessions for both test accounts", async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const accounts = [
    {
      label: "gm",
      env: "GOOGLE_GM_REFRESH_TOKEN",
      expectEmail: GM_EMAIL,
    },
    {
      label: "player",
      env: "GOOGLE_PLAYER_REFRESH_TOKEN",
      expectEmail: PLAYER_EMAIL,
    },
  ];

  for (const account of accounts) {
    const refreshToken = process.env[account.env];
    if (!refreshToken) {
      throw new Error(
        `${account.env} missing from .env.local, run scripts/capture-refresh-tokens.mjs`,
      );
    }
    if (!account.expectEmail) {
      throw new Error(
        `E2E_${account.label.toUpperCase()}_EMAIL missing from .env.local`,
      );
    }
    const session = await mintSession(refreshToken);
    if (session.user.email.toLowerCase() !== account.expectEmail) {
      throw new Error(
        `${account.label}: token belongs to ${session.user.email}, expected ${account.expectEmail}`,
      );
    }
    const out = path.join(AUTH_DIR, `${account.label}.json`);
    fs.writeFileSync(out, JSON.stringify(storageState(session), null, 2));
    // Also save the raw access token for direct Sheets API calls in
    // specs (assertions).
    fs.writeFileSync(
      path.join(AUTH_DIR, `${account.label}-token.json`),
      JSON.stringify(
        { accessToken: session.accessToken, user: session.user },
        null,
        2,
      ),
    );
    console.log(
      `[auth] ${account.label}: session minted for ${session.user.email}`,
    );
  }

  // ── Wipe the fixture spreadsheet to a single blank tab ──────────
  const fixtureId = process.env.SHEETS_FIXTURE_ID;
  if (!fixtureId) {
    throw new Error(
      "SHEETS_FIXTURE_ID missing from .env.local, a spreadsheet owned by " +
        "the GM test account and shared (Editor) with the player test account.",
    );
  }
  const gmToken = JSON.parse(
    fs.readFileSync(path.join(AUTH_DIR, "gm-token.json"), "utf-8"),
  ).accessToken as string;
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${fixtureId}`;
  const headers = {
    Authorization: `Bearer ${gmToken}`,
    "Content-Type": "application/json",
  };
  const meta = (await (
    await fetch(`${api}?fields=sheets.properties.sheetId`, { headers })
  ).json()) as { sheets: { properties: { sheetId: number } }[] };
  // One request per tab: deleting view pages and the data tabs their
  // formulas point at in a single batch makes Sheets answer 500.
  const blank = 800_000_000 + Math.floor(Math.random() * 1_000_000);
  const batch = async (requests: unknown[]) => {
    const res = await fetch(`${api}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ requests }),
    });
    if (!res.ok) throw new Error(`fixture wipe failed: ${await res.text()}`);
  };
  await batch([
    { addSheet: { properties: { sheetId: blank, title: `blank-${blank}` } } },
  ]);
  for (const s of meta.sheets) {
    await batch([{ deleteSheet: { sheetId: s.properties.sheetId } }]);
  }
  fs.writeFileSync(
    path.join(AUTH_DIR, "shared-state.json"),
    JSON.stringify({ fixtureId }, null, 2),
  );
});

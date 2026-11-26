/**
 * Silent access-token refresh.
 *
 * Implicit-flow tokens die after ~1 h. Google remembers the user's
 * consent server-side, so a returning user can usually re-acquire a
 * token with `prompt: ''` and no visible UI (the GIS popup opens and
 * closes itself, or never appears when the browser satisfies the flow
 * from the active Google session).
 *
 * This module is the non-React counterpart to useAuth's
 * `requestSheetsAccess`, callable from plain code (sheets.ts) when a
 * request hits an expired token. It can still fail: no active Google
 * session, popup blocked outside a user gesture, consent revoked. On
 * failure we return false and the existing "Reconnect" banner
 * remains the fallback.
 */

import type { TokenResponse } from "@react-oauth/google";
import { useAppStore } from "@/stores/app-store";
import { ESCALATED_SCOPE, adoptRenewedToken, getGoogleClientId } from "./auth";
import { INCLUDE_GRANTED } from "./scopes";

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface GisTokenClient {
  requestAccessToken: (config?: { prompt?: string }) => void;
}

interface GisOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    prompt: string;
    login_hint?: string;
    include_granted_scopes?: boolean;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (err: { type?: string }) => void;
  }) => GisTokenClient;
}

/** Read the Google Identity Services client without augmenting Window. */
function getGisOAuth2(): GisOAuth2 | undefined {
  return (
    window as unknown as {
      google?: { accounts?: { oauth2?: GisOAuth2 } };
    }
  ).google?.accounts?.oauth2;
}

const REFRESH_TIMEOUT_MS = 12_000;
/** After a failed attempt, don't try again for this long, stops a
 *  30 s poll from repeatedly poking a blocked popup. */
const FAILURE_COOLDOWN_MS = 60_000;

let inFlight: Promise<boolean> | null = null;

/** The tab is the one in view and its window has focus. */
export function pageIsActive(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}
let lastFailureAt = 0;

/**
 * Attempt a silent token refresh. Single-flight: concurrent callers
 * share one attempt. Returns true when the store now holds a fresh
 * token with Sheets access.
 */
export function trySilentTokenRefresh(): Promise<boolean> {
  if (inFlight) return inFlight;
  // Google's window would open over whatever the person is doing in
  // another tab. Wait until they come back to this one (useAuth renews
  // then); no cooldown, so that renewal isn't held up.
  if (!pageIsActive()) return Promise.resolve(false);

  const state = useAppStore.getState();
  // Nothing to refresh into: never signed in, or Sheets never granted
  // (a silent request would pop a consent screen, never do that
  // outside an explicit user action).
  if (!state.user || !state.session || !state.sheetsGrantedBefore) {
    return Promise.resolve(false);
  }
  if (Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS) {
    return Promise.resolve(false);
  }

  const email = state.user.email;
  const oauth2 = getGisOAuth2();
  const clientId = getGoogleClientId();
  if (!oauth2 || !clientId) return Promise.resolve(false);

  inFlight = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (!ok) lastFailureAt = Date.now();
      inFlight = null;
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), REFRESH_TIMEOUT_MS);

    try {
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: ESCALATED_SCOPE,
        prompt: "",
        // Ask for the signed-in account, not whichever Google session
        // the browser considers default.
        login_hint: email,
        include_granted_scopes: INCLUDE_GRANTED,
        callback: (response) => {
          clearTimeout(timer);
          if (response.error || !response.access_token) {
            console.warn("[token-refresh] silent refresh failed:", response.error);
            finish(false);
            return;
          }
          void adoptRenewedToken(response as unknown as TokenResponse).then(finish);
        },
        error_callback: (err) => {
          clearTimeout(timer);
          console.warn("[token-refresh] silent refresh error:", err?.type);
          finish(false);
        },
      });
      client.requestAccessToken({ prompt: "" });
    } catch (err) {
      clearTimeout(timer);
      console.warn("[token-refresh] GIS unavailable:", err);
      finish(false);
    }
  });

  return inFlight;
}

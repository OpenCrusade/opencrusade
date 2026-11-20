/**
 * GIS (Google Identity Services) auth facade.
 *
 * Single responsibility: wrap @react-oauth/google's `useGoogleLogin` so
 * the rest of the app doesn't import from it directly. Implements the
 * incremental-authorization pattern from spec.md FR-013 and
 * research-drive-consent.md § "Incremental authorization":
 *
 *   - Sign-in requests ONLY identity scopes (`openid email`).
 *   - `spreadsheets` is requested LATER, when the user creates or
 *     opens a crusade, via `requestSheetsAccess()`.
 *
 * Tokens are short-lived (~1 hour) by design, implicit flow doesn't
 * return refresh tokens. When a token expires the user re-signs in.
 * That's acceptable for a frontend-only app with no server to hold
 * refresh tokens securely.
 */

import type { TokenResponse } from "@react-oauth/google";
import { CRUSADE_SCOPES, INITIAL_SCOPES } from "./scopes";
import { useAppStore } from "@/stores/app-store";
import type { GoogleUser } from "@/types";

const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

interface UserInfoResponse {
  sub: string;
  email: string;
  /** Only present if `profile` was granted, the app does not request it. */
  name?: string;
  picture?: string;
}

/**
 * Fetch the signed-in user's identity from Google's userinfo endpoint.
 * Implicit flow returns an opaque access token, not a JWT, so we need
 * this round-trip to learn who signed in.
 */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUser> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as UserInfoResponse;
  return {
    googleId: body.sub,
    email: body.email,
    displayName: body.name ?? body.email.split("@")[0],
  };
}

/** Initial sign-in scope set, identity only. */
export const SIGN_IN_SCOPE = INITIAL_SCOPES.join(" ");

/** Identity plus Google Sheets, requested when a crusade is created or opened. */
export const ESCALATED_SCOPE = [...INITIAL_SCOPES, ...CRUSADE_SCOPES].join(" ");

/**
 * Take a token from a reconnect or silent renewal into the session,
 * but only if it belongs to the account that is signed in here. With
 * several Google accounts in one browser, Google can hand back a token
 * for a different one; using it would save this user's data with
 * someone else's access.
 */
export async function adoptRenewedToken(token: TokenResponse): Promise<boolean> {
  const current = useAppStore.getState().user;
  if (!current) return false;
  let who: GoogleUser;
  try {
    who = await fetchUserInfo(token.access_token);
  } catch {
    return false;
  }
  if (who.googleId !== current.googleId) {
    useAppStore.getState().setWrongAccount(true);
    return false;
  }
  useAppStore.getState().updateScopes(token);
  return true;
}

/**
 * Withdraw this app's Google permission entirely. Google forgets the
 * grant, so the token stops working at once and the next sign-in asks
 * for permission again.
 */
export function revokeGoogleAccess(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    const oauth2 = (
      window as unknown as {
        google?: { accounts?: { oauth2?: { revoke?: (t: string, done: () => void) => void } } };
      }
    ).google?.accounts?.oauth2;
    if (!oauth2?.revoke) return resolve();
    const timer = setTimeout(resolve, 5000);
    oauth2.revoke(accessToken, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * The Google Client ID from VITE_GOOGLE_CLIENT_ID.
 *
 * Reads at module-load time so misconfiguration surfaces early. If
 * missing in dev, we log a clear message; in production builds the
 * placeholder will at least let the app boot and surface the error to
 * the user via the sign-in button instead of crashing.
 */
export function getGoogleClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!id || id.includes("your-client-id")) {
    // Helpful dev-time message; not thrown so the app still boots.
    console.warn(
      "[auth] VITE_GOOGLE_CLIENT_ID is not configured. Sign-in will fail. " +
        "See the README for setup.",
    );
    return "";
  }
  return id;
}

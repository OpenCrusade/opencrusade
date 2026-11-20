import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GoogleUser } from "@/types";
import type { TokenResponse } from "@react-oauth/google";
import { SCOPE_STORAGE } from "@/lib/google/scopes";

/**
 * App-level state. Persisted to localStorage so a reload doesn't drop
 * the user back to the sign-in screen, the access token is still
 * valid for ~1 hour from when GIS issued it.
 *
 * NOT persisted: anything Dexie owns (crusades, rosters, sync state).
 */

interface SessionToken {
  accessToken: string;
  /** Epoch ms when this token expires. */
  expiresAt: number;
  /** Granted scopes as returned by Google (space-delimited in response, normalised to array here). */
  scopes: string[];
}

export interface AppState {
  user: GoogleUser | null;
  session: SessionToken | null;
  /**
   * True once the user has EVER granted Google Sheets access on this
   * browser. Google remembers the grant server-side, so subsequent
   * requests are consent-free, this flag tells us it's safe (and
   * necessary) to re-request Sheets access after a fresh sign-in,
   * instead of treating the user as a first-timer.
   */
  sheetsGrantedBefore: boolean;
  /**
   * The last permission request came back WITHOUT Google Sheets,
   * the user left its checkbox unticked on Google's consent screen
   * (it is unticked by default). Drives a banner explaining the fix.
   */
  sheetsDeclined: boolean;
  /**
   * The last reconnect came back for a DIFFERENT Google account than
   * the one signed in here. The token was thrown away; a banner asks
   * the user to pick the right account.
   */
  wrongAccount: boolean;
  /**
   * Google account whose data is saved on this device. Kept across
   * sign-out so that a DIFFERENT person signing in gets a clean device
   * instead of the last person's campaigns.
   */
  deviceOwnerId: string | null;

  // ── Actions ──────────────────────────────────────────────────
  setSession: (user: GoogleUser, token: TokenResponse) => void;
  updateScopes: (token: TokenResponse) => void;
  setWrongAccount: (wrong: boolean) => void;
  clearSession: () => void;
  /** Sign out and forget the Sheets grant (used after revoking it). */
  forgetGrant: () => void;
}

function tokenToSession(token: TokenResponse): SessionToken {
  return {
    accessToken: token.access_token,
    // Token's `expires_in` is in seconds. Subtract 60 s buffer so we
    // treat it as expired slightly early.
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
    scopes: token.scope.split(" ").filter(Boolean),
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      sheetsGrantedBefore: false,
      sheetsDeclined: false,
      wrongAccount: false,
      deviceOwnerId: null,

      setSession: (user, token) =>
        set((state) => {
          const session = tokenToSession(token);
          return {
            user,
            session,
            wrongAccount: false,
            deviceOwnerId: user.googleId,
            sheetsGrantedBefore:
              state.sheetsGrantedBefore ||
              session.scopes.includes(SCOPE_STORAGE),
          };
        }),

      updateScopes: (token) =>
        set((state) => {
          if (!state.session) return state;
          const session = tokenToSession(token);
          const granted = session.scopes.includes(SCOPE_STORAGE);
          return {
            session,
            sheetsGrantedBefore: state.sheetsGrantedBefore || granted,
            sheetsDeclined: !granted,
            wrongAccount: false,
          };
        }),

      setWrongAccount: (wrong) => set({ wrongAccount: wrong }),

      // Deliberately keeps sheetsGrantedBefore, Google still remembers
      // the grant; the next sign-in can silently re-acquire it.
      clearSession: () =>
        set({ user: null, session: null, sheetsDeclined: false, wrongAccount: false }),

      forgetGrant: () =>
        set({
          user: null,
          session: null,
          sheetsDeclined: false,
          wrongAccount: false,
          sheetsGrantedBefore: false,
          deviceOwnerId: null,
        }),
    }),
    {
      name: "opencrusade-session",
      storage: createJSONStorage(() => localStorage),
      // A token that has run out is no use to the app, so don't leave
      // it lying in storage: blank it as soon as the app next loads.
      onRehydrateStorage: () => (state) => {
        if (state?.session && state.session.expiresAt <= Date.now()) {
          useAppStore.setState({
            session: { ...state.session, accessToken: "" },
          });
        }
      },
    },
  ),
);

// ── Selectors ──────────────────────────────────────────────────

/**
 * Signed in means we know who the user is. Google's access only lasts
 * about an hour at a time; when it lapses the user stays signed in and
 * is asked to reconnect (see isSessionExpired), rather than being
 * thrown back to the sign-in page.
 */
export function isSignedIn(state: AppState): boolean {
  return state.user !== null && state.session !== null;
}

export function isSessionExpired(state: AppState): boolean {
  return state.session !== null && state.session.expiresAt <= Date.now();
}

export function hasScope(state: AppState, scope: string): boolean {
  return state.session?.scopes.includes(scope) ?? false;
}

export function getAccessToken(state: AppState): string | null {
  if (!state.session) return null;
  if (state.session.expiresAt <= Date.now()) return null;
  return state.session.accessToken;
}

import { useEffect, useState } from "react";
import { trySilentTokenRefresh } from "@/lib/google/token-refresh";
import { useCallback } from "react";
import { useGoogleLogin, googleLogout } from "@react-oauth/google";
import { useAppStore, isSignedIn, isSessionExpired } from "@/stores/app-store";
import {
  ESCALATED_SCOPE,
  SIGN_IN_SCOPE,
  adoptRenewedToken,
  fetchUserInfo,
  revokeGoogleAccess,
} from "@/lib/google/auth";
import { INCLUDE_GRANTED, SCOPE_STORAGE } from "@/lib/google/scopes";
import { wipeLocalData } from "@/lib/device";
import { useToasts } from "@/stores/toasts";

/**
 * Public auth hook. The Landing page, Header, and ConsentRouter call
 * this, they should NOT import from @react-oauth/google directly.
 *
 * Scope strategy:
 *   - FIRST-TIME sign-in requests identity only (openid email).
 *     Google Sheets access is asked for later, when a crusade is
 *     created or opened, behind the pre-consent explainer.
 *   - RETURNING sign-in (sheetsGrantedBefore): tokens expire after ~1 h
 *     and a fresh identity-only token would break every Sheets call.
 *     Google remembers the grant, so we request the escalated scope
 *     set up-front, no extra consent screen is shown.
 *   - Mid-session expiry: `needsReconnect` flips true; the Header
 *     shows a Reconnect button wired to `requestSheetsAccess`.
 */
export function useAuth() {
  const {
    user,
    session,
    sheetsGrantedBefore,
    sheetsDeclined,
    setSession,
    wrongAccount,
    clearSession,
    forgetGrant,
  } = useAppStore();

  const signedIn = useAppStore(isSignedIn);
  const [signInError, setSignInError] = useState<string | null>(null);
  const hasSheetsScope = session?.scopes.includes(SCOPE_STORAGE) ?? false;

  /** Signed in, has used Sheets before, but the current token lacks the
   *  scope (e.g. token refreshed identity-only). UI should surface a
   *  reconnect affordance. */
  // Google's access lasts about an hour. Shortly before it lapses, try
  // to renew it without bothering the user; if the browser won't allow
  // that, the reconnect banner appears the moment it does lapse.
  const expiresAt = session?.expiresAt ?? 0;
  // The expiry time for which the "lapsed" timer has fired.
  const [lapsedFor, setLapsedFor] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const now = Date.now();
    const timers = [
      setTimeout(() => void trySilentTokenRefresh(), Math.max(0, expiresAt - now - 5 * 60_000)),
      setTimeout(() => setLapsedFor(expiresAt), Math.max(0, expiresAt - now) + 500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [expiresAt]);
  const expired = expiresAt > 0 && lapsedFor === expiresAt;

  const needsReconnect =
    signedIn && sheetsGrantedBefore && (!hasSheetsScope || expired);

  const signIn = useGoogleLogin({
    flow: "implicit",
    include_granted_scopes: INCLUDE_GRANTED,
    // Returning users re-acquire the Sheets scope in the same popup;
    // first-timers see the minimal identity-only consent.
    scope: sheetsGrantedBefore ? ESCALATED_SCOPE : SIGN_IN_SCOPE,
    onSuccess: async (token) => {
      try {
        const userInfo = await fetchUserInfo(token.access_token);
        // Someone else used this device before: start them clean, so
        // one person never sees another's campaigns.
        const owner = useAppStore.getState().deviceOwnerId;
        if (owner && owner !== userInfo.googleId) await wipeLocalData();
        setSignInError(null);
        setSession(userInfo, token);
      } catch (err) {
        console.error("[auth] sign-in could not be completed", err);
        clearSession();
        setSignInError(
          "Google signed you in, but the app couldn't confirm who you are. Check your connection and try again.",
        );
      }
    },
    onError: (err) => {
      console.error("[auth] sign-in failed", err.error);
      setSignInError(
        err.error === "access_denied"
          ? "Sign-in was cancelled on Google's screen. Nothing was shared."
          : "Google couldn't sign you in. Try again.",
      );
    },
    onNonOAuthError: (err) => {
      setSignInError(
        err.type === "popup_failed_to_open"
          ? "Your browser blocked Google's sign-in window. Allow pop-ups for this site and try again."
          : err.type === "popup_closed"
            ? "The Google window was closed before sign-in finished. Try again when you're ready."
            : "Google's sign-in couldn't start. Check your connection and try again.",
      );
    },
  });

  const requestSheetsAccess = useGoogleLogin({
    flow: "implicit",
    include_granted_scopes: INCLUDE_GRANTED,
    scope: ESCALATED_SCOPE,
    // The user has already authenticated; this is just a scope upgrade.
    // `prompt: ''` lets Google skip the account chooser if there's one
    // active session.
    prompt: "",
    // Ask for the signed-in account; the result is checked again in
    // adoptRenewedToken in case the user picks another.
    hint: user?.email,
    onSuccess: (token) => {
      void adoptRenewedToken(token);
    },
    onError: (err) => {
      console.error("[auth] Sheets access request failed", err.error);
      useToasts.getState().show(
        "Google didn't grant access to Google Sheets. Try again, and tick the Google Sheets box on Google's screen.",
        "bad",
      );
    },
    onNonOAuthError: (err) => {
      useToasts.getState().show(
        err.type === "popup_failed_to_open"
          ? "Your browser blocked Google's window. Allow pop-ups for this site and try again."
          : "The Google window was closed before it finished. Try again when you're ready.",
        "bad",
      );
    },
  });

  const signOut = useCallback(() => {
    googleLogout();
    clearSession();
  }, [clearSession]);

  /** Sign out AND withdraw the app's Google permission. */
  const disconnect = useCallback(async () => {
    // Withdrawing needs a live sign-in. If this one has run out, try
    // to renew it quietly first.
    if (isSessionExpired(useAppStore.getState())) await trySilentTokenRefresh();
    const state = useAppStore.getState();
    const token = isSessionExpired(state) ? null : state.session?.accessToken;
    if (token) await revokeGoogleAccess(token);
    else {
      useToasts.getState().show(
        "Signed out, but your Google sign-in had expired so the permission could not be withdrawn here. Remove OpenCrusade in your Google account, under Security, to finish.",
        "bad",
      );
    }
    googleLogout();
    forgetGrant();
  }, [forgetGrant]);

  return {
    user,
    signedIn,
    hasSheetsScope,
    needsReconnect,
    /** Asked for Sheets but the user left Google's checkbox unticked. */
    sheetsDeclined: signedIn && sheetsDeclined && !hasSheetsScope,
    signIn,
    signInError,
    signOut,
    disconnect,
    wrongAccount: signedIn && wrongAccount,
    requestSheetsAccess,
  };
}

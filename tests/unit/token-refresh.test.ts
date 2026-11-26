import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google/auth", () => ({
  ESCALATED_SCOPE: "openid email sheets",
  getGoogleClientId: () => "test-client",
  adoptRenewedToken: vi.fn(async () => true),
}));

import { useAppStore } from "@/stores/app-store";
import { trySilentTokenRefresh } from "@/lib/google/token-refresh";

const initTokenClient = vi.fn(() => ({ requestAccessToken: vi.fn() }));

function setVisibility(state: "visible" | "hidden", focused: boolean) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(state);
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
}

describe("trySilentTokenRefresh", () => {
  beforeEach(() => {
    (window as unknown as { google: unknown }).google = { accounts: { oauth2: { initTokenClient } } };
    useAppStore.setState({
      user: { googleId: "g1", email: "player@example.com", displayName: "Player" },
      session: { accessToken: "old", expiresAt: Date.now() - 1000, scopes: [] },
      sheetsGrantedBefore: true,
    } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    initTokenClient.mockClear();
  });

  it("never opens Google's window from a tab in the background", async () => {
    setVisibility("hidden", false);
    expect(await trySilentTokenRefresh()).toBe(false);
    setVisibility("visible", false);
    expect(await trySilentTokenRefresh()).toBe(false);
    expect(initTokenClient).not.toHaveBeenCalled();
  });

  it("renews once the tab is in view and focused", () => {
    setVisibility("visible", true);
    void trySilentTokenRefresh();
    expect(initTokenClient).toHaveBeenCalledTimes(1);
  });
});

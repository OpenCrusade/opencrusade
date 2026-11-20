import { useSyncExternalStore } from "react";

/**
 * Live navigator.onLine. `true` doesn't guarantee reachability (only
 * that a network interface exists), but `false` is a reliable "you're
 * definitely offline" signal, good enough for a banner.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
  );
}

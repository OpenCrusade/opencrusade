import {
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

/**
 * The canonical Dexie-first query pattern.
 *
 * Per research-drive-performance.md § "The local-first architecture":
 * every read returns from Dexie immediately, then schedules a background
 * Drive revalidation. The UI never blocks on a network round-trip.
 *
 * After the revalidate completes, we re-read Dexie and push the fresh
 * value into the TanStack Query cache via `setQueryData`. This makes
 * other users' Drive-side changes surface in the UI without manual
 * refresh, while still being instant on first paint.
 */
export interface DexieQueryArgs<T> {
  queryKey: readonly unknown[];
  fromDexie: () => Promise<T | undefined>;
  /** Fired after the Dexie read resolves. Phase 3+. */
  revalidate?: () => void | Promise<void>;
  /** Optional: extra TanStack Query options (enabled, select, etc.). */
  options?: Omit<
    UseQueryOptions<T | undefined, Error, T | undefined>,
    "queryKey" | "queryFn"
  >;
}

export function useDexieQuery<T>({
  queryKey,
  fromDexie,
  revalidate,
  options,
}: DexieQueryArgs<T>) {
  const queryClient = useQueryClient();

  return useQuery<T | undefined, Error, T | undefined>({
    queryKey,
    queryFn: async () => {
      const value = await fromDexie();
      if (revalidate) {
        // Schedule out-of-band so the first paint isn't blocked. After
        // revalidate finishes, re-read Dexie and push the result into
        // the TQ cache so the UI updates. setQueryData notifies
        // observers without re-running queryFn, no risk of an
        // invalidation loop.
        queueMicrotask(async () => {
          try {
            await Promise.resolve(revalidate());
            const fresh = await fromDexie();
            queryClient.setQueryData(queryKey, fresh);
          } catch {
            // Intentional: revalidation failure must never break a read.
          }
        });
      }
      return value;
    },
    ...options,
  });
}
